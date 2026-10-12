import "server-only";
import { after } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { memberships, notifications, users, type Role } from "@/db/schema";
import { emailEnabled } from "./config";
import { notificationEmail, sendEmail } from "./email";

export type NotificationInput = {
  /** Organisation the notification is about; its link opens in that organisation. */
  organisationId: string;
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
  const rows = await exec
    .insert(notifications)
    .values(
      targets.map((userId) => ({
        userId,
        organisationId: n.organisationId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })),
    )
    .returning({ id: notifications.id });
  scheduleEmails(rows.map((r) => r.id));
}

/**
 * Emails are sent after the response, and only for notifications whose row exists by then —
 * so a rolled-back transaction never produces an email.
 */
function scheduleEmails(ids: string[]) {
  if (!ids.length || !emailEnabled()) return;
  try {
    after(async () => {
      const rows = await db
        .select({ title: notifications.title, body: notifications.body, link: notifications.link, email: users.email, wants: users.emailNotifications, status: users.status })
        .from(notifications)
        .innerJoin(users, eq(users.id, notifications.userId))
        .where(inArray(notifications.id, ids));
      for (const r of rows) {
        if (!r.wants || r.status !== "ACTIVE") continue;
        await sendEmail({ to: r.email, ...notificationEmail(r) });
      }
    });
  } catch {
    // Outside a request scope (e.g. scripts) there is nothing to schedule against.
  }
}

/** Notify every active member of the organisation with one of the given roles (e.g. all accountants), optionally excluding the actor. */
export async function notifyRoles(
  exec: Executor,
  organisationId: string,
  roles: Role[],
  n: Omit<NotificationInput, "organisationId">,
  excludeUserId?: string,
) {
  const conditions = [
    eq(memberships.organisationId, organisationId),
    inArray(memberships.role, roles),
    eq(memberships.status, "ACTIVE"),
    eq(users.status, "ACTIVE"),
  ];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));
  const rows = await exec
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(...conditions));
  await notifyUsers(
    exec,
    rows.map((r) => r.id),
    { ...n, organisationId },
  );
}

export const FINANCE_ROLES: Role[] = ["ACCOUNTANT", "ADMIN"];
