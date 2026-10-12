import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDot, HelpCircle, MessageSquare, Pencil, Send, XCircle, Ban, Eye } from "lucide-react";
import { DocumentGrid } from "@/components/domain/documents";
import { UploadDocumentsButton } from "@/components/domain/document-actions";
import { CommentForm, ReviewPanel, SubmitDraftButton, VoidExpenseButton } from "@/components/domain/expense-actions";
import { Badge, ExpenseStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DescriptionList, EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { EDITABLE_STATUSES } from "@/lib/balance";
import { formatDate, formatDateTime } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { getExpenseDetail } from "@/lib/services/expenses";
import { getSettings } from "@/lib/services/org";
import { cn } from "@/lib/cn";
import type { ReviewAction } from "@/db/schema";

export const metadata: Metadata = { title: "Expense" };

const REVIEW_META: Record<ReviewAction, { label: string; icon: typeof CircleDot; color: string }> = {
  SUBMITTED: { label: "submitted the expense", icon: Send, color: "text-blue-600 bg-blue-50" },
  RESUBMITTED: { label: "corrected and resubmitted", icon: Send, color: "text-blue-600 bg-blue-50" },
  UNDER_REVIEW: { label: "started reviewing", icon: Eye, color: "text-violet-600 bg-violet-50" },
  APPROVED: { label: "approved the expense", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  REJECTED: { label: "rejected the expense", icon: XCircle, color: "text-red-600 bg-red-50" },
  REQUEST_CLARIFICATION: { label: "asked a question", icon: HelpCircle, color: "text-orange-600 bg-orange-50" },
  COMMENT: { label: "commented", icon: MessageSquare, color: "text-gray-600 bg-gray-100" },
  VOIDED: { label: "voided the expense", icon: Ban, color: "text-gray-600 bg-gray-100" },
};

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const d = await getExpenseDetail(user, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const settings = await getSettings(user.organisationId);
  const e = d.expense;
  const staffView = d.isOwner && !can(user.role, "expenses.review");
  const lastQuery = [...d.reviews].reverse().find((r) => r.action === "REJECTED" || r.action === "REQUEST_CLARIFICATION");
  const returned = e.status === "REJECTED" || e.status === "NEEDS_CLARIFICATION";
  const b = d.balance;
  const canUpload =
    (d.isOwner && !["VOIDED", "RECONCILED"].includes(e.status)) || (can(user.role, "expenses.review") && e.status !== "RECONCILED" && e.status !== "VOIDED");

  return (
    <div>
      <PageHeader
        back={{ href: d.isOwner && !can(user.role, "expenses.viewAll") ? "/expenses" : "/expenses", label: "Expenses" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">{formatMoney(e.amount)}</span>
            <ExpenseStatusBadge status={e.status} staffView={staffView} />
            {e.overBudget && <Badge tone="orange">Over budget</Badge>}
          </span>
        }
        description={
          <>
            <span className="font-medium text-gray-700">{e.description}</span> · {e.reference}
          </>
        }
        actions={
          <>
            {d.canEdit && (
              <LinkButton href={`/expenses/${e.id}/edit`} variant={returned ? "primary" : "secondary"}>
                <Pencil className="h-4 w-4" /> {returned ? "Correct & resubmit" : "Edit"}
              </LinkButton>
            )}
            {d.canEdit && e.status === "DRAFT" && <SubmitDraftButton expenseId={e.id} />}
            {d.canVoid && <VoidExpenseButton expenseId={e.id} own={d.isOwner && !can(user.role, "expenses.void")} />}
          </>
        }
      />

      <div className="space-y-4">
        {returned && lastQuery && (
          <Alert
            tone={e.status === "REJECTED" ? "red" : "amber"}
            title={e.status === "REJECTED" ? `Rejected by ${lastQuery.reviewerName}` : `${lastQuery.reviewerName} asked a question`}
            action={
              d.canEdit ? (
                <LinkButton href={`/expenses/${e.id}/edit`} size="sm" variant="secondary">
                  {e.status === "REJECTED" ? "Correct it" : "Respond"}
                </LinkButton>
              ) : undefined
            }
          >
            “{lastQuery.comment}”
          </Alert>
        )}
        {e.status === "VOIDED" && <Alert tone="blue" title="This expense was voided">{e.voidReason}</Alert>}
        {can(user.role, "expenses.review") && d.similar.length > 0 && (
          <Alert tone="amber" title="Possible duplicate">
            Similar expense{d.similar.length > 1 ? "s" : ""} by the same person:{" "}
            {d.similar.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <Link className="font-medium underline" href={`/expenses/${s.id}`}>
                  {s.reference}
                </Link>{" "}
                ({formatMoney(s.amount)}, {formatDate(s.expenseDate, "short")})
              </span>
            ))}
          </Alert>
        )}
        {can(user.role, "expenses.review") && d.unusual && (
          <Alert tone="amber" title="Unusual expense">
            This is {d.unusual.ratio}× the 90-day average of {formatMoney(d.unusual.average)} for {d.category?.name} ({d.unusual.sample} expenses).
          </Alert>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Expense ID", value: e.reference },
                  { label: "Date", value: formatDate(e.expenseDate, "long") },
                  { label: "Staff", value: d.staff?.fullName },
                  { label: "Category", value: d.category?.name },
                  { label: "Amount", value: <span className="font-semibold">{formatMoney(e.amount)}</span> },
                  { label: "Vendor", value: e.vendor },
                  { label: "Payment method", value: e.paymentMethod },
                  { label: "Reference", value: e.paymentReference },
                  { label: "Project", value: d.project?.name },
                  { label: "Department", value: d.department?.name },
                  { label: "Allocation", value: <Link className="text-brand-700 hover:underline" href={`/allocations/${d.allocation.id}`}>{d.allocation.reference} — {d.allocation.purpose}</Link> },
                  { label: "Submitted", value: e.submittedAt ? formatDateTime(e.submittedAt) : "Not yet submitted" },
                  { label: "Notes", value: e.notes, hidden: !e.notes },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Evidence (${d.documents.length})`}
              description="Receipts and supporting documents"
              action={canUpload ? <UploadDocumentsButton expenseId={e.id} maxUploadMb={settings.maxUploadMb} /> : undefined}
            />
            <CardBody>
              {d.documents.length ? (
                <DocumentGrid
                  docs={d.documents}
                  canRemove={(doc) =>
                    user.role === "ADMIN" ||
                    (d.isOwner && EDITABLE_STATUSES.includes(e.status) && d.documents.find((x) => x.id === doc.id)?.uploadedBy === user.id)
                  }
                />
              ) : (
                <EmptyState icon={<AlertTriangle className="h-6 w-6 text-amber-500" />} title="No receipt attached" description={d.isOwner ? "Upload a receipt so finance can verify this expense." : "Ask the staff member to attach a receipt."} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              {d.reviews.length ? (
                <ol className="relative space-y-5 border-l border-gray-200 pl-6">
                  {d.reviews.map((r) => {
                    const meta = REVIEW_META[r.action];
                    return (
                      <li key={r.id} className="relative">
                        <span className={cn("absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white", meta.color)}>
                          <meta.icon className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{r.reviewerName}</span> {meta.label}
                        </p>
                        <p className="text-xs text-gray-500">{formatDateTime(r.createdAt)}</p>
                        {r.comment && <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{r.comment}</p>}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-gray-500">This expense is still a draft.</p>
              )}
              {e.status !== "VOIDED" && e.status !== "DRAFT" && (d.isOwner || can(user.role, "expenses.review")) && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <CommentForm expenseId={e.id} />
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {d.canReview && (
            <Card className="border-brand-200 lg:sticky lg:top-24">
              <CardHeader title="Review" description={`Submitted by ${d.staff?.fullName}`} />
              <CardBody>
                <ReviewPanel expenseId={e.id} status={e.status} next="/review" />
              </CardBody>
            </Card>
          )}
          {!d.canReview && can(user.role, "expenses.review") && d.isOwner && ["SUBMITTED", "UNDER_REVIEW"].includes(e.status) && (
            <Alert tone="blue">This is your own expense, so another reviewer must approve it.</Alert>
          )}
          <Card>
            <CardHeader title="Fund balance" description={d.allocation.purpose} />
            <CardBody className="space-y-3 text-sm">
              {d.allocation.kind === "REIMBURSEMENT" ? (
                <p className="text-gray-600">Personal-spend record — {formatMoney(b.spent)} paid from personal funds, {formatMoney(b.adjustments)} reimbursed.</p>
              ) : (
                <>
                  <Row label="Received" value={formatMoney(b.totalFunded)} />
                  <Row label="Approved" value={formatMoney(b.approved)} />
                  <Row label="Pending review" value={formatMoney(b.pending)} />
                  {b.returned > 0 && <Row label="Returned" value={formatMoney(b.returned)} />}
                  <div className="border-t border-gray-100 pt-3">
                    <Row label={b.available < 0 ? "Over budget" : "Remaining"} value={formatMoney(Math.abs(b.available))} strong danger={b.available < 0} />
                  </div>
                  <Progress value={b.utilisation} />
                </>
              )}
              <Link href={`/allocations/${d.allocation.id}`} className="block pt-1 text-sm font-medium text-brand-700 hover:underline">
                View allocation
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold", danger ? "text-red-600" : "text-gray-900")}>{value}</span>
    </div>
  );
}
