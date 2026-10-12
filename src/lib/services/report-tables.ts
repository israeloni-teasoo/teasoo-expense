import "server-only";
import type { CurrentUser } from "@/lib/auth/current";
import type { Table } from "@/lib/export";
import { EXPENSE_STATUS, ALLOCATION_STATUS } from "@/lib/format";
import { getAllocationDetail } from "./allocations";
import { listExpenses, type ExpenseFilters, type ExpenseListRow } from "./expenses";
import {
  allocationReport,
  categoryReport,
  departmentReport,
  projectReport,
  staffAccountabilityReport,
  REPORT_LABELS,
  type Range,
  type ReportKind,
} from "./reports";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyTable = Table<any>;

export function expenseTable(rows: ExpenseListRow[], title: string, subtitle?: string): Table<ExpenseListRow> {
  return {
    title,
    subtitle,
    columns: [
      { header: "Reference", key: "reference", value: (r) => r.reference, width: 16 },
      { header: "Date", key: "date", type: "date", value: (r) => r.expenseDate },
      { header: "Staff", key: "staff", value: (r) => r.staffName },
      { header: "Department", key: "department", value: (r) => r.departmentName ?? "" },
      { header: "Allocation", key: "allocation", value: (r) => `${r.allocationRef} — ${r.allocationPurpose}`, width: 34 },
      { header: "Category", key: "category", value: (r) => r.categoryName },
      { header: "Project", key: "project", value: (r) => r.projectName ?? "" },
      { header: "Description", key: "description", value: (r) => r.description, width: 36 },
      { header: "Vendor", key: "vendor", value: (r) => r.vendor ?? "" },
      { header: "Payment method", key: "method", value: (r) => r.paymentMethod ?? "" },
      { header: "Amount", key: "amount", type: "money", value: (r) => r.amount },
      { header: "Status", key: "status", value: (r) => EXPENSE_STATUS[r.status].label },
      { header: "Receipt", key: "receipt", value: (r) => (r.hasReceipt ? `Yes (${r.docCount})` : "No"), width: 10 },
    ],
    rows,
    totals: { amount: rows.reduce((s, r) => s + r.amount, 0), reference: `TOTAL (${rows.length})` },
  };
}

export async function buildReportTables(
  actor: CurrentUser,
  report: ReportKind | "allocation",
  range: Range & { label: string },
  opts: { filters?: ExpenseFilters; allocationId?: string } = {},
): Promise<AnyTable[]> {
  const subtitle = range.label;
  switch (report) {
    case "expenses": {
      const f: ExpenseFilters = { ...(opts.filters ?? {}), page: 1, pageSize: 5000 };
      if (range.from && !f.from) f.from = range.from;
      if (range.to && !f.to) f.to = range.to;
      const { rows } = await listExpenses(actor, f);
      return [expenseTable(rows, REPORT_LABELS.expenses, subtitle)];
    }
    case "allocation": {
      if (!opts.allocationId) throw new Error("allocationId required");
      const d = await getAllocationDetail(actor, opts.allocationId);
      const { rows } = await listExpenses(actor, { allocationId: opts.allocationId, page: 1, pageSize: 5000 });
      const b = d.balance;
      const summary: Table<{ label: string; value: number | string; money?: boolean }> = {
        title: `${d.allocation.reference} summary`,
        subtitle: `${d.allocation.purpose} · ${d.staff?.fullName ?? ""}`,
        columns: [
          { header: "Item", key: "label", value: (r) => r.label, width: 30 },
          { header: "Value", key: "value", value: (r) => (typeof r.value === "number" ? (r.value / 100).toFixed(2) : r.value), width: 24 },
        ],
        rows: [
          { label: "Staff", value: d.staff?.fullName ?? "" },
          { label: "Purpose", value: d.allocation.purpose },
          { label: "Date received", value: d.allocation.dateReceived },
          { label: "Status", value: ALLOCATION_STATUS[d.allocation.status].label },
          { label: "Initial amount (NGN)", value: b.initial },
          { label: "Additional funding / adjustments (NGN)", value: b.adjustments },
          { label: "Total funded (NGN)", value: b.totalFunded },
          { label: "Approved expenses (NGN)", value: b.approved },
          { label: "Pending review (NGN)", value: b.pending },
          { label: "Returned (NGN)", value: b.returned },
          { label: "Remaining (NGN)", value: b.available },
        ],
      };
      return [summary, expenseTable(rows, `${d.allocation.reference} expenses`, d.allocation.purpose)];
    }
    case "staff": {
      const rows = await staffAccountabilityReport(actor, range);
      const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
      return [
        {
          title: REPORT_LABELS.staff,
          subtitle,
          columns: [
            { header: "Staff", key: "staff", value: (r) => r.staffName },
            { header: "Allocations", key: "allocations", type: "number", value: (r) => r.allocations, width: 12 },
            { header: "Funds received", key: "received", type: "money", value: (r) => r.received },
            { header: "Total spent", key: "spent", type: "money", value: (r) => r.spent },
            { header: "Approved", key: "approved", type: "money", value: (r) => r.approved },
            { header: "Pending", key: "pending", type: "money", value: (r) => r.pending },
            { header: "Amount returned", key: "returned", type: "money", value: (r) => r.returned },
            { header: "Outstanding", key: "outstanding", type: "money", value: (r) => r.outstanding },
            { header: "Over budget", key: "overspend", type: "money", value: (r) => r.overspend },
          ],
          rows,
          totals: {
            allocations: sum("allocations"),
            received: sum("received"),
            spent: sum("spent"),
            approved: sum("approved"),
            pending: sum("pending"),
            returned: sum("returned"),
            outstanding: sum("outstanding"),
            overspend: sum("overspend"),
          },
        },
      ];
    }
    case "allocations": {
      const rows = await allocationReport(actor, range);
      const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
      return [
        {
          title: REPORT_LABELS.allocations,
          subtitle,
          columns: [
            { header: "Reference", key: "reference", value: (r) => r.reference, width: 16 },
            { header: "Staff", key: "staff", value: (r) => r.staffName },
            { header: "Purpose", key: "purpose", value: (r) => r.purpose, width: 32 },
            { header: "Project", key: "project", value: (r) => r.projectName ?? "" },
            { header: "Date received", key: "date", type: "date", value: (r) => r.dateReceived },
            { header: "Received", key: "received", type: "money", value: (r) => r.balance.totalFunded },
            { header: "Spent", key: "spent", type: "money", value: (r) => r.balance.spent },
            { header: "Returned", key: "returned", type: "money", value: (r) => r.balance.returned },
            { header: "Remaining", key: "remaining", type: "money", value: (r) => r.balance.available },
            { header: "Status", key: "status", value: (r) => (r.overdue ? "Overdue" : ALLOCATION_STATUS[r.status as keyof typeof ALLOCATION_STATUS].label) },
          ],
          rows,
          totals: {
            received: sum((r) => r.balance.totalFunded),
            spent: sum((r) => r.balance.spent),
            returned: sum((r) => r.balance.returned),
            remaining: sum((r) => r.balance.available),
          },
        },
      ];
    }
    case "categories": {
      const rows = await categoryReport(actor, range);
      return [
        {
          title: REPORT_LABELS.categories,
          subtitle,
          columns: [
            { header: "Category", key: "name", value: (r) => r.name },
            { header: "Transactions", key: "count", type: "number", value: (r) => r.count, width: 14 },
            { header: "Total amount", key: "total", type: "money", value: (r) => r.total },
            { header: "% of spending", key: "share", type: "percent", value: (r) => r.share, width: 14 },
          ],
          rows,
          totals: { count: rows.reduce((s, r) => s + r.count, 0), total: rows.reduce((s, r) => s + r.total, 0) },
        },
      ];
    }
    case "departments": {
      const rows = await departmentReport(actor, range);
      return [
        {
          title: REPORT_LABELS.departments,
          subtitle,
          columns: [
            { header: "Department", key: "name", value: (r) => r.name },
            { header: "Transactions", key: "count", type: "number", value: (r) => r.count, width: 14 },
            { header: "Total amount", key: "total", type: "money", value: (r) => r.total },
            { header: "% of spending", key: "share", type: "percent", value: (r) => r.share, width: 14 },
          ],
          rows,
          totals: { count: rows.reduce((s, r) => s + r.count, 0), total: rows.reduce((s, r) => s + r.total, 0) },
        },
      ];
    }
    case "projects": {
      const rows = await projectReport(actor, range);
      const sum = (k: "budget" | "received" | "expenses" | "remaining" | "variance") => rows.reduce((s, r) => s + r[k], 0);
      return [
        {
          title: REPORT_LABELS.projects,
          subtitle,
          columns: [
            { header: "Project", key: "name", value: (r) => r.name },
            { header: "Budget", key: "budget", type: "money", value: (r) => r.budget },
            { header: "Funds received", key: "received", type: "money", value: (r) => r.received },
            { header: "Expenses", key: "expenses", type: "money", value: (r) => r.expenses },
            { header: "Remaining", key: "remaining", type: "money", value: (r) => r.remaining },
            { header: "Variance vs budget", key: "variance", type: "money", value: (r) => r.variance },
          ],
          rows,
          totals: { budget: sum("budget"), received: sum("received"), expenses: sum("expenses"), remaining: sum("remaining"), variance: sum("variance") },
        },
      ];
    }
  }
}
