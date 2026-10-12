import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Executor } from "@/db";
import { notifications, users, type Role } from "@/db/schema";

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
};

export async function notifyUsers(exec: Executor, userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  let targets = unique;
  if (n.dedupeKey) {
    const existing = await exec
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.dedupeKey, n.dedupeKey), inArray(notifications.userId, unique)));
    const seen = new Set(existing.map((e) => e.userId));
    targets = unique.filter((id) => !seen.has(id));
  }
  if (!targets.length) return;
  await exec.insert(notifications).values(
    targets.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })),
  );
}

/** Notify every active user with one of the given roles (e.g. all accountants), optionally excluding the actor. */
export async function notifyRoles(
  exec: Executor,
  organisationId: string,
  roles: Role[],
  n: NotificationInput,
  excludeUserId?: string,
) {
  const conditions = [eq(users.organisationId, organisationId), inArray(users.role, roles), eq(users.status, "ACTIVE")];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
  const rows = await exec.select({ id: users.id }).from(users).where(and(...conditions));
  await notifyUsers(
    exec,
    rows.map((r) => r.id),
    n,
  );
}

export const FINANCE_ROLES: Role[] = ["ACCOUNTANT", "ADMIN"];
