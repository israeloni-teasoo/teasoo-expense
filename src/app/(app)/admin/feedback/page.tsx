import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MessageSquareReply } from "lucide-react";
import { RespondFeedbackForm } from "@/components/forms/feedback-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeTime } from "@/lib/dates";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS, listFeedback } from "@/lib/services/feedback";

export const metadata: Metadata = { title: "Feedback inbox" };

const FILTERS = [
  ["open", "Open"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
  ["all", "All"],
] as const;

export default async function FeedbackInboxPage({ searchParams }: { searchParams: Promise<{ status?: string; open?: string }> }) {
  const user = await requirePagePermission("feedback.manage");
  const { status = "open", open } = await searchParams;
  const items = await listFeedback(user, { scope: "all", status });
  return (
    <div>
      <PageHeader title="Feedback inbox" description="Problems and suggestions sent by everyone using the app. Reply, then mark them in progress or resolved." />
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/feedback?status=${k}`} className={cn("rounded-md px-3 py-1.5 font-medium", status === k ? "bg-white shadow-sm" : "text-gray-600")}>
            {l}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState title="Nothing here" description={status === "open" ? "No open feedback — all caught up." : undefined} />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <Card key={f.id} className={cn("p-4 sm:p-5", open === f.id && "ring-2 ring-brand-400")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={f.userName} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{f.subject}</p>
                      <Badge tone={FEEDBACK_STATUS[f.status].tone}>{FEEDBACK_STATUS[f.status].label}</Badge>
                      <Badge>{FEEDBACK_CATEGORIES[f.category]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {f.userName} · {f.userEmail} · {relativeTime(f.createdAt)}
                      {f.pageUrl ? (
                        <>
                          {" · on "}
                          <Link href={f.pageUrl} className="text-brand-700 hover:underline">{f.pageUrl.length > 40 ? f.pageUrl.slice(0, 40) + "…" : f.pageUrl}</Link>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{f.message}</p>
                    {f.screenshots.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {f.screenshots.map((d) => (
                          <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200">
                            <FileText className="h-3.5 w-3.5" /> {d.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    {f.response && (
                      <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-950">
                        <span className="font-medium">{f.responderName ?? "Admin"} replied{f.respondedAt ? ` ${formatDateTime(f.respondedAt)}` : ""}:</span> {f.response}
                      </p>
                    )}
                    {f.userAgent && <p className="mt-1 truncate text-[11px] text-gray-400" title={f.userAgent}>{f.userAgent}</p>}
                  </div>
                </div>
                <ModalButton label={f.response ? "Update" : "Respond"} size="sm" variant={f.status === "OPEN" ? "primary" : "secondary"} icon={<MessageSquareReply className="h-4 w-4" />} title={`Respond: ${f.subject}`}>
                  <RespondFeedbackForm id={f.id} status={f.status} response={f.response} />
                </ModalButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
