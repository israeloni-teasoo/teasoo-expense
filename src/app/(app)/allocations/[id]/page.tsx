import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Ban, CheckCircle2, HandCoins, Pencil, PiggyBank, Plus, RotateCcw, Scale, Undo2 } from "lucide-react";
import { DocumentGrid } from "@/components/domain/documents";
import { ExpenseTable } from "@/components/domain/expense-table";
import { ExportMenu } from "@/components/domain/export-menu";
import { AddFundingForm, AllocationStatusForm, ClaimForm, EditAllocationForm, RecordReturnForm, ReconcileForm, SettlePersonalSpendForm } from "@/components/forms/allocation-forms";
import { AllocationStatusBadge, Badge, ClaimStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DescriptionList, EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requireUser } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { ADJUSTMENT_LABELS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { getAllocationDetail, listAllocations } from "@/lib/services/allocations";
import { personalSpendOwed } from "@/lib/balance";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Allocation" };

const TABS = [
  { key: "expenses", label: "Expenses" },
  { key: "documents", label: "Documents" },
  { key: "funding", label: "Funding & returns" },
  { key: "activity", label: "Activity" },
] as const;

export default async function AllocationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "expenses";
  const d = await getAllocationDetail(user, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const a = d.allocation;
  const b = d.balance;
  const isOwner = a.staffId === user.id;
  const active = a.status === "ACTIVE";
  const personal = a.kind === "REIMBURSEMENT";
  const finance = can(user.role, "allocations.viewAll");
  const lookups = can(user.role, "allocations.create") ? await getLookups(user.organisationId) : null;
  const owed = personal ? personalSpendOwed(b) : 0;
  // Funds the staff member holds that a personal-spend settlement can be offset against.
  const settlementSources =
    personal && can(user.role, "allocations.reconcile")
      ? (await listAllocations(user, { staffId: a.staffId, status: "ACTIVE" })).filter((x) => x.kind === "ADVANCE" && x.balance.available > 0)
      : [];
  const openClaim = d.claims.find((c) => c.status === "SUBMITTED" || c.status === "RECOMMENDED");
  const unresolved = b.counts.pending + b.counts.draft + b.counts.rejected;

  const steps = [
    { label: "Allocated", value: b.initial, show: true },
    { label: personal ? "Settled (refunded / offset)" : b.adjustments < 0 ? "Funding adjustments" : "Additional funding", value: b.adjustments, show: b.adjustments !== 0 },
    { label: "Approved expenses", value: -b.approved, show: true },
    { label: "Pending review", value: -b.pending, show: b.pending > 0 },
    { label: "Rejected (not counted)", value: b.rejected, show: b.rejected > 0, muted: true },
    { label: "Returned", value: -b.returned, show: b.returned > 0 },
  ];

  return (
    <div>
      <PageHeader
        back={finance ? { href: "/allocations", label: "Allocations" } : { href: "/funds", label: "My funds" }}
        title={a.purpose}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{d.staff?.fullName}</span>
            <span className="text-gray-300">·</span>
            <span>{a.reference}</span>
            <span className="text-gray-300">·</span>
            {personal ? <Badge tone="purple">Personal spend</Badge> : <AllocationStatusBadge status={a.status} overdue={d.overdue} overBudget={b.overBudget} />}
          </span>
        }
        actions={
          <>
            {isOwner && active && (
              <LinkButton href={`/expenses/new?allocation=${a.id}`}>
                <Plus className="h-4 w-4" /> Add expense
              </LinkButton>
            )}
            {isOwner && active && !openClaim && !personal && (
              <ModalButton
                label={b.overBudget ? "Log over-spend claim" : "Request more funds"}
                icon={<HandCoins className="h-4 w-4" />}
                variant={b.overBudget ? "primary" : "secondary"}
                title="Log a claim"
                description="Claims are reviewed by finance and approved by an administrator."
              >
                <ClaimForm allocationId={a.id} suggested={b.overspend} kind={a.kind} />
              </ModalButton>
            )}
            {personal && active && owed > 0 && can(user.role, "allocations.reconcile") && !isOwner && (
              <ModalButton
                label="Settle personal spend"
                icon={<HandCoins className="h-4 w-4" />}
                variant="primary"
                title="Settle personal spend"
                description={`${formatMoney(owed)} of approved personal spend is owed to ${d.staff?.fullName}.`}
              >
                <SettlePersonalSpendForm
                  allocationId={a.id}
                  owed={owed}
                  sources={settlementSources.map((s) => ({ id: s.id, label: `${s.reference} — ${s.purpose}`, available: s.balance.available }))}
                />
              </ModalButton>
            )}
            {active && can(user.role, "allocations.create") && !personal && (
              <ModalButton label="Add funds" icon={<PiggyBank className="h-4 w-4" />} title="Add funds to this allocation" description="Additional funding is recorded separately from the original amount.">
                <AddFundingForm allocationId={a.id} isAdmin={user.role === "ADMIN"} />
              </ModalButton>
            )}
            {active && can(user.role, "returns.record") && b.available > 0 && (
              <ModalButton label="Record return" icon={<Undo2 className="h-4 w-4" />} title="Record returned funds" description="The system never assumes unspent money was returned — record it here.">
                <RecordReturnForm allocationId={a.id} unspent={b.available} today={todayISO()} />
              </ModalButton>
            )}
            {active && can(user.role, "allocations.reconcile") && (
              <ModalButton label="Reconcile" icon={<Scale className="h-4 w-4" />} variant={d.readyToReconcile ? "success" : "secondary"} title="Reconcile allocation">
                {d.readyToReconcile ? (
                  <ReconcileForm
                    allocationId={a.id}
                    summary={[
                      { label: "Received", value: formatMoney(b.totalFunded) },
                      { label: "Approved expenses", value: formatMoney(b.approved) },
                      { label: "Amount returned", value: formatMoney(b.returned) },
                      { label: "Final balance", value: formatMoney(b.outstanding), strong: true },
                    ]}
                  />
                ) : (
                  <ReconcileChecklist unresolved={unresolved} outstanding={b.outstanding} openClaim={!!openClaim} hasExpenses={b.counts.total > 0} personal={personal} />
                )}
              </ModalButton>
            )}
            {(finance || isOwner) && (
              <ExportMenu label="Export" options={[{ label: "This allocation", description: "Summary + all expenses", query: `report=allocation&allocationId=${a.id}` }]} />
            )}
          </>
        }
      />

      {/* Status banners */}
      <div className="space-y-3">
        {personal && active && (owed > 0 || b.pending > 0) && (
          <Alert tone="blue" title={isOwner ? `Owed to you: ${formatMoney(owed)}` : `${formatMoney(owed)} owed to ${d.staff?.fullName}`}>
            {isOwner
              ? "This is your own money, kept separate from your allocated funds. Once approved, finance refunds you or settles it from funds you're holding."
              : settlementSources.length
                ? `Settle it with a company refund, or from their unspent allocated funds (${settlementSources.map((s) => `${s.reference}: ${formatMoney(s.balance.available)}`).join(", ")}).`
                : "Settle it with a company refund — they hold no unspent allocated funds to offset against."}
            {b.pending > 0 ? ` ${formatMoney(b.pending)} is still awaiting review.` : ""}
          </Alert>
        )}
        {b.overBudget && !personal && active && (
          <Alert tone="red" title={`Over budget by ${formatMoney(b.overspend)}`}>
            {openClaim
              ? `Claim ${openClaim.reference} for ${formatMoney(openClaim.amount)} is being processed.`
              : isOwner
                ? "Spending is above the funds you were given. Log a claim with evidence of approval to be reimbursed."
                : "Spending exceeds this allocation. The staff member should log a claim with evidence of approval."}
          </Alert>
        )}
        {d.overdue && <Alert tone="amber" title="Overdue">Expected to be completed by {formatDate(a.expectedCompletionDate, "long")}.</Alert>}
        {active && finance && d.readyToReconcile && (
          <Alert tone="green" title="Ready to reconcile">All expenses are approved and every naira is accounted for.</Alert>
        )}
        {active && finance && !d.readyToReconcile && unresolved === 0 && b.available > 0 && b.counts.total > 0 && !personal && (
          <Alert tone="blue" title={`Unspent balance ${formatMoney(b.available)}`}>All expenses are resolved. Record the return of unspent funds to reconcile.</Alert>
        )}
        {a.status === "RECONCILED" && d.reconciliation && (
          <Alert tone="green" title="Fully reconciled">
            Reconciled on {formatDateTime(d.reconciliation.reconciledAt)} — {formatMoney(d.reconciliation.totalFunded)} received, {formatMoney(d.reconciliation.approvedExpenses)} approved, {formatMoney(d.reconciliation.amountReturned)} returned, {formatMoney(d.reconciliation.finalBalance)} outstanding.
            {d.reconciliation.notes ? ` ${d.reconciliation.notes}` : ""}
          </Alert>
        )}
        {a.status === "VOIDED" && <Alert tone="blue" title="Voided">{a.voidReason}</Alert>}
      </div>

      {/* Headline numbers */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={personal ? "Settled" : "Received"} value={formatMoney(personal ? b.adjustments : b.totalFunded)} />
        <Figure label="Spent" value={formatMoney(b.spent)} sub={`${b.counts.total} expense${b.counts.total === 1 ? "" : "s"}`} />
        <Figure label="Pending review" value={formatMoney(b.pending)} sub={b.counts.pending ? `${b.counts.pending} waiting` : undefined} />
        <Figure
          label={personal ? (isOwner ? "Owed to you" : "Owed to staff") : b.available < 0 ? "Over budget" : "Remaining"}
          value={formatMoney(personal ? owed : Math.abs(b.available))}
          sub={personal && b.pending > 0 ? `+ ${formatMoney(b.pending)} once approved` : undefined}
          highlight={personal ? "purple" : b.available < 0 ? "red" : "brand"}
        />
      </section>
      {!personal && (
        <div className="mt-3 flex items-center gap-3">
          <Progress value={b.utilisation} className="h-2.5 flex-1" />
          <span className="text-sm font-medium tabular-nums text-gray-600">{b.utilisation}% used</span>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {/* Tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 scrollbar-none">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/allocations/${a.id}?tab=${t.key}`}
                scroll={false}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
                  tab === t.key ? "border-brand-700 text-brand-800" : "border-transparent text-gray-500 hover:text-gray-800",
                )}
              >
                {t.label}
                {t.key === "expenses" && <span className="ml-1.5 text-xs text-gray-400">{d.expenses.filter((e) => e.status !== "VOIDED").length}</span>}
                {t.key === "documents" && <span className="ml-1.5 text-xs text-gray-400">{d.documents.length}</span>}
              </Link>
            ))}
          </div>

          {tab === "expenses" && (
            <Card className="overflow-hidden">
              {d.expenses.length ? (
                <ExpenseTable
                  rows={d.expenses.map((e) => ({ ...e, hasReceipt: e.docCount > 0 }))}
                  staffView={isOwner && !finance}
                  compact
                />
              ) : (
                <EmptyState
                  title="No expenses yet"
                  description={isOwner ? "Log each purchase as you make it, with a photo of the receipt." : "The staff member hasn't logged any expenses against this allocation."}
                  action={isOwner && active ? <LinkButton href={`/expenses/new?allocation=${a.id}`}>Add expense</LinkButton> : undefined}
                />
              )}
            </Card>
          )}

          {tab === "documents" && (
            <Card>
              <CardBody>
                {d.documents.length ? (
                  <DocumentGrid
                    docs={d.documents.map((doc) => ({
                      ...doc,
                      caption: doc.expenseRef ? `${doc.expenseRef} · ${doc.expenseDescription}` : doc.kind === "TRANSFER_RECEIPT" ? "Original transfer receipt" : undefined,
                    }))}
                  />
                ) : (
                  <EmptyState title="No documents" description="Transfer receipts, expense receipts and supporting documents appear here." />
                )}
              </CardBody>
            </Card>
          )}

          {tab === "funding" && (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Funding" />
                <ul className="divide-y divide-gray-100 text-sm">
                  <li className="flex justify-between gap-4 px-4 py-3 sm:px-5">
                    <div>
                      <p className="font-medium text-gray-900">{personal ? "Personal-spend record opened" : "Initial allocation"}</p>
                      <p className="text-xs text-gray-500">{formatDate(a.dateReceived, "long")} · by {d.createdBy}</p>
                    </div>
                    <span className="font-medium tabular-nums">{formatMoney(a.initialAmount)}</span>
                  </li>
                  {d.adjustments.map((adj) => (
                    <li key={adj.id} className="flex justify-between gap-4 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{ADJUSTMENT_LABELS[adj.type]}</p>
                        <p className="text-xs text-gray-500">{adj.reason}</p>
                        <p className="text-xs text-gray-400">{formatDateTime(adj.createdAt)} · by {adj.byName}</p>
                      </div>
                      <span className={cn("shrink-0 font-medium tabular-nums", adj.amount < 0 ? "text-red-600" : "text-emerald-700")}>{formatMoney(adj.amount, { sign: true })}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Returns" description="Unspent funds given back by the staff member" />
                {d.returns.length ? (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {d.returns.map((r) => (
                      <li key={r.id} className="flex justify-between gap-4 px-4 py-3 sm:px-5">
                        <div>
                          <p className="font-medium text-gray-900">{r.paymentMethod ?? "Return"}{r.reference ? ` · ${r.reference}` : ""}</p>
                          <p className="text-xs text-gray-500">{formatDate(r.returnDate, "long")} · recorded by {r.byName}</p>
                          {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                        </div>
                        <span className="font-medium tabular-nums">{formatMoney(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No returns recorded" />
                )}
              </Card>
              <Card>
                <CardHeader title="Claims" description="Over-spend reimbursements and requests for more funds" />
                {d.claims.length ? (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {d.claims.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{c.reference} · {c.type === "REIMBURSEMENT" ? "Reimbursement" : "Additional funds"}</p>
                          <p className="text-xs text-gray-500">{c.reason}</p>
                          {(c.decisionComment || c.reviewComment) && <p className="text-xs text-gray-500">“{c.decisionComment || c.reviewComment}”</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-medium tabular-nums">{formatMoney(c.amount)}</p>
                          <ClaimStatusBadge status={c.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No claims" />
                )}
                {(finance || isOwner) && d.claims.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 text-right sm:px-5">
                    <Link href="/claims" className="text-sm font-medium text-brand-700">Open claims</Link>
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === "activity" && (
            <Card>
              <CardHeader title="Audit timeline" description="Every action on this allocation, newest first" />
              <CardBody>
                {d.activity.length ? (
                  <ol className="relative space-y-5 border-l border-gray-200 pl-5">
                    {d.activity.map((ev) => (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                        <p className="text-xs font-medium text-gray-500">{formatDateTime(ev.createdAt)}</p>
                        <p className="mt-0.5 text-sm text-gray-900">{ev.summary}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState title="No activity yet" />
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Balance breakdown" description="Calculated automatically from the records" />
            <CardBody className="space-y-2.5 text-sm">
              {steps
                .filter((s) => s.show)
                .map((s) => (
                  <div key={s.label} className={cn("flex justify-between gap-4", s.muted && "text-gray-400")}>
                    <span className={s.muted ? "" : "text-gray-600"}>{s.label}</span>
                    <span className="tabular-nums">{s.muted ? formatMoney(s.value) : formatMoney(s.value, { sign: s.value !== 0 && s.label !== "Allocated" })}</span>
                  </div>
                ))}
              <div className="flex justify-between gap-4 border-t border-gray-200 pt-2.5 font-semibold">
                <span>{a.status === "RECONCILED" ? "Final balance" : b.available < 0 ? (personal ? "Owed to staff" : "Over budget") : "Available balance"}</span>
                <span className={cn("tabular-nums", b.available < 0 && !personal && "text-red-600")}>{formatMoney(a.status === "RECONCILED" ? b.outstanding : b.available)}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Allocation details"
              action={
                active && lookups ? (
                  <ModalButton label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} size="sm" variant="ghost" title="Edit allocation">
                    <EditAllocationForm a={a} departments={lookups.activeDepartments} projects={lookups.activeProjects} />
                  </ModalButton>
                ) : undefined
              }
            />
            <CardBody>
              <DescriptionList
                className="sm:grid-cols-1"
                items={[
                  { label: "Allocation ID", value: a.reference },
                  { label: "Staff", value: d.staff?.fullName },
                  { label: "Amount received", value: formatMoney(a.initialAmount), hidden: personal },
                  { label: "Date received", value: formatDate(a.dateReceived, "long") },
                  { label: "Expected completion", value: a.expectedCompletionDate ? formatDate(a.expectedCompletionDate, "long") : null },
                  { label: "Department", value: d.department?.name },
                  { label: "Project", value: d.project?.name },
                  { label: "Transfer reference", value: a.transferReference, hidden: !a.transferReference },
                  { label: "Funding source", value: a.fundingSource, hidden: !a.fundingSource },
                  { label: "Approving officer", value: a.approvingOfficer, hidden: !a.approvingOfficer },
                  { label: "Notes", value: a.notes, hidden: !a.notes },
                  { label: "Created by", value: d.createdBy },
                ]}
              />
            </CardBody>
          </Card>

          {can(user.role, "allocations.create") && (
            <div className="flex flex-wrap gap-2">
              {active && b.counts.total === 0 && (
                <ModalButton label="Void allocation" icon={<Ban className="h-4 w-4" />} variant="ghost" size="sm" className="text-red-600" title="Void allocation" description="Use this when an allocation was created in error. It stays in the audit trail.">
                  <AllocationStatusForm allocationId={a.id} status="VOIDED" label="Void allocation" danger />
                </ModalButton>
              )}
              {a.status === "RECONCILED" && (
                <ModalButton label="Archive" icon={<Archive className="h-4 w-4" />} variant="ghost" size="sm" title="Archive allocation">
                  <AllocationStatusForm allocationId={a.id} status="ARCHIVED" label="Archive" />
                </ModalButton>
              )}
              {a.status === "ARCHIVED" && (
                <ModalButton label="Restore" icon={<RotateCcw className="h-4 w-4" />} variant="ghost" size="sm" title="Restore allocation">
                  <AllocationStatusForm allocationId={a.id} status="ACTIVE" label="Restore" />
                </ModalButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: "brand" | "red" | "purple" }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight === "brand" ? "border-brand-800 bg-brand-800 text-white" : highlight === "red" ? "border-red-200 bg-red-50 text-red-800" : highlight === "purple" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-gray-200 bg-white",
      )}
    >
      <p className={cn("text-xs font-medium uppercase tracking-wide", highlight === "brand" ? "text-brand-100" : "text-gray-500")}>{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
      {sub && <p className={cn("text-xs", highlight === "brand" ? "text-brand-100" : "text-gray-500")}>{sub}</p>}
    </div>
  );
}

function ReconcileChecklist({
  unresolved,
  outstanding,
  openClaim,
  hasExpenses,
  personal,
}: {
  unresolved: number;
  outstanding: number;
  openClaim: boolean;
  hasExpenses: boolean;
  personal?: boolean;
}) {
  const items = [
    { ok: hasExpenses, text: "At least one expense has been logged" },
    { ok: unresolved === 0, text: unresolved ? `${unresolved} expense(s) still draft, pending, rejected or queried` : "All expenses are approved or voided" },
    { ok: !openClaim, text: openClaim ? "An open claim needs a decision" : "No open claims" },
    {
      ok: outstanding === 0,
      text:
        outstanding > 0
          ? `${formatMoney(outstanding)} unspent — record the return first`
          : outstanding < 0
            ? personal
              ? `${formatMoney(-outstanding)} still owed to the staff member — settle it first`
              : `${formatMoney(-outstanding)} over budget — approve a reimbursement claim first`
            : "Every naira is accounted for",
    },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">This allocation can be reconciled once:</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.text} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", i.ok ? "text-emerald-600" : "text-gray-300")} />
            <span className={i.ok ? "text-gray-700" : "text-gray-900 font-medium"}>{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
