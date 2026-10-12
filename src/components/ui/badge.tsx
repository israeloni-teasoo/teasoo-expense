import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ALLOCATION_STATUS, CLAIM_STATUS, EXPENSE_STATUS, type Tone } from "@/lib/format";
import type { AllocationStatus, ClaimStatus, ExpenseStatus } from "@/db/schema";

const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

export function ExpenseStatusBadge({ status, staffView }: { status: ExpenseStatus; staffView?: boolean }) {
  const s = EXPENSE_STATUS[status];
  return <Badge tone={s.tone}>{staffView && s.staffLabel ? s.staffLabel : s.label}</Badge>;
}

export function AllocationStatusBadge({ status, overdue, overBudget }: { status: AllocationStatus; overdue?: boolean; overBudget?: boolean }) {
  const s = ALLOCATION_STATUS[status];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {overdue && <Badge tone="red">Overdue</Badge>}
      {overBudget && <Badge tone="orange">Over budget</Badge>}
    </span>
  );
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const s = CLAIM_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
