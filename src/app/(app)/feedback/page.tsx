import type { Metadata } from "next";
import { FileText, MessageSquare } from "lucide-react";
import { FeedbackForm } from "@/components/forms/feedback-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/dates";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS, listFeedback } from "@/lib/services/feedback";

export const metadata: Metadata = { title: "Feedback" };

export default async function FeedbackPage() {
  const user = await requireUser();
  const items = await listFeedback(user, { scope: "mine" });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Feedback" description="Tell the administrators what's not working or what would make this easier. Replies appear here." />
      <Card>
        <CardHeader title="Send feedback" description="Tip: the feedback button at the top of every page also records which page you were on." />
        <CardBody>
          <FeedbackForm defaultPage="/feedback" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`Your feedback (${items.length})`} />
        {items.length ? (
          <ul className="divide-y divide-gray-100">
            {items.map((f) => (
              <li key={f.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{f.subject}</p>
                    <p className="text-xs text-gray-500">
                      {FEEDBACK_CATEGORIES[f.category]} · {formatDateTime(f.createdAt)}
                    </p>
                  </div>
                  <Badge tone={FEEDBACK_STATUS[f.status].tone}>{FEEDBACK_STATUS[f.status].label}</Badge>
                </div>
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
                  <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-950">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-brand-800">
                      <MessageSquare className="h-3.5 w-3.5" /> {f.responderName ?? "Administrator"} replied {f.respondedAt ? `· ${formatDateTime(f.respondedAt)}` : ""}
                    </p>
                    <p className="whitespace-pre-line">{f.response}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No feedback yet" description="Anything you send will appear here with the administrators' replies." />
        )}
      </Card>
    </div>
  );
}
