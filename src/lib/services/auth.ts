import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createResetToken, hashPassword, hashToken, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { requestMeta } from "@/lib/request-context";

// A real bcrypt hash used to keep timing consistent for unknown emails.
const DUMMY_HASH = "$2b$12$LSerRrekKl1pFyBwO58kCeCWDcqmDZ5lwPo40KUD6V5VlWTw00/.a";

export async function login(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  const limitKey = `login:${ip ?? "unknown"}:${email}`;
  const limit = rateLimit(limitKey, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    throw new DomainError(`Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minutes.`);
  }
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: email, action: "LOGIN_FAILED", summary: `Failed sign-in attempt for ${email}` });
    }
    throw new DomainError("Incorrect email or password.");
  }
  if (user.status !== "ACTIVE") throw new DomainError("Your account is suspended. Contact your administrator.");
  resetRateLimit(limitKey);

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
  await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: email, action: "LOGIN", summary: `${user.firstName} ${user.lastName} signed in` });
  return user;
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Creates a one-hour reset token. Without an email service configured, the link is written
 * to the server log so an administrator can pass it on; administrators can also set a new
 * password directly from the Users screen.
 */
export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  if (!rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000).ok) throw new DomainError("Too many requests. Try again later.");
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (!user || user.status !== "ACTIVE") return; // never reveal whether an account exists
  const { token, hash } = createResetToken();
  await db.update(users).set({ resetTokenHash: hash, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(users.id, user.id));
  await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: email, action: "RESET_REQUESTED", summary: `Password reset requested for ${email}` });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
  console.info(`[password-reset] ${email}: ${url}`);
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
    .set({ passwordHash: await hashPassword(password), resetTokenHash: null, resetTokenExpiresAt: null })
    .where(eq(users.id, user.id));
  await audit(db, { organisationId: user.organisationId, userId: user.id, entityType: "AUTH", entityId: user.id, entityRef: user.email, action: "PASSWORD_RESET", summary: `${user.firstName} ${user.lastName} reset their password` });
}
