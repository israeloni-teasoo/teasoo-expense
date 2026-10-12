"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, Download, Paperclip } from "lucide-react";
import { ExpenseStatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { ExpenseStatus } from "@/db/schema";
import { bulkApproveAction } from "@/app/actions/expenses";

export type ExpenseRow = {
  id: string;
  reference: string;
  expenseDate: string;
  description: string;
  vendor: string | null;
  categoryName: string;
  amount: number;
  status: ExpenseStatus;
  staffName?: string;
  allocationPurpose?: string;
  hasReceipt?: boolean;
  docCount?: number;
  overBudget?: boolean;
  staffId?: string;
};

export function ExpenseTable({
  rows,
  showStaff,
  showAllocation,
  staffView,
  selectable,
  canBulkApprove,
  currentUserId,
  compact,
}: {
  rows: ExpenseRow[];
  showStaff?: boolean;
  showAllocation?: boolean;
  staffView?: boolean;
  selectable?: boolean;
  canBulkApprove?: boolean;
  currentUserId?: string;
  /** For narrow containers: category moves into the description line. */
  compact?: boolean;
}) {
  const catCol = compact ? "hidden" : "hidden xl:table-cell";
  const catInline = compact ? "" : "xl:hidden";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const approvable = selectedRows.filter((r) => (r.status === "SUBMITTED" || r.status === "UNDER_REVIEW") && r.staffId !== currentUserId);
  const selectedTotal = useMemo(() => selectedRows.reduce((s, r) => s + r.amount, 0), [selectedRows]);
  const exportHref = (format: string) => `/api/exports?report=expenses&format=${format}&ids=${[...selected].join(",")}`;

  return (
    <div>
      {selectable && selected.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2 text-sm lg:top-16">
          <span className="font-medium text-brand-900">
            {selected.size} selected · {formatMoney(selectedTotal)}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canBulkApprove && approvable.length > 0 && (
              <ActionForm action={bulkApproveAction} className="space-y-0" onSuccess={() => setSelected(new Set())}>
                {approvable.map((r) => (
                  <input key={r.id} type="hidden" name="ids" value={r.id} />
                ))}
                <SubmitButton size="sm" variant="success" pendingText="Approving…">
                  <CheckCheck className="h-4 w-4" /> Approve {approvable.length}
                </SubmitButton>
              </ActionForm>
            )}
            <a href={exportHref("xlsx")} className={buttonClasses("secondary", "sm")}>
              <Download className="h-4 w-4" /> Excel
            </a>
            <a href={exportHref("csv")} className={buttonClasses("secondary", "sm")}>
              CSV
            </a>
            <a href={exportHref("pdf")} className={buttonClasses("secondary", "sm")}>
              PDF
            </a>
            <button className={buttonClasses("ghost", "sm")} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox" autoComplete="off"
                    aria-label="Select all"
                    className="h-4 w-4 rounded border-gray-300 text-brand-700"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
              )}
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              {showStaff && <th className="px-4 py-3">Staff</th>}
              <th className={cn("px-4 py-3", catCol)}>Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-gray-50">
                {selectable && (
                  <td className="px-4 py-3">
                    <input type="checkbox" autoComplete="off" aria-label={`Select ${r.reference}`} className="h-4 w-4 rounded border-gray-300 text-brand-700" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(r.expenseDate, "short")}</td>
                <td className="max-w-[16rem] px-4 py-3 xl:max-w-xs">
                  <Link href={`/expenses/${r.id}`} className="block truncate font-medium text-gray-900 hover:text-brand-700">
                    {r.description}
                  </Link>
                  <p className="truncate text-xs text-gray-500">
                    <span className={catInline}>{r.categoryName} · </span>
                    {r.reference}
                    {r.vendor ? ` · ${r.vendor}` : ""}
                    {showAllocation && r.allocationPurpose ? ` · ${r.allocationPurpose}` : ""}
                  </p>
                </td>
                {showStaff && <td className="whitespace-nowrap px-4 py-3 text-gray-700">{r.staffName}</td>}
                <td className={cn("whitespace-nowrap px-4 py-3 text-gray-600", catCol)}>{r.categoryName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                  <span className="inline-flex items-center gap-1.5">
                    {r.overBudget && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" aria-label="Over budget" />}
                    {r.hasReceipt === false ? <span className="text-[10px] font-medium uppercase text-red-500" title="No receipt">No rcpt</span> : r.docCount ? <Paperclip className="h-3.5 w-3.5 text-gray-400" aria-label={`${r.docCount} attachment(s)`} /> : null}
                    {formatMoney(r.amount)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ExpenseStatusBadge status={r.status} staffView={staffView} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <ul className="divide-y divide-gray-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            {selectable && (
              <input type="checkbox" autoComplete="off" aria-label={`Select ${r.reference}`} className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-700" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
            )}
            <Link href={`/expenses/${r.id}`} className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate font-medium text-gray-900">{r.description}</p>
                <p className="shrink-0 font-semibold tabular-nums text-gray-900">{formatMoney(r.amount)}</p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="truncate text-xs text-gray-500">
                  {formatDate(r.expenseDate, "short")} · {r.categoryName}
                  {showStaff && r.staffName ? ` · ${r.staffName}` : ""}
                </p>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.hasReceipt === false && <span className="text-[10px] font-medium uppercase text-red-500">No receipt</span>}
                  <ExpenseStatusBadge status={r.status} staffView={staffView} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
