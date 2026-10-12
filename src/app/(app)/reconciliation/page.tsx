import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AllocationStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { personalSpendOwed } from "@/lib/balance";
import { listAllocations, type AllocationListItem } from "@/lib/services/allocations";

export const metadata: Metadata = { title: "Reconciliation" };

function Section({ title, description, rows, cta }: { title: string; description: string; rows: AllocationListItem[]; cta: (a: AllocationListItem) => string }) {
  return (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} description={description} />
      {rows.length ? (
        <ul className="divide-y divide-gray-100">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/allocations/${a.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{a.purpose}</p>
                  <p className="truncate text-xs text-gray-500">
                    {a.staffName} · {a.reference}
                    {a.expectedCompletionDate ? ` · due ${formatDate(a.expectedCompletionDate, "short")}` : ""}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right text-xs text-gray-500">
                    <span className="block text-sm font-medium tabular-nums text-gray-900">
                      {a.kind === "REIMBURSEMENT" ? `${formatMoney(personalSpendOwed(a.balance))} owed` : formatMoney(a.balance.totalFunded)}
                    </span>
                    {formatMoney(a.balance.approved)} approved
                  </div>
                  <AllocationStatusBadge status={a.status} overdue={a.overdue} overBudget={a.balance.overBudget && a.kind === "ADVANCE"} />
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-700">
                    {cta(a)} <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing here" />
      )}
    </Card>
  );
}

export default async function ReconciliationPage() {
  const user = await requirePagePermission("allocations.reconcile");
  const all = await listAllocations(user, { status: "all" });
  // Personal spend is settled (refund or offset), not reconciled against a funded amount.
  const personal = all.filter((a) => a.status === "ACTIVE" && a.kind === "REIMBURSEMENT");
  const active = all.filter((a) => a.status === "ACTIVE" && a.kind !== "REIMBURSEMENT");
  const owedToStaff = personal.filter((a) => personalSpendOwed(a.balance) > 0);
  const personalReady = personal.filter((a) => a.readyToReconcile);
  const ready = active.filter((a) => a.readyToReconcile);
  const awaitingReturn = active.filter((a) => !a.readyToReconcile && a.balance.counts.total > 0 && a.balance.counts.pending + a.balance.counts.draft + a.balance.counts.rejected === 0 && a.balance.outstanding > 0);
  const overBudget = active.filter((a) => a.balance.outstanding < 0);
  const inProgress = active.filter((a) => !ready.includes(a) && !awaitingReturn.includes(a) && !overBudget.includes(a));
  const reconciled = all.filter((a) => a.status === "RECONCILED").slice(0, 20);
  return (
    <div>
      <PageHeader title="Reconciliation" description="Close out allocations once every naira has a traceable destination." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard tone="green" label="Ready" value={ready.length} hint="Can be reconciled now" />
        <StatCard label="Awaiting return" value={awaitingReturn.length} hint={formatMoney(awaitingReturn.reduce((s, a) => s + a.balance.outstanding, 0))} />
        <StatCard tone={overBudget.length ? "red" : "default"} label="Over budget" value={overBudget.length} hint="Need a claim decision" />
        <StatCard label="In progress" value={inProgress.length} hint={`${inProgress.filter((a) => a.overdue).length} overdue`} />
        <StatCard
          tone={owedToStaff.length ? "amber" : "default"}
          label="Owed to staff"
          value={formatMoney(owedToStaff.reduce((t, a) => t + personalSpendOwed(a.balance), 0))}
          hint={`${owedToStaff.length} personal-spend record${owedToStaff.length === 1 ? "" : "s"}`}
          href="#personal"
        />
      </div>
      <div className="space-y-6">
        <Section title="Ready to reconcile" description="All expenses approved and the balance is fully accounted for." rows={ready} cta={() => "Reconcile"} />
        <Section title="Awaiting return of unspent funds" description="Expenses are resolved; record the money returned to close." rows={awaitingReturn} cta={() => "Record return"} />
        <Section title="Over budget" description="Approved spending exceeds the funds. Decide the staff member's claim or add funding." rows={overBudget} cta={() => "Review"} />
        <div id="personal" className="scroll-mt-24">
          <Section
            title="Personal spend owed to staff"
            description="Staff's own money. Settle it with a company refund or from their unspent allocated funds; it never reduces their allocations."
            rows={owedToStaff}
            cta={() => "Settle"}
          />
        </div>
        {personalReady.length > 0 && (
          <Section title="Personal spend fully settled" description="Every approved amount has been refunded or offset — reconcile to close." rows={personalReady} cta={() => "Reconcile"} />
        )}
        <Section title="In progress" description="Still being spent or reviewed." rows={inProgress} cta={(a) => (a.overdue ? "Follow up" : "View")} />
        <Section title="Recently reconciled" description="Closed allocations." rows={reconciled} cta={() => "View"} />
      </div>
    </div>
  );
}
