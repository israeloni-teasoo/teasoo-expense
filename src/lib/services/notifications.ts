import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";

export async function unreadCount(userId: string) {
  const r = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(r[0].count);
}

export async function listNotifications(actor: CurrentUser, filter: "all" | "unread" = "all", limit = 100) {
  const conditions = [eq(notifications.userId, actor.id)];
  if (filter === "unread") conditions.push(isNull(notifications.readAt));
  return db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markRead(actor: CurrentUser, id?: string) {
  const conditions = [eq(notifications.userId, actor.id), isNull(notifications.readAt)];
  if (id) conditions.push(eq(notifications.id, id));
  await db.update(notifications).set({ readAt: new Date() }).where(and(...conditions));
}
