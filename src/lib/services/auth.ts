import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { memberships, users, type User } from "@/db/schema";
import { audit } from "@/lib/audit";
import { accessibleOrganisations } from "@/lib/auth/current";
import type { GoogleIdentity } from "@/lib/auth/google";
import { createResetToken, hashPassword, hashToken, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { config, googleEnabled, isCompanyEmail } from "@/lib/config";
import { resetEmail, sendEmail } from "@/lib/email";
import { DomainError } from "@/lib/errors";
import { requestMeta } from "@/lib/request-context";
import { ensureOrganisation } from "./bootstrap";

// A real bcrypt hash used to keep timing consistent for unknown emails.
const DUMMY_HASH = "$2b$12$LSerRrekKl1pFyBwO58kCeCWDcqmDZ5lwPo40KUD6V5VlWTw00/.a";

const GOOGLE_ONLY = `Staff with an @${config.companyDomain} email sign in with Google.`;

async function startSession(user: User, method: "password" | "google") {
  const token = await signSession({ sub: user.id, role: user.role, org: user.organisationId });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(db, {
    organisationId: user.organisationId,
    userId: user.id,
    entityType: "AUTH",
    entityId: user.id,
    entityRef: user.email,
    action: method === "google" ? "LOGIN_GOOGLE" : "LOGIN",
    summary: `${user.firstName} ${user.lastName} signed in${method === "google" ? " with Google" : ""}`,
  });
}

/** Email + password sign-in, used by ad-hoc staff who don't have a company Google account. */
export async function login(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (googleEnabled() && isCompanyEmail(email)) throw new DomainError(GOOGLE_ONLY);
  const { ip } = await requestMeta();
  const limitKey = `login:${ip ?? "unknown"}:${email}`;
  const limit = rateLimit(limitKey, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    throw new DomainError(`Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minutes.`);
  }
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) {
    if (user) {
      await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: email, action: "LOGIN_FAILED", summary: `Failed sign-in attempt for ${email}` });
    }
    if (user && !user.passwordHash) throw new DomainError(GOOGLE_ONLY);
    throw new DomainError("Incorrect email or password.");
  }
  if (user.status !== "ACTIVE") throw new DomainError("Your account is suspended. Contact your administrator.");
  if (!(await accessibleOrganisations(user)).length) throw new DomainError(NO_ACCESS);
  resetRateLimit(limitKey);
  await startSession(user, "password");
  return user;
}

const NOT_INVITED = "You haven't been invited yet. Ask an administrator or accountant to add you to your company.";
const NO_ACCESS = "You don't have access to any organisation at the moment. Contact your administrator.";

/**
 * Google sign-in. Access is by invitation only: the person must already have been added by an
 * administrator or accountant (matched by Google account id, then by email). The only exception
 * is BOOTSTRAP_ADMIN_EMAILS, who become group administrators so a fresh installation can be set up.
 */
export async function signInWithGoogle(identity: GoogleIdentity) {
  const bootstrap = config.bootstrapAdmins.includes(identity.email);
  let user =
    (await db.query.users.findFirst({ where: eq(users.googleSub, identity.sub) })) ??
    (await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${identity.email}` }));

  if (user) {
    if (user.status !== "ACTIVE") throw new DomainError("Your account is suspended. Contact your administrator.");
    const updates: Partial<typeof users.$inferInsert> = {};
    if (!user.googleSub) updates.googleSub = identity.sub;
    if (bootstrap && !user.isGroupAdmin) updates.isGroupAdmin = true;
    if (Object.keys(updates).length) [user] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
  } else if (bootstrap) {
    const org = await ensureOrganisation();
    user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          organisationId: org.id,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          googleSub: identity.sub,
          role: "ADMIN",
          isGroupAdmin: true,
          passwordHash: null,
        })
        .returning();
      await tx.insert(memberships).values({ userId: created.id, organisationId: org.id, role: "ADMIN" });
      await audit(tx, {
        organisationId: org.id,
        userId: created.id,
        entityType: "USER",
        entityId: created.id,
        entityRef: created.email,
        action: "CREATED",
        summary: `${created.firstName} ${created.lastName} joined with Google as a group administrator (bootstrap)`,
      });
      return created;
    });
  } else {
    throw new DomainError(NOT_INVITED);
  }
  if (!(await accessibleOrganisations(user)).length) throw new DomainError(NO_ACCESS);
  await startSession(user, "google");
  return user;
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** One-hour reset link, emailed via Resend. Only for password (ad-hoc staff) accounts. */
export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  if (!rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000).ok) throw new DomainError("Too many requests. Try again later.");
  if (googleEnabled() && isCompanyEmail(email)) throw new DomainError(`${GOOGLE_ONLY} Use “Sign in with Google” instead.`);
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) return; // never reveal whether an account exists
  const { token, hash } = createResetToken();
  await db.update(users).set({ resetTokenHash: hash, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(users.id, user.id));
  await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: email, action: "RESET_REQUESTED", summary: `Password reset requested for ${email}` });
  const url = `${config.appUrl}/reset-password?token=${token}`;
  const sent = await sendEmail({ to: user.email, ...resetEmail({ name: user.firstName, url }) });
  if (!sent.ok) console.info(`[password-reset] ${email}: ${url}`);
}

export async function resetPassword(token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new DomainError(problem, "VALIDATION", { password: problem });
  const user = await db.query.users.findFirst({
    where: and(eq(users.resetTokenHash, hashToken(token)), gt(users.resetTokenExpiresAt, new Date())),
  });
  if (!user) throw new DomainError("This reset link is invalid or has expired. Request a new one.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), resetTokenHash: null, resetTokenExpiresAt: null, passwordSetByAdmin: false })
    .where(eq(users.id, user.id));
  await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: user.email, action: "PASSWORD_RESET", summary: `${user.firstName} ${user.lastName} reset their password` });
}
