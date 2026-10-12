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
import { listAllocations } from "@/lib/services/allocations";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "My funds" };

export default async function FundsPage() {
  const user = await requirePagePermission("funds.own");
  const [all, lookups] = await Promise.all([listAllocations(user, { scope: "mine", status: "all" }), getLookups(user.organisationId)]);
  const active = all.filter((a) => a.status === "ACTIVE");
  const closed = all.filter((a) => a.status !== "ACTIVE" && a.status !== "VOIDED");
  const received = active.reduce((s, a) => s + a.balance.totalFunded, 0);
  const spent = active.reduce((s, a) => s + a.balance.spent, 0);
  const remaining = active.reduce((s, a) => s + a.balance.available, 0);
  return (
    <div>
      <PageHeader
        title="My funds"
        description="Money you’ve been given, what it’s for, and how much is left."
        actions={
          <ModalButton label="Log personal spend" icon={<HandCoins className="h-4 w-4" />} title="Spent your own money?">
            <PersonalSpendForm projects={lookups.activeProjects} today={todayISO()} />
          </ModalButton>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Received" value={formatMoney(received)} />
        <StatCard label="Spent" value={formatMoney(spent)} />
        <StatCard tone="brand" label="Remaining" value={formatMoney(remaining)} />
      </div>
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
