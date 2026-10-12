import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { AllocationCard } from "@/components/domain/allocation-card";
import { PersonalSpendForm } from "@/components/forms/allocation-forms";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { personalSpendOwed } from "@/lib/balance";
import { listAllocations } from "@/lib/services/allocations";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "My funds" };

export default async function FundsPage() {
  const user = await requirePagePermission("funds.own");
  const [all, lookups] = await Promise.all([listAllocations(user, { scope: "mine", status: "all" }), getLookups(user.organisationId)]);
  const active = all.filter((a) => a.status === "ACTIVE");
  const closed = all.filter((a) => a.status !== "ACTIVE" && a.status !== "VOIDED");
  // Personal spend is the staff member's own money — never part of allocated totals.
  const funded = active.filter((a) => a.kind !== "REIMBURSEMENT");
  const personal = active.filter((a) => a.kind === "REIMBURSEMENT");
  const received = funded.reduce((s, a) => s + a.balance.totalFunded, 0);
  const spent = funded.reduce((s, a) => s + a.balance.spent, 0);
  const remaining = funded.reduce((s, a) => s + a.balance.available, 0);
  const owed = personal.reduce((s, a) => s + personalSpendOwed(a.balance), 0);
  const owedPending = personal.reduce((s, a) => s + a.balance.pending, 0);
  return (
    <div>
      <PageHeader
        title="My funds"
        description="Money you’ve been given, what it’s for, and how much is left."
        actions={
          <ModalButton label="New personal spend record" icon={<HandCoins className="h-4 w-4" />} title="Spent your own money?">
            <PersonalSpendForm projects={lookups.activeProjects} today={todayISO()} />
          </ModalButton>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Received" value={formatMoney(received)} />
        <StatCard label="Spent" value={formatMoney(spent)} />
        <StatCard tone="brand" label="Remaining" value={formatMoney(remaining)} />
      </div>
      {(owed > 0 || owedPending > 0) && (
        <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <span className="font-semibold">Owed to you: {formatMoney(owed)}</span>
          {owedPending > 0 ? ` · ${formatMoney(owedPending)} awaiting review` : ""} — personal spend, kept separate from your allocated funds.
        </p>
      )}
      <h2 className="mb-3 mt-8 text-base font-semibold text-gray-900">Active ({active.length})</h2>
      {active.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((a) => (
            <AllocationCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState title="No active funds" description="Funds assigned to you by finance will appear here." />
        </Card>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-base font-semibold text-gray-900">Completed ({closed.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {closed.map((a) => (
              <AllocationCard key={a.id} a={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
