import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";
import { can, type Permission } from "@/lib/rbac";
import { forbidden } from "@/lib/errors";
import { SESSION_COOKIE, verifySession } from "./session";

export type CurrentUser = Omit<User, "passwordHash" | "resetTokenHash" | "resetTokenExpiresAt"> & {
  fullName: string;
};

/** Loads the signed-in user once per request. Suspended users are treated as signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, session.sub) });
  if (!row || row.status !== "ACTIVE") return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, resetTokenHash, resetTokenExpiresAt, ...rest } = row;
  return { ...rest, fullName: `${row.firstName} ${row.lastName}` };
});

/** For pages: redirect to login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect to the dashboard when the user lacks a permission. */
export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

/** For actions and API routes: throw a DomainError instead of redirecting. */
export async function requireActor(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw forbidden("Your session has expired. Please sign in again.");
  if (permission && !can(user.role, permission)) throw forbidden();
  return user;
}

export function hasRole(user: { role: Role }, ...roles: Role[]) {
  return roles.includes(user.role);
}
