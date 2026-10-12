import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ExpenseFilters } from "@/components/domain/expense-filters";
import { ExpenseTable } from "@/components/domain/expense-table";
import { ExportMenu } from "@/components/domain/export-menu";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listAllocations } from "@/lib/services/allocations";
import { listExpenses, parseExpenseFilters } from "@/lib/services/expenses";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const finance = can(user.role, "expenses.viewAll");
  const filters = parseExpenseFilters(sp);
  const [result, lookups, allocs] = await Promise.all([
    listExpenses(user, filters),
    getLookups(user.organisationId),
    listAllocations(user, { status: "all", scope: finance && sp.scope !== "mine" ? "all" : "mine" }),
  ]);

  const query = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const makeHref = (page: number) => `/expenses?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page) })}`;
  const isMine = !finance || sp.scope === "mine";
  const canExport = can(user.role, "reports.export") || !finance;

  return (
    <div>
      <PageHeader
        title={isMine ? "My expenses" : "All expenses"}
        description={isMine ? "Everything you've logged, with its review status." : "Every expense logged across the organisation."}
        actions={
          <>
            {canExport && (
              <ExportMenu
                options={[
                  { label: "Current view", description: "Expenses matching the filters below", query: `report=expenses&${query}` },
                  { label: isMine ? "All my expenses" : "All expenses", query: `report=expenses${isMine ? "&scope=mine" : ""}` },
                ]}
              />
            )}
            {can(user.role, "funds.own") && (
              <LinkButton href="/expenses/new">
                <Plus className="h-4 w-4" /> Add expense
              </LinkButton>
            )}
          </>
        }
      />

      {finance && can(user.role, "funds.own") && (
        <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
          <Link href="/expenses" className={cn("rounded-md px-3 py-1.5 font-medium", !isMine ? "bg-white shadow-sm" : "text-gray-600")}>
            All staff
          </Link>
          <Link href="/expenses?scope=mine" className={cn("rounded-md px-3 py-1.5 font-medium", isMine ? "bg-white shadow-sm" : "text-gray-600")}>
            Mine
          </Link>
        </div>
      )}

      <ExpenseFilters values={sp} lookups={lookups} allocations={allocs} finance={finance && !isMine} />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="text-gray-600">
          <span className="font-semibold text-gray-900">{result.count}</span> result{result.count === 1 ? "" : "s"}
        </p>
        <p className="text-gray-600">
          Total: <span className="font-semibold tabular-nums text-gray-900">{formatMoney(result.total)}</span>
        </p>
      </div>

      <Card className="mt-3 overflow-hidden">
        {result.rows.length ? (
          <>
            <ExpenseTable
              rows={result.rows}
              showStaff={!isMine}
              showAllocation
              staffView={isMine && !finance}
              selectable={canExport}
              canBulkApprove={can(user.role, "expenses.review")}
              currentUserId={user.id}
            />
            <Pagination page={result.page} pages={result.pages} makeHref={makeHref} />
          </>
        ) : (
          <EmptyState
            title="No expenses found"
            description={query.toString() ? "Try adjusting or resetting the filters." : "Expenses will appear here once they're logged."}
            action={can(user.role, "funds.own") ? <LinkButton href="/expenses/new">Add expense</LinkButton> : undefined}
          />
        )}
      </Card>
    </div>
  );
}
