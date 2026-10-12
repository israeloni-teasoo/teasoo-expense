import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organisations, users, type Role, type User } from "@/db/schema";
import { can, type Permission } from "@/lib/rbac";
import { forbidden } from "@/lib/errors";
import { SESSION_COOKIE, verifySession } from "./session";
import { pickActiveOrganisation } from "@/lib/org-access";

/** Cookie holding the organisation the person is currently working in. */
export const ORG_COOKIE = "tx_org";

/** One organisation a person can work in, with their role there. */
export type OrgAccess = {
  organisationId: string;
  name: string;
  hasLogo: boolean;
  /** Changes whenever the organisation (or its logo) is updated; used to bust the logo cache. */
  version: number;
  role: Role;
  departmentId: string | null;
  /** True when access comes only from being a group admin (no membership row). */
  viaGroupAdmin: boolean;
};

/**
 * The signed-in person, resolved for the active organisation: organisationId, role and
 * departmentId are those of their membership in the organisation they're working in.
 */
export type CurrentUser = Omit<User, "passwordHash" | "resetTokenHash" | "resetTokenExpiresAt"> & {
  fullName: string;
  /** False for Google-only accounts. */
  hasPassword: boolean;
  /** Every organisation this person can switch to (including the active one). */
  organisations: OrgAccess[];
  /** The active organisation. */
  organisation: OrgAccess;
};

/** Organisations a user can work in: active memberships in live organisations (all of them for group admins). */
export async function accessibleOrganisations(user: Pick<User, "id" | "isGroupAdmin">): Promise<OrgAccess[]> {
  const rows = await db
    .select({
      organisationId: organisations.id,
      name: organisations.name,
      logoKey: organisations.logoKey,
      updatedAt: organisations.updatedAt,
      role: memberships.role,
      departmentId: memberships.departmentId,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(and(eq(memberships.userId, user.id), eq(organisations.archived, false)))
    .orderBy(asc(organisations.createdAt));
  const result: OrgAccess[] = rows
    .filter((r) => r.status === "ACTIVE" || user.isGroupAdmin)
    .map((r) => ({
      organisationId: r.organisationId,
      name: r.name,
      hasLogo: !!r.logoKey,
      version: r.updatedAt.getTime(),
      role: user.isGroupAdmin ? "ADMIN" : r.role,
      departmentId: r.departmentId,
      viaGroupAdmin: false,
    }));
  if (user.isGroupAdmin) {
    const all = await db
      .select({ id: organisations.id, name: organisations.name, logoKey: organisations.logoKey, updatedAt: organisations.updatedAt })
      .from(organisations)
      .where(eq(organisations.archived, false))
      .orderBy(asc(organisations.createdAt));
    for (const org of all) {
      if (result.some((r) => r.organisationId === org.id)) continue;
      result.push({ organisationId: org.id, name: org.name, hasLogo: !!org.logoKey, version: org.updatedAt.getTime(), role: "ADMIN", departmentId: null, viaGroupAdmin: true });
    }
  }
  return result;
}

/** Loads the signed-in user once per request. Suspended users, and people with no organisation left, are treated as signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, session.sub) });
  if (!row || row.status !== "ACTIVE") return null;
  const orgs = await accessibleOrganisations(row);
  const active = pickActiveOrganisation(orgs, store.get(ORG_COOKIE)?.value, row.organisationId);
  if (!active) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, resetTokenHash, resetTokenExpiresAt, ...rest } = row;
  return {
    ...rest,
    organisationId: active.organisationId,
    role: active.role,
    departmentId: active.departmentId,
    fullName: `${row.firstName} ${row.lastName}`,
    hasPassword: !!passwordHash,
    organisations: orgs,
    organisation: active,
  };
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

/**
 * For detail pages: when a record isn't in the active organisation but belongs to another
 * organisation the person can work in, switch to it and reopen the page.
 */
export async function redirectToOwningOrganisation(user: CurrentUser, organisationId: string | null | undefined, path: string) {
  if (!organisationId || organisationId === user.organisationId) return;
  if (!user.organisations.some((o) => o.organisationId === organisationId)) return;
  redirect(`/api/org/switch?org=${organisationId}&next=${encodeURIComponent(path)}`);
}
