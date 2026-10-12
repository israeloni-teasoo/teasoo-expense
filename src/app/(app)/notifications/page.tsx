import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/dates";
import { listNotifications } from "@/lib/services/notifications";
import { markReadAction } from "@/app/actions/account";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const items = await listNotifications(user, filter === "unread" ? "unread" : "all");
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <form action={markReadAction}>
              <Button variant="secondary" size="sm">
                <CheckCheck className="h-4 w-4" /> Mark all as read
              </Button>
            </form>
          ) : undefined
        }
      />
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        <Link href="/notifications" className={cn("rounded-md px-3 py-1.5 font-medium", filter !== "unread" ? "bg-white shadow-sm" : "text-gray-600")}>All</Link>
        <Link href="/notifications?filter=unread" className={cn("rounded-md px-3 py-1.5 font-medium", filter === "unread" ? "bg-white shadow-sm" : "text-gray-600")}>Unread</Link>
      </div>
      <Card className="overflow-hidden">
        {items.length ? (
          <ul className="divide-y divide-gray-100">
            {items.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-4 py-3 sm:px-5", !n.readAt && "bg-brand-50/50")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className="text-sm font-medium text-gray-900 hover:text-brand-700">{n.title}</Link>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  )}
                  {n.body && <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100">Mark read</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" />
        )}
      </Card>
    </div>
  );
}
