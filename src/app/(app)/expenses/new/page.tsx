import type { Metadata } from "next";
import { ExpenseForm } from "@/components/forms/expense-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { todayISO } from "@/lib/dates";
import { listAllocations } from "@/lib/services/allocations";
import { getLookups, getSettings } from "@/lib/services/org";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ allocation?: string }> }) {
  const user = await requirePagePermission("funds.own");
  const { allocation } = await searchParams;
  const [funds, lookups, settings] = await Promise.all([
    listAllocations(user, { scope: "mine", status: "ACTIVE" }),
    getLookups(user.organisationId),
    getSettings(user.organisationId),
  ]);
  const preselected = funds.find((f) => f.id === allocation)?.id;
  return (
    <div>
      <PageHeader title="Add expense" description="Log what you spent — your balance updates automatically." back={{ href: "/expenses", label: "Expenses" }} />
      <ExpenseForm
        funds={funds.map((f) => ({ id: f.id, reference: f.reference, purpose: f.purpose, kind: f.kind, available: f.balance.available, totalFunded: f.balance.totalFunded, projectId: f.projectId }))}
        categories={lookups.activeCategories}
        projects={lookups.activeProjects}
        initial={{ allocationId: preselected, expenseDate: todayISO() }}
        requireReceipt={settings.requireReceipt}
        maxUploadMb={settings.maxUploadMb}
        today={todayISO()}
      />
    </div>
  );
}
