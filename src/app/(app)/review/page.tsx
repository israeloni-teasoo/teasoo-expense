import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Paperclip } from "lucide-react";
import { ExpenseTable } from "@/components/domain/expense-table";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { listExpenses } from "@/lib/services/expenses";

export const metadata: Metadata = { title: "Review queue" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePagePermission("expenses.review");
  const { view } = await searchParams;
  const status = view === "queried" ? "NEEDS_CLARIFICATION,REJECTED" : "SUBMITTED,UNDER_REVIEW";
  const result = await listExpenses(user, { status, sort: "submitted", pageSize: 200 });
  const rows = result.rows.filter((r) => r.staffId !== user.id);
  const own = result.rows.length - rows.length;
  const noReceipt = rows.filter((r) => !r.hasReceipt).length;
  const over = rows.filter((r) => r.overBudget).length;
  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Check the receipt, then approve, query or reject. Oldest submissions first."
      />
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        <Link href="/review" className={cn("rounded-md px-3 py-1.5 font-medium", view !== "queried" ? "bg-white shadow-sm" : "text-gray-600")}>
          Awaiting review
        </Link>
        <Link href="/review?view=queried" className={cn("rounded-md px-3 py-1.5 font-medium", view === "queried" ? "bg-white shadow-sm" : "text-gray-600")}>
          Returned to staff
        </Link>
      </div>
      {view !== "queried" && rows.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
            <p className="text-xs text-gray-500">Waiting</p>
            <p className="font-semibold">{rows.length} · {formatMoney(rows.reduce((s, r) => s + r.amount, 0))}</p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
            <p className="flex items-center gap-1 text-xs text-gray-500"><Paperclip className="h-3 w-3" /> No receipt</p>
            <p className={cn("font-semibold", noReceipt && "text-red-600")}>{noReceipt}</p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
            <p className="flex items-center gap-1 text-xs text-gray-500"><AlertTriangle className="h-3 w-3" /> Over budget</p>
            <p className={cn("font-semibold", over && "text-orange-600")}>{over}</p>
          </div>
        </div>
      )}
      <Card className="overflow-hidden">
        {rows.length ? (
          <ExpenseTable rows={rows} showStaff showAllocation selectable={view !== "queried"} canBulkApprove={view !== "queried"} currentUserId={user.id} />
        ) : (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} title={view === "queried" ? "Nothing waiting on staff" : "All caught up"} description={view === "queried" ? undefined : "New submissions will appear here."} />
        )}
      </Card>
      {own > 0 && <p className="mt-3 text-xs text-gray-500">{own} of your own submitted expense(s) are hidden — another reviewer must approve them.</p>}
    </div>
  );
}
