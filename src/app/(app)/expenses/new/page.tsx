import type { Metadata } from "next";
import Link from "next/link";
import { BatchExpenseForm } from "@/components/forms/batch-expense-form";
import { ExpenseForm } from "@/components/forms/expense-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/dates";
import { listAllocations } from "@/lib/services/allocations";
import { getLookups, getSettings } from "@/lib/services/org";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ allocation?: string; mode?: string }> }) {
  const user = await requirePagePermission("funds.own");
  const { allocation, mode } = await searchParams;
  const batch = mode === "batch";
  const [funds, lookups, settings] = await Promise.all([
    listAllocations(user, { scope: "mine", status: "ACTIVE" }),
    getLookups(user.organisationId),
    getSettings(user.organisationId),
  ]);
  const preselected = funds.find((f) => f.id === allocation)?.id;
  const fundOptions = funds.map((f) => ({ id: f.id, reference: f.reference, purpose: f.purpose, kind: f.kind, available: f.balance.available, totalFunded: f.balance.totalFunded, projectId: f.projectId }));
  const keep = preselected ? `allocation=${preselected}` : "";
  const tab = (active: boolean) => cn("rounded-md px-3 py-1.5 font-medium", active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900");
  return (
    <div>
      <PageHeader
        title={batch ? "Add expenses" : "Add expense"}
        description={batch ? "Log several expenses at once — each one gets its own category and receipt." : "Log what you spent — your balance updates automatically."}
        back={{ href: "/expenses", label: "Expenses" }}
      />
      <div className="mb-5 inline-flex rounded-lg bg-gray-100 p-1 text-sm" role="tablist" aria-label="How many expenses">
        <Link href={`/expenses/new${keep ? `?${keep}` : ""}`} className={tab(!batch)} role="tab" aria-selected={!batch}>
          One expense
        </Link>
        <Link href={`/expenses/new?mode=batch${keep ? `&${keep}` : ""}`} className={tab(batch)} role="tab" aria-selected={batch}>
          Several at once
        </Link>
      </div>
      {batch ? (
        <BatchExpenseForm
          funds={fundOptions}
          categories={lookups.activeCategories}
          requireReceipt={settings.requireReceipt}
          maxUploadMb={settings.maxUploadMb}
          today={todayISO()}
          initialAllocationId={preselected}
        />
      ) : (
        <ExpenseForm
          funds={fundOptions}
          categories={lookups.activeCategories}
          projects={lookups.activeProjects}
          initial={{ allocationId: preselected, expenseDate: todayISO() }}
          requireReceipt={settings.requireReceipt}
          maxUploadMb={settings.maxUploadMb}
          today={todayISO()}
        />
      )}
    </div>
  );
}
