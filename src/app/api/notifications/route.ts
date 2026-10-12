import { api, jsonBody, os } from "@/lib/api";
import { listNotifications, markRead, unreadCount } from "@/lib/services/notifications";

export const GET = api(async (user, req) => {
  const unread = new URL(req.url).searchParams.get("filter") === "unread";
  return { unread: await unreadCount(user.id), data: await listNotifications(user, unread ? "unread" : "all", 100) };
});

/** POST /api/notifications { id? } — mark one (or all) as read. */
export const POST = api(async (user, req) => {
  const b = await jsonBody(req).catch(() => ({}) as Record<string, unknown>);
  await markRead(user, os(b.id) ?? undefined);
  return { ok: true };
});
