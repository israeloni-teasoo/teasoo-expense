import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  DEFAULT_ORG_SETTINGS,
  allocations,
  departments,
  expenseCategories,
  organisations,
  projects,
  users,
  type OrgSettings,
  type Role,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { generatePassword, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { config, googleEnabled, isCompanyEmail } from "@/lib/config";
import { credentialsEmail, sendEmail } from "@/lib/email";
import { audit, diff } from "@/lib/audit";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { getOrg } from "./org";

function requireAdmin(actor: CurrentUser, perm: "admin.users" | "admin.config") {
  if (!can(actor.role, perm)) throw forbidden();
}

const ROLES: Role[] = ["STAFF", "ACCOUNTANT", "ADMIN", "MANAGEMENT"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------- Users ------------------------------ */

export type UserInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  jobTitle?: string | null;
  role: Role;
  departmentId?: string | null;
  password?: string | null;
  status?: "ACTIVE" | "SUSPENDED";
  /** Email the login details (ad-hoc staff only). */
  sendCredentials?: boolean;
};

/** Company-domain users sign in with Google and have no password. */
function usesGoogle(email: string) {
  return googleEnabled() && isCompanyEmail(email);
}

function validateUser(input: UserInput, requirePassword: boolean) {
  const e: Record<string, string> = {};
  if (!input.firstName?.trim()) e.firstName = "Required.";
  if (!input.lastName?.trim()) e.lastName = "Required.";
  if (!EMAIL_RE.test(input.email?.trim() ?? "")) e.email = "Enter a valid email address.";
  if (!ROLES.includes(input.role)) e.role = "Choose a role.";
  if (!usesGoogle(input.email ?? "") && (requirePassword || input.password)) {
    const p = passwordProblem(input.password ?? "");
    if (p) e.password = p;
  }
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
}

async function deliverCredentials(actor: CurrentUser, user: { firstName: string; email: string }, password: string) {
  const sent = await sendEmail({ to: user.email, ...credentialsEmail({ name: user.firstName, email: user.email, password, addedBy: actor.fullName }) });
  return sent;
}

/**
 * Admins can add anyone. Accountants can add ad-hoc staff only — people without a company
 * email, who sign in with a password that can be emailed to them.
 */
export async function createUser(actor: CurrentUser, input: UserInput) {
  const isAdmin = can(actor.role, "admin.users");
  if (!isAdmin && !can(actor.role, "users.addAdhoc")) throw forbidden();
  const email = input.email.trim().toLowerCase();
  const google = usesGoogle(email);
  if (!isAdmin) {
    if (input.role !== "STAFF") throw forbidden("Accountants can only add staff. Ask an administrator for other roles.");
    if (isCompanyEmail(email))
      throw new DomainError(`@${config.companyDomain} staff don't need to be added — they're let in automatically when they sign in with Google.`, "VALIDATION", { email: "Company email" });
  }
  if (!google && !input.password) input.password = generatePassword();
  validateUser(input, !google);
  const exists = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (exists) throw new DomainError("A user with that email already exists.", "VALIDATION", { email: "Already in use." });
  const passwordHash = google ? null : await hashPassword(input.password!);
  const user = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        organisationId: actor.organisationId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        role: input.role,
        departmentId: input.departmentId || null,
        passwordHash,
        passwordSetByAdmin: !google,
      })
      .returning();
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "USER",
      entityId: user.id,
      entityRef: email,
      action: "CREATED",
      summary: `${actor.fullName} added ${google ? "" : "ad-hoc "}user ${user.firstName} ${user.lastName} (${input.role.toLowerCase()})`,
      newValues: { email, role: input.role, departmentId: user.departmentId, signIn: google ? "google" : "password" },
    });
    return user;
  });
  let emailed: boolean | null = null;
  if (!google && input.sendCredentials) {
    emailed = (await deliverCredentials(actor, user, input.password!)).ok;
    await audit(db, { organisationId: actor.organisationId, userId: actor.id, entityType: "USER", entityId: user.id, entityRef: email, action: emailed ? "CREDENTIALS_EMAILED" : "CREDENTIALS_EMAIL_FAILED", summary: `${actor.fullName} ${emailed ? "emailed" : "could not email"} login details to ${email}` });
  }
  return { user, google, password: google ? null : input.password!, emailed };
}

/** Set a fresh temporary password for an ad-hoc user and (optionally) email it. */
export async function resendLoginDetails(actor: CurrentUser, userId: string, opts: { email: boolean }) {
  const isAdmin = can(actor.role, "admin.users");
  if (!isAdmin && !can(actor.role, "users.addAdhoc")) throw forbidden();
  const target = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.organisationId, actor.organisationId)) });
  if (!target) throw notFound("User not found.");
  if (usesGoogle(target.email)) throw new DomainError("This person signs in with Google and has no password.");
  if (!isAdmin && target.role !== "STAFF") throw forbidden("Accountants can only manage staff logins.");
  const password = generatePassword();
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordSetByAdmin: true, resetTokenHash: null }).where(eq(users.id, userId));
  const emailed = opts.email ? (await deliverCredentials(actor, target, password)).ok : null;
  await audit(db, {
    organisationId: actor.organisationId,
    userId: actor.id,
    entityType: "USER",
    entityId: userId,
    entityRef: target.email,
    action: "PASSWORD_ISSUED",
    summary: `${actor.fullName} issued a new password for ${target.firstName} ${target.lastName}${emailed ? " and emailed it" : emailed === false ? " (email failed)" : ""}`,
  });
  return { password, emailed };
}

export async function updateUser(actor: CurrentUser, id: string, input: UserInput) {
  requireAdmin(actor, "admin.users");
  validateUser(input, false);
  const current = await db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.organisationId, actor.organisationId)) });
  if (!current) throw notFound("User not found.");
  const email = input.email.trim().toLowerCase();
  const clash = await db.query.users.findFirst({ where: and(sql`lower(${users.email}) = ${email}`, ne(users.id, id)) });
  if (clash) throw new DomainError("A user with that email already exists.", "VALIDATION", { email: "Already in use." });
  if (id === actor.id && (input.role !== "ADMIN" || input.status === "SUSPENDED"))
    throw new DomainError("You can't remove your own administrator access or suspend yourself.");
  if (current.role === "ADMIN" && (input.role !== "ADMIN" || input.status === "SUSPENDED")) {
    const admins = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.organisationId, actor.organisationId), eq(users.role, "ADMIN"), eq(users.status, "ACTIVE")));
    if (Number(admins[0].count) <= 1) throw new DomainError("The organisation must keep at least one active administrator.");
  }
  const next = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email,
    phone: input.phone?.trim() || null,
    jobTitle: input.jobTitle?.trim() || null,
    role: input.role,
    departmentId: input.departmentId || null,
    status: input.status ?? current.status,
  };
  const passwordHash = input.password && !usesGoogle(email) ? await hashPassword(input.password) : undefined;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ ...next, ...(passwordHash ? { passwordHash, passwordSetByAdmin: true } : {}) }).where(eq(users.id, id));
    const d = diff(current as unknown as Record<string, unknown>, next);
    if (d.changed || passwordHash) {
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "USER",
        entityId: id,
        entityRef: email,
        action: d.newValues.role ? "ROLE_CHANGED" : "UPDATED",
        summary: `${actor.fullName} updated ${next.firstName} ${next.lastName}${d.newValues.role ? ` (role ${String(d.oldValues.role).toLowerCase()} → ${String(d.newValues.role).toLowerCase()})` : ""}${passwordHash ? " and set a new password" : ""}`,
        oldValues: d.oldValues,
        newValues: { ...d.newValues, ...(passwordHash ? { password: "changed" } : {}) },
      });
    }
  });
  if (passwordHash && input.sendCredentials) {
    await deliverCredentials(actor, { firstName: next.firstName, email }, input.password!);
  }
}

/* --------------------------- Profile ------------------------------ */

export async function updateProfile(
  actor: CurrentUser,
  input: { phone?: string | null; emailNotifications: boolean; currentPassword?: string; newPassword?: string },
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!user) throw notFound();
  const updates: Partial<typeof users.$inferInsert> = { phone: input.phone?.trim() || null, emailNotifications: input.emailNotifications };
  if (input.newPassword) {
    if (!user.passwordHash) throw new DomainError("You sign in with Google, so there's no password to change.");
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new DomainError("Your current password is incorrect.", "VALIDATION", { currentPassword: "Incorrect password." });
    const p = passwordProblem(input.newPassword);
    if (p) throw new DomainError(p, "VALIDATION", { newPassword: p });
    updates.passwordHash = await hashPassword(input.newPassword);
    updates.passwordSetByAdmin = false;
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set(updates).where(eq(users.id, actor.id));
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "USER",
      entityId: actor.id,
      entityRef: actor.email,
      action: input.newPassword ? "PASSWORD_CHANGED" : "PROFILE_UPDATED",
      summary: `${actor.fullName} updated their profile${input.newPassword ? " and changed their password" : ""}`,
    });
  });
}

/** The user chose to keep the password that was set for them. */
export async function keepIssuedPassword(actor: CurrentUser) {
  await db.update(users).set({ passwordSetByAdmin: false }).where(eq(users.id, actor.id));
  await audit(db, { organisationId: actor.organisationId, userId: actor.id, entityType: "USER", entityId: actor.id, entityRef: actor.email, action: "KEPT_ISSUED_PASSWORD", summary: `${actor.fullName} chose to keep the password set for them` });
}

/* ------------------------- Categories ----------------------------- */

export async function saveCategory(
  actor: CurrentUser,
  id: string | null,
  input: { name: string; description?: string | null; keywords?: string | null; receiptRequired: boolean; archived?: boolean },
) {
  requireAdmin(actor, "admin.config");
  if (!input.name?.trim()) throw new DomainError("Name is required.", "VALIDATION", { name: "Required." });
  const values = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    keywords: input.keywords?.trim() || null,
    receiptRequired: input.receiptRequired,
    archived: input.archived ?? false,
  };
  await db.transaction(async (tx) => {
    const dupe = await tx.query.expenseCategories.findFirst({
      where: and(eq(expenseCategories.organisationId, actor.organisationId), sql`lower(${expenseCategories.name}) = ${values.name.toLowerCase()}`, id ? ne(expenseCategories.id, id) : undefined),
    });
    if (dupe) throw new DomainError("A category with that name already exists.", "VALIDATION", { name: "Already exists." });
    if (id) {
      const current = await tx.query.expenseCategories.findFirst({ where: and(eq(expenseCategories.id, id), eq(expenseCategories.organisationId, actor.organisationId)) });
      if (!current) throw notFound();
      await tx.update(expenseCategories).set(values).where(eq(expenseCategories.id, id));
      const d = diff(current as unknown as Record<string, unknown>, values);
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "CATEGORY", entityId: id, entityRef: values.name, action: "UPDATED", summary: `${actor.fullName} updated category ${values.name}`, oldValues: d.oldValues, newValues: d.newValues });
    } else {
      const [row] = await tx.insert(expenseCategories).values({ ...values, organisationId: actor.organisationId }).returning();
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "CATEGORY", entityId: row.id, entityRef: values.name, action: "CREATED", summary: `${actor.fullName} created category ${values.name}` });
    }
  });
}

/* ------------------------- Departments ---------------------------- */

export async function saveDepartment(actor: CurrentUser, id: string | null, input: { name: string; code?: string | null; archived?: boolean }) {
  requireAdmin(actor, "admin.config");
  if (!input.name?.trim()) throw new DomainError("Name is required.", "VALIDATION", { name: "Required." });
  const values = { name: input.name.trim(), code: input.code?.trim() || null, archived: input.archived ?? false };
  await db.transaction(async (tx) => {
    if (id) {
      const current = await tx.query.departments.findFirst({ where: and(eq(departments.id, id), eq(departments.organisationId, actor.organisationId)) });
      if (!current) throw notFound();
      await tx.update(departments).set(values).where(eq(departments.id, id));
      const d = diff(current as unknown as Record<string, unknown>, values);
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "DEPARTMENT", entityId: id, entityRef: values.name, action: "UPDATED", summary: `${actor.fullName} updated department ${values.name}`, oldValues: d.oldValues, newValues: d.newValues });
    } else {
      const [row] = await tx.insert(departments).values({ ...values, organisationId: actor.organisationId }).returning();
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "DEPARTMENT", entityId: row.id, entityRef: values.name, action: "CREATED", summary: `${actor.fullName} created department ${values.name}` });
    }
  });
}

/* --------------------------- Projects ----------------------------- */

export async function saveProject(
  actor: CurrentUser,
  id: string | null,
  input: { name: string; code?: string | null; description?: string | null; budget?: number | null; departmentId?: string | null; startDate?: string | null; endDate?: string | null; archived?: boolean },
) {
  requireAdmin(actor, "admin.config");
  const e: Record<string, string> = {};
  if (!input.name?.trim()) e.name = "Required.";
  if (input.budget != null && input.budget < 0) e.budget = "Budget cannot be negative.";
  if (input.startDate && input.endDate && input.endDate < input.startDate) e.endDate = "End date must be after the start date.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
  const values = {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    description: input.description?.trim() || null,
    budget: input.budget ?? null,
    departmentId: input.departmentId || null,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    archived: input.archived ?? false,
  };
  await db.transaction(async (tx) => {
    if (id) {
      const current = await tx.query.projects.findFirst({ where: and(eq(projects.id, id), eq(projects.organisationId, actor.organisationId)) });
      if (!current) throw notFound();
      await tx.update(projects).set(values).where(eq(projects.id, id));
      const d = diff(current as unknown as Record<string, unknown>, values);
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "PROJECT", entityId: id, entityRef: values.name, action: "UPDATED", summary: `${actor.fullName} updated project ${values.name}`, oldValues: d.oldValues, newValues: d.newValues });
    } else {
      const [row] = await tx.insert(projects).values({ ...values, organisationId: actor.organisationId }).returning();
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "PROJECT", entityId: row.id, entityRef: values.name, action: "CREATED", summary: `${actor.fullName} created project ${values.name}` });
    }
  });
}

/* --------------------------- Settings ----------------------------- */

export async function saveSettings(actor: CurrentUser, input: { name: string; settings: OrgSettings }) {
  requireAdmin(actor, "admin.config");
  const s = input.settings;
  const e: Record<string, string> = {};
  if (!input.name?.trim()) e.name = "Required.";
  if (!(s.maxUploadMb >= 1 && s.maxUploadMb <= 25)) e.maxUploadMb = "Between 1 and 25 MB.";
  if (!(s.nearDepletionPercent >= 50 && s.nearDepletionPercent <= 100)) e.nearDepletionPercent = "Between 50 and 100.";
  if (!(s.unusualMultiplier >= 1.5 && s.unusualMultiplier <= 20)) e.unusualMultiplier = "Between 1.5 and 20.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
  const current = await getOrg(actor.organisationId);
  const next = { ...DEFAULT_ORG_SETTINGS, ...s };
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ name: input.name.trim(), settings: next }).where(eq(organisations.id, actor.organisationId));
    const d = diff({ name: current.name, ...current.settings } as Record<string, unknown>, { name: input.name.trim(), ...next });
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "SETTINGS",
      entityId: actor.organisationId,
      action: "UPDATED",
      summary: `${actor.fullName} updated organisation settings`,
      oldValues: d.oldValues,
      newValues: d.newValues,
    });
  });
}

export async function userAllocationCount(userId: string) {
  const r = await db.select({ count: sql<number>`count(*)::int` }).from(allocations).where(eq(allocations.staffId, userId));
  return Number(r[0].count);
}
