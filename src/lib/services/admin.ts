import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import {
  DEFAULT_ORG_SETTINGS,
  allocations,
  departments,
  expenseCategories,
  memberships,
  organisations,
  projects,
  users,
  type OrgSettings,
  type Role,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { generatePassword, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { googleEnabled, isCompanyEmail } from "@/lib/config";
import { addedToOrganisationEmail, credentialsEmail, googleInviteEmail, sendEmail } from "@/lib/email";
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
  /** Role in the organisations being granted (and in the active organisation when editing). */
  role: Role;
  /** Department in the active organisation. */
  departmentId?: string | null;
  password?: string | null;
  /** Access to the active organisation. */
  status?: "ACTIVE" | "SUSPENDED";
  /** Email the login details (password users only). */
  sendCredentials?: boolean;
  /** Organisations the person should belong to (only those the actor manages are considered). */
  organisationIds?: string[];
  /** Group admins only: manage every organisation. */
  isGroupAdmin?: boolean;
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

/** Organisations the actor can invite people into, and whether they can give any role there (admins) or only Staff (accountants). */
export function manageableOrganisations(actor: CurrentUser) {
  return actor.organisations
    .filter((o) => can(o.role, "admin.users") || can(o.role, "users.addAdhoc"))
    .map((o) => ({ id: o.organisationId, name: o.name, anyRole: can(o.role, "admin.users") }));
}

function canManageUsersHere(actor: CurrentUser) {
  return can(actor.role, "admin.users") || can(actor.role, "users.addAdhoc");
}

/** Resolves the organisations to grant: always valid ones the actor manages, defaulting to the active one. */
function resolveTargetOrgs(actor: CurrentUser, requested: string[] | undefined, role: Role) {
  const manageable = manageableOrganisations(actor);
  const ids = requested?.length ? [...new Set(requested)] : [actor.organisationId];
  const orgs = ids.map((id) => manageable.find((m) => m.id === id));
  if (orgs.some((o) => !o)) throw forbidden("You can only add people to organisations you manage.");
  const chosen = orgs as { id: string; name: string; anyRole: boolean }[];
  const limited = chosen.find((o) => !o.anyRole);
  if (limited && role !== "STAFF") throw forbidden(`Accountants can only add staff to ${limited.name}. Ask an administrator for other roles.`);
  return chosen;
}

/** Throws when removing a person's admin access would leave an organisation without an administrator. */
async function assertKeepsAdmin(exec: Executor, organisationId: string, losingUserId: string) {
  const others = await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organisationId, organisationId),
        eq(memberships.role, "ADMIN"),
        eq(memberships.status, "ACTIVE"),
        eq(users.status, "ACTIVE"),
        ne(users.id, losingUserId),
      ),
    );
  const groupAdmins = await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isGroupAdmin, true), eq(users.status, "ACTIVE"), ne(users.id, losingUserId)));
  if (Number(others[0].count) + Number(groupAdmins[0].count) === 0)
    throw new DomainError("Every organisation must keep at least one active administrator.");
}

async function deliverCredentials(actor: CurrentUser, user: { firstName: string; email: string }, password: string, organisations?: string[]) {
  return sendEmail({ to: user.email, ...credentialsEmail({ name: user.firstName, email: user.email, password, addedBy: actor.fullName, organisations }) });
}

export type InviteResult = {
  user: { id: string; email: string; firstName: string };
  google: boolean;
  password: string | null;
  emailed: boolean | null;
  /** The person already had an account; they were given access to more organisations. */
  existing: boolean;
  organisations: string[];
};

/**
 * Invites someone into one or more organisations. Nobody can join without an invite: company
 * staff get an email telling them to sign in with Google; people without a company email get
 * a generated password (emailed and shown once). Inviting an existing user adds the
 * organisations to their account. Accountants can invite Staff only.
 */
export async function createUser(actor: CurrentUser, input: UserInput): Promise<InviteResult> {
  if (!canManageUsersHere(actor)) throw forbidden();
  const email = input.email.trim().toLowerCase();
  const google = usesGoogle(email);
  const targets = resolveTargetOrgs(actor, input.organisationIds, input.role);
  const departmentFor = (orgId: string) => (orgId === actor.organisationId ? input.departmentId || null : null);

  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (existing) {
    const current = await db.select().from(memberships).where(eq(memberships.userId, existing.id));
    const toAdd = targets.filter((t) => !current.some((m) => m.organisationId === t.id));
    if (!toAdd.length)
      throw new DomainError("This person already has access to the selected organisations. Use Edit to change their role.", "VALIDATION", { email: "Already a member." });
    await db.transaction(async (tx) => {
      await tx.insert(memberships).values(
        toAdd.map((t) => ({ userId: existing.id, organisationId: t.id, role: input.role, departmentId: departmentFor(t.id), invitedBy: actor.id })),
      );
      for (const t of toAdd) {
        await audit(tx, {
          organisationId: t.id,
          userId: actor.id,
          entityType: "USER",
          entityId: existing.id,
          entityRef: email,
          action: "MEMBERSHIP_ADDED",
          summary: `${actor.fullName} added ${existing.firstName} ${existing.lastName} to ${t.name} (${input.role.toLowerCase()})`,
          newValues: { organisation: t.name, role: input.role },
        });
      }
    });
    const names = toAdd.map((t) => t.name);
    const emailed = (await sendEmail({ to: existing.email, ...addedToOrganisationEmail({ name: existing.firstName, addedBy: actor.fullName, organisations: names }) })).ok;
    return { user: existing, google: !existing.passwordHash, password: null, emailed, existing: true, organisations: names };
  }

  if (!google && !input.password) input.password = generatePassword();
  validateUser(input, !google);
  const passwordHash = google ? null : await hashPassword(input.password!);
  const home = targets.find((t) => t.id === actor.organisationId) ?? targets[0];
  const user = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        organisationId: home.id,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        role: input.role,
        departmentId: departmentFor(home.id),
        passwordHash,
        passwordSetByAdmin: !google,
        invitedAt: new Date(),
        invitedBy: actor.id,
      })
      .returning();
    await tx.insert(memberships).values(targets.map((t) => ({ userId: user.id, organisationId: t.id, role: input.role, departmentId: departmentFor(t.id), invitedBy: actor.id })));
    for (const t of targets) {
      await audit(tx, {
        organisationId: t.id,
        userId: actor.id,
        entityType: "USER",
        entityId: user.id,
        entityRef: email,
        action: "INVITED",
        summary: `${actor.fullName} invited ${user.firstName} ${user.lastName} to ${t.name} (${input.role.toLowerCase()})`,
        newValues: { email, role: input.role, organisations: targets.map((x) => x.name), signIn: google ? "google" : "password" },
      });
    }
    return user;
  });
  const names = targets.map((t) => t.name);
  let emailed: boolean | null = null;
  if (google) {
    emailed = (await sendEmail({ to: email, ...googleInviteEmail({ name: user.firstName, email, addedBy: actor.fullName, organisations: names }) })).ok;
  } else if (input.sendCredentials) {
    emailed = (await deliverCredentials(actor, user, input.password!, names)).ok;
  }
  if (emailed !== null) {
    await audit(db, { organisationId: actor.organisationId, userId: actor.id, entityType: "USER", entityId: user.id, entityRef: email, action: emailed ? "INVITE_EMAILED" : "INVITE_EMAIL_FAILED", summary: `${actor.fullName} ${emailed ? "emailed" : "could not email"} the invitation to ${email}` });
  }
  return { user, google, password: google ? null : input.password!, emailed, existing: false, organisations: names };
}

/** The target's membership in the actor's active organisation (people outside it can't be managed from here). */
async function memberHere(actor: CurrentUser, userId: string) {
  const rows = await db
    .select({ user: users, membership: memberships })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(memberships.organisationId, actor.organisationId)))
    .limit(1);
  if (!rows[0]) throw notFound("User not found in this organisation.");
  return rows[0];
}

/** Set a fresh temporary password for a password user and (optionally) email it. */
export async function resendLoginDetails(actor: CurrentUser, userId: string, opts: { email: boolean }) {
  const isAdmin = can(actor.role, "admin.users");
  if (!canManageUsersHere(actor)) throw forbidden();
  const { user: target, membership } = await memberHere(actor, userId);
  if (usesGoogle(target.email)) throw new DomainError("This person signs in with Google and has no password.");
  if (!isAdmin && (membership.role !== "STAFF" || target.isGroupAdmin)) throw forbidden("Accountants can only manage staff logins.");
  const password = generatePassword();
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordSetByAdmin: true, resetTokenHash: null }).where(eq(users.id, userId));
  const emailed = opts.email ? (await deliverCredentials(actor, target, password, [actor.organisation.name])).ok : null;
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

/** Re-sends the Google sign-in invitation to someone who hasn't signed in yet. */
export async function resendInvite(actor: CurrentUser, userId: string) {
  if (!canManageUsersHere(actor)) throw forbidden();
  const { user: target, membership } = await memberHere(actor, userId);
  if (!can(actor.role, "admin.users") && (membership.role !== "STAFF" || target.isGroupAdmin)) throw forbidden("Accountants can only manage staff.");
  if (target.passwordHash) throw new DomainError("This person signs in with a password — issue new login details instead.");
  const orgs = await db
    .select({ name: organisations.name })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE"), eq(organisations.archived, false)));
  const r = await sendEmail({ to: target.email, ...googleInviteEmail({ name: target.firstName, email: target.email, addedBy: actor.fullName, organisations: orgs.map((o) => o.name) }) });
  if (!r.ok) throw new DomainError(`The invitation could not be sent: ${r.error ?? "email failed"}`);
  await audit(db, { organisationId: actor.organisationId, userId: actor.id, entityType: "USER", entityId: userId, entityRef: target.email, action: "INVITE_EMAILED", summary: `${actor.fullName} re-sent the invitation to ${target.email}` });
}

/**
 * Edits a person's details and their access: role, department and status in the active
 * organisation, plus which other organisations (that the actor manages) they belong to.
 */
export async function updateUser(actor: CurrentUser, id: string, input: UserInput) {
  requireAdmin(actor, "admin.users");
  validateUser(input, false);
  const { user: current, membership } = await memberHere(actor, id);
  const email = input.email.trim().toLowerCase();
  const clash = await db.query.users.findFirst({ where: and(sql`lower(${users.email}) = ${email}`, ne(users.id, id)) });
  if (clash) throw new DomainError("A user with that email already exists.", "VALIDATION", { email: "Already in use." });
  const status = input.status ?? membership.status;
  if (id === actor.id && (input.role !== "ADMIN" || status === "SUSPENDED") && !actor.isGroupAdmin)
    throw new DomainError("You can't remove your own administrator access or suspend yourself.");
  if (id === actor.id && input.isGroupAdmin === false && actor.isGroupAdmin)
    throw new DomainError("You can't remove your own group administrator access.");

  // Organisation access changes, limited to organisations the actor manages.
  const manageable = manageableOrganisations(actor).filter((o) => o.anyRole && o.id !== actor.organisationId);
  const existingMemberships = await db.select().from(memberships).where(eq(memberships.userId, id));
  const wanted = new Set(input.organisationIds ?? existingMemberships.map((m) => m.organisationId));
  const toAdd = input.organisationIds ? manageable.filter((o) => wanted.has(o.id) && !existingMemberships.some((m) => m.organisationId === o.id)) : [];
  const toRemove = input.organisationIds ? existingMemberships.filter((m) => !wanted.has(m.organisationId) && manageable.some((o) => o.id === m.organisationId)) : [];

  await db.transaction(async (tx) => {
    if (membership.role === "ADMIN" && (input.role !== "ADMIN" || status === "SUSPENDED")) await assertKeepsAdmin(tx, actor.organisationId, id);
    for (const m of toRemove) if (m.role === "ADMIN") await assertKeepsAdmin(tx, m.organisationId, id);
    if (current.isGroupAdmin && input.isGroupAdmin === false) {
      const others = await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.isGroupAdmin, true), ne(users.id, id)));
      if (Number(others[0].count) === 0) throw new DomainError("There must be at least one group administrator.");
    }

    const next = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      ...(actor.isGroupAdmin && input.isGroupAdmin !== undefined ? { isGroupAdmin: input.isGroupAdmin } : {}),
      // A person re-activated here can sign in again even if they were suspended everywhere before.
      ...(status === "ACTIVE" ? { status: "ACTIVE" as const } : {}),
    };
    const passwordHash = input.password && !usesGoogle(email) ? await hashPassword(input.password) : undefined;
    await tx.update(users).set({ ...next, ...(passwordHash ? { passwordHash, passwordSetByAdmin: true } : {}) }).where(eq(users.id, id));
    const memberNext = { role: input.role, departmentId: input.departmentId || null, status };
    await tx.update(memberships).set(memberNext).where(eq(memberships.id, membership.id));
    if (toAdd.length) {
      await tx.insert(memberships).values(toAdd.map((o) => ({ userId: id, organisationId: o.id, role: input.role, invitedBy: actor.id })));
    }
    if (toRemove.length) {
      await tx.delete(memberships).where(inArray(memberships.id, toRemove.map((m) => m.id)));
    }

    const d = diff({ ...current, role: membership.role, departmentId: membership.departmentId, status: membership.status } as unknown as Record<string, unknown>, { ...next, ...memberNext });
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
    for (const o of toAdd) {
      await audit(tx, { organisationId: o.id, userId: actor.id, entityType: "USER", entityId: id, entityRef: email, action: "MEMBERSHIP_ADDED", summary: `${actor.fullName} added ${next.firstName} ${next.lastName} to ${o.name} (${input.role.toLowerCase()})` });
    }
    for (const m of toRemove) {
      const name = manageable.find((o) => o.id === m.organisationId)?.name ?? "an organisation";
      await audit(tx, { organisationId: m.organisationId, userId: actor.id, entityType: "USER", entityId: id, entityRef: email, action: "MEMBERSHIP_REMOVED", summary: `${actor.fullName} removed ${next.firstName} ${next.lastName} from ${name}` });
    }
  });
  if (input.password && !usesGoogle(email) && input.sendCredentials) {
    await deliverCredentials(actor, { firstName: input.firstName.trim(), email }, input.password);
  }
  if (toAdd.length) {
    await sendEmail({ to: email, ...addedToOrganisationEmail({ name: input.firstName.trim(), addedBy: actor.fullName, organisations: toAdd.map((o) => o.name) }) });
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
  input: { name: string; description?: string | null; keywords?: string | null; receiptRequired: boolean; isOther?: boolean; archived?: boolean },
) {
  requireAdmin(actor, "admin.config");
  if (!input.name?.trim()) throw new DomainError("Name is required.", "VALIDATION", { name: "Required." });
  const values = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    keywords: input.keywords?.trim() || null,
    receiptRequired: input.receiptRequired,
    isOther: input.isOther ?? false,
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
