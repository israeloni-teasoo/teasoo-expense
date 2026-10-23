import type { Metadata } from "next";
import Link from "next/link";
import { Ban, CheckCircle2, CircleDot, FileDown, FileText, HelpCircle, MessageSquare, Pencil, RotateCcw, Send, Wallet, XCircle } from "lucide-react";
import { ProcessRequisitionForm, RequisitionCommentForm, RequisitionStep } from "@/components/forms/requisition-forms";
import { DocumentGrid } from "@/components/domain/documents";
import { RequisitionStatusBadge } from "@/components/ui/badge";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { DownloadLink } from "@/components/ui/download-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PrintButton } from "@/components/ui/print-button";
import type { RequisitionEventType } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { notFoundOrSwitch } from "@/lib/org-redirect";
import { formatQuantity } from "@/lib/requisition-rules";
import { getRequisition, paymentTargets } from "@/lib/services/requisitions";

export const metadata: Metadata = { title: "Requisition" };

const EVENTS: Record<RequisitionEventType, { verb: string; icon: typeof Send; tone: string }> = {
  CREATED: { verb: "created the requisition", icon: FileText, tone: "text-gray-500 bg-gray-100" },
  SUBMITTED: { verb: "submitted it", icon: Send, tone: "text-blue-600 bg-blue-50" },
  RESUBMITTED: { verb: "resubmitted it", icon: Send, tone: "text-blue-600 bg-blue-50" },
  RECALLED: { verb: "recalled it for changes", icon: RotateCcw, tone: "text-gray-600 bg-gray-100" },
  APPROVED: { verb: "approved it", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
  REJECTED: { verb: "declined it", icon: XCircle, tone: "text-red-600 bg-red-50" },
  INFO_REQUESTED: { verb: "asked for more information", icon: HelpCircle, tone: "text-orange-600 bg-orange-50" },
  PROCESSED: { verb: "recorded the payment", icon: Wallet, tone: "text-emerald-700 bg-emerald-50" },
  CANCELLED: { verb: "cancelled it", icon: Ban, tone: "text-gray-600 bg-gray-100" },
  COMMENT: { verb: "commented", icon: MessageSquare, tone: "text-gray-600 bg-gray-100" },
};

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("requisitions.create");
  const { id } = await params;
  const d = await getRequisition(user, id).catch(async (e) => {
    if (e instanceof DomainError) await notFoundOrSwitch(user, "requisition", id, `/requisitions/${id}`);
    throw e;
  });
  const r = d.requisition;
  const targets = d.can.process ? await paymentTargets(user) : null;
  const stage =
    r.status === "AWAITING_APPROVAL"
      ? `Waiting for ${d.names.approvers.join(" or ") || "an approver"} to approve`
      : r.status === "APPROVED"
        ? `Approved by ${d.names.approvedBy}. Waiting for ${d.names.executors.join(" or ") || "payment"} to pay`
        : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={r.reference}
        description={r.title}
        back={{ href: "/requisitions", label: "Requisitions" }}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {d.can.edit && (
              <LinkButton href={`/requisitions/${r.id}/edit`} variant="secondary" size="sm">
                <Pencil className="h-4 w-4" /> Edit
              </LinkButton>
            )}
            {d.can.recall && <RequisitionStep id={r.id} step="recall" />}
            {d.can.cancel && <RequisitionStep id={r.id} step="cancel" />}
            <DownloadLink href={`/api/requisitions/${r.id}/pdf`} fallbackName={`Purchase_Request_${r.reference}.pdf`} className={buttonClasses("secondary", "sm")}>
              <FileDown className="h-4 w-4" /> Download PDF
            </DownloadLink>
            <PrintButton label="Print" />
          </div>
        }
      />

      {r.status === "ON_HOLD" && r.decisionReason && (
        <div className="mb-4">
          <Alert tone="amber" title="More information needed" action={d.can.edit ? <LinkButton href={`/requisitions/${r.id}/edit`} size="sm">Update &amp; resubmit</LinkButton> : undefined}>
            {r.decisionReason}
          </Alert>
        </div>
      )}
      {r.status === "REJECTED" && r.decisionReason && (
        <div className="mb-4">
          <Alert tone="red" title="Declined">{r.decisionReason}</Alert>
        </div>
      )}
      {stage && !d.can.approve && !d.can.process && (
        <div className="mb-4 print:hidden">
          <Alert tone="blue">{stage}.</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {(d.can.approve || d.can.process) && (
            <Card className="border-amber-300 ring-1 ring-amber-200 print:hidden" data-testid="req-action-card">
              <CardHeader
                title={d.can.approve ? "Your approval is needed" : "Ready to pay"}
                description={d.can.approve ? `${d.requester?.name} is asking for ${formatMoney(r.total)}.` : `Approved by ${d.names.approvedBy}. Record the payment once it's made.`}
              />
              <CardBody>
                {d.can.approve ? (
                  <div className="flex flex-wrap gap-2">
                    <RequisitionStep id={r.id} step="APPROVE" />
                    <RequisitionStep id={r.id} step="HOLD" />
                    <RequisitionStep id={r.id} step="REJECT" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ProcessRequisitionForm id={r.id} total={r.total} requesterId={r.requesterId} today={todayISO()} staff={targets!.staff} allocations={targets!.allocations} />
                    <div className="border-t border-gray-100 pt-3">
                      <RequisitionStep id={r.id} step="REJECT" />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card className="overflow-hidden" data-testid="req-document">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-5 py-5">
              <div>
                <p className="text-lg font-semibold text-gray-900">{user.organisation.name}</p>
                <p className="text-sm text-gray-500">Purchase request</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{r.reference}</p>
                <div className="mt-1"><RequisitionStatusBadge status={r.status} /></div>
              </div>
            </div>
            <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">Requested by</dt>
                <dd className="font-medium text-gray-900">{d.requester?.name}</dd>
                <dd className="text-xs text-gray-500">{d.requester?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">{r.status === "DRAFT" ? "Will go to" : "Approver"}</dt>
                <dd className="font-medium text-gray-900">{d.names.approvedBy ?? (d.names.approvers.join(" or ") || "—")}</dd>
                {r.submittedAt && <dd className="text-xs text-gray-500">Submitted {formatDate(r.submittedAt)}</dd>}
              </div>
              <div>
                <dt className="text-xs text-gray-500">Needed by</dt>
                <dd className="font-medium text-gray-900">{formatDate(r.expectedDate)}</dd>
              </div>
              <div className="sm:text-right">
                <dt className="text-xs text-gray-500">Total</dt>
                <dd className="text-xl font-semibold tabular-nums text-gray-900">{formatMoney(r.total)}</dd>
              </div>
              {(r.deliveryAddress || r.externalReference) && (
                <>
                  {r.deliveryAddress && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-gray-500">Delivery address</dt>
                      <dd className="whitespace-pre-line text-gray-800">{r.deliveryAddress}</dd>
                    </div>
                  )}
                  {r.externalReference && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-gray-500">Reference</dt>
                      <dd className="text-gray-800">{r.externalReference}</dd>
                    </div>
                  )}
                </>
              )}
              {r.notesToApprover && (
                <div className="sm:col-span-4">
                  <dt className="text-xs text-gray-500">Notes to approver</dt>
                  <dd className="whitespace-pre-line text-gray-800">{r.notesToApprover}</dd>
                </div>
              )}
            </dl>
            <ul className="divide-y divide-gray-100 border-t border-gray-100 sm:hidden">
              {d.items.map((item, i) => (
                <li key={item.id} className="px-5 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium text-gray-900">{i + 1}. {item.itemName}</p>
                    <p className="shrink-0 font-semibold tabular-nums">{formatMoney(item.amount)}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {item.categoryLabel} · {formatQuantity(item.quantity)} × {formatMoney(item.rate)}
                    {item.discount ? ` − ${formatMoney(item.discount)}` : ""}
                  </p>
                  {item.description && <p className="mt-0.5 text-xs text-gray-600">{item.description}</p>}
                  {item.vendor && (
                    <p className="mt-1 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-800">{item.vendor.name}</span>
                      {item.vendor.accountName ? ` · ${item.vendor.accountName}` : ""}
                      {item.vendor.accountNumber ? ` · ${item.vendor.accountNumber}` : ""}
                      {item.vendor.bankName ? ` · ${item.vendor.bankName}` : ""}
                    </p>
                  )}
                </li>
              ))}
              <li className="flex justify-between px-5 py-3 text-sm">
                <span className="font-medium text-gray-700">Total</span>
                <span className="text-base font-semibold tabular-nums">{formatMoney(r.total)}</span>
              </li>
            </ul>
            <div className="hidden overflow-x-auto border-t border-gray-100 sm:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5">#</th>
                    <th className="px-2 py-2.5">Item</th>
                    <th className="px-2 py-2.5 text-right">Qty</th>
                    <th className="px-2 py-2.5 text-right">Price</th>
                    <th className="px-2 py-2.5 text-right">Discount</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 align-top">
                  {d.items.map((item, i) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-gray-900">{item.itemName}</p>
                        <p className="text-xs text-gray-500">{item.categoryLabel}</p>
                        {item.description && <p className="mt-0.5 text-xs text-gray-600">{item.description}</p>}
                        {item.vendor && (
                          <div className="mt-1 text-xs text-gray-600">
                            <p>Vendor: <span className="font-medium text-gray-800">{item.vendor.name}</span></p>
                            {item.vendor.accountName && <p>Account name: {item.vendor.accountName}</p>}
                            {item.vendor.accountNumber && <p>Account number: <span className="font-mono">{item.vendor.accountNumber}</span></p>}
                            {item.vendor.bankName && <p>Bank: {item.vendor.bankName}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{formatMoney(item.rate)}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-gray-500">{item.discount ? formatMoney(item.discount) : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums">{formatMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={5} className="px-5 py-3 text-right font-medium text-gray-700">Total</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-base font-semibold tabular-nums">{formatMoney(r.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {r.status === "PROCESSED" && (
              <div className="border-t border-gray-100 bg-emerald-50/50 px-5 py-4 text-sm" data-testid="req-payment">
                <p className="font-medium text-emerald-900">
                  Paid {formatDate(r.paymentDate)} by {d.names.processedBy}
                  {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
                  {r.paymentReference ? ` · ref ${r.paymentReference}` : ""}
                </p>
                {r.paymentNotes && <p className="mt-1 text-emerald-900">{r.paymentNotes}</p>}
                {d.paidAllocation && (
                  <p className="mt-1 text-emerald-900">
                    Paid to {d.paidAllocation.staffName} as part of allocation{" "}
                    <Link href={`/allocations/${d.paidAllocation.id}`} className="font-medium underline">
                      {d.paidAllocation.reference}
                    </Link>{" "}
                    — they record their expenses against it.
                  </p>
                )}
              </div>
            )}
          </Card>

          {d.documents.length > 0 && (
            <Card>
              <CardHeader title="Documents" description="Quotes, invoices and proof of payment" />
              <CardBody>
                <DocumentGrid docs={d.documents.map((doc) => ({ ...doc, caption: doc.uploaderName }))} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6 print:hidden">
          <Card>
            <CardHeader title="Approval history" />
            <CardBody>
              <ol className="space-y-4" data-testid="req-history">
                {d.events.map((e) => {
                  const ev = EVENTS[e.type];
                  const Icon = ev.icon;
                  return (
                    <li key={e.id} className="flex gap-3">
                      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", ev.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 text-sm">
                        <p className="text-gray-900">
                          <span className="font-medium">{e.actorName}</span> {ev.verb}
                          {e.targetName && (e.type === "SUBMITTED" || e.type === "RESUBMITTED" || e.type === "APPROVED") ? (
                            <span className="text-gray-600"> {e.type === "APPROVED" ? "— sent to" : "to"} {e.targetName}</span>
                          ) : null}
                        </p>
                        {e.comment && <p className="mt-0.5 whitespace-pre-line rounded-lg bg-gray-50 px-2.5 py-1.5 text-gray-700">{e.comment}</p>}
                        <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(e.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
                {stage && (
                  <li className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      <CircleDot className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm text-gray-600">{stage}</p>
                  </li>
                )}
              </ol>
            </CardBody>
            {d.can.comment && (
              <CardBody className="border-t border-gray-100">
                <RequisitionCommentForm id={r.id} />
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
