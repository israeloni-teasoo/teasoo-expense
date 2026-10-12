import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { AllocationStatusBadge, Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import type { BalanceSummary } from "@/lib/balance";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { AllocationStatus } from "@/db/schema";

export function AllocationCard({
  a,
  showStaff,
}: {
  a: {
    id: string;
    reference: string;
    purpose: string;
    kind: string;
    status: AllocationStatus;
    staffName?: string;
    balance: BalanceSummary;
    lastActivity: Date;
    overdue: boolean;
    expectedCompletionDate: string | null;
    projectName?: string | null;
  };
  showStaff?: boolean;
}) {
  const b = a.balance;
  const personal = a.kind === "REIMBURSEMENT";
  return (
    <Link href={`/allocations/${a.id}`} className="group flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{a.purpose}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {a.reference}
            {showStaff && a.staffName ? ` · ${a.staffName}` : ""}
            {a.projectName ? ` · ${a.projectName}` : ""}
          </p>
        </div>
        {personal ? <Badge tone="purple">Personal spend</Badge> : <AllocationStatusBadge status={a.status} overdue={a.overdue} overBudget={b.overBudget} />}
      </div>

      {personal ? (
        <div className="mt-4">
          <p className="text-xs text-gray-500">Spent from personal funds</p>
          <p className="text-2xl font-semibold tabular-nums text-gray-900">{formatMoney(b.spent)}</p>
          <p className="mt-1 text-xs text-gray-500">{b.adjustments > 0 ? `${formatMoney(b.adjustments)} reimbursed` : "Awaiting reimbursement claim"}</p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-2xl font-semibold tabular-nums text-gray-900">{formatMoney(b.totalFunded)}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Spent</p>
              <p className="font-medium tabular-nums text-gray-800">{formatMoney(b.spent)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{b.available < 0 ? "Over budget" : "Remaining"}</p>
              <p className={`font-semibold tabular-nums ${b.available < 0 ? "text-red-600" : "text-brand-700"}`}>{formatMoney(Math.abs(b.available))}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={b.utilisation} className="flex-1" />
            <span className="w-10 text-right text-xs font-medium tabular-nums text-gray-600">{b.utilisation}%</span>
          </div>
        </>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>
          {b.counts.total} expense{b.counts.total === 1 ? "" : "s"}
          {b.counts.pending ? ` · ${b.counts.pending} pending` : ""}
        </span>
        <span className="flex items-center gap-1">
          {a.expectedCompletionDate && a.status === "ACTIVE" ? (
            <>
              <CalendarClock className="h-3.5 w-3.5" /> {a.overdue ? "Was due" : "Due"} {formatDate(a.expectedCompletionDate, "short")}
            </>
          ) : (
            <>Last activity {relativeTime(a.lastActivity)}</>
          )}
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:gap-2 transition-all">
        View details <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
