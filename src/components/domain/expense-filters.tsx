import Form from "next/form";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EXPENSE_STATUS } from "@/lib/format";
import type { Lookups } from "@/lib/services/org";

type Values = Record<string, string | undefined>;

/** Plain GET form so filters live in the URL (shareable, back-button friendly, no JS required). */
export function ExpenseFilters({
  values,
  lookups,
  allocations,
  finance,
  basePath = "/expenses",
}: {
  values: Values;
  lookups: Lookups;
  allocations: { id: string; reference: string; purpose: string }[];
  finance: boolean;
  basePath?: string;
}) {
  const advancedCount = ["staff", "department", "category", "project", "allocation", "from", "to", "min", "max", "receipt", "reconciled"].filter((k) => values[k]).length;
  return (
    <Form action={basePath} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input name="q" defaultValue={values.q} placeholder="Search expenses, vendors, references…" className="pl-9" aria-label="Search expenses" />
        </div>
        <Select name="status" defaultValue={values.status ?? ""} className="w-36 sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="pending">Awaiting review</option>
          <option value="attention">Needs attention</option>
          {Object.entries(EXPENSE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Button type="submit" className="hidden sm:inline-flex">
          Apply
        </Button>
      </div>
      <details className="group rounded-xl border border-gray-200 bg-white" open={advancedCount > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-4 w-4" /> More filters
          {advancedCount > 0 && <span className="rounded-full bg-brand-100 px-2 text-xs text-brand-800">{advancedCount}</span>}
        </summary>
        <div className="grid gap-3 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {finance && (
            <Select name="staff" defaultValue={values.staff ?? ""} aria-label="Staff">
              <option value="">All staff</option>
              {lookups.users.filter((u) => u.role !== "MANAGEMENT").map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          )}
          {finance && (
            <Select name="department" defaultValue={values.department ?? ""} aria-label="Department">
              <option value="">All departments</option>
              {lookups.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <Select name="category" defaultValue={values.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="project" defaultValue={values.project ?? ""} aria-label="Project">
            <option value="">All projects</option>
            {lookups.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="allocation" defaultValue={values.allocation ?? ""} aria-label="Allocation">
            <option value="">All allocations</option>
            {allocations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.reference} — {a.purpose}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" name="from" defaultValue={values.from} aria-label="From date" />
            <Input type="date" name="to" defaultValue={values.to} aria-label="To date" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="min" defaultValue={values.min} placeholder="Min ₦" inputMode="decimal" aria-label="Minimum amount" />
            <Input name="max" defaultValue={values.max} placeholder="Max ₦" inputMode="decimal" aria-label="Maximum amount" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select name="receipt" defaultValue={values.receipt ?? ""} aria-label="Receipt">
              <option value="">Any receipt</option>
              <option value="yes">With receipt</option>
              <option value="no">No receipt</option>
            </Select>
            <Select name="reconciled" defaultValue={values.reconciled ?? ""} aria-label="Reconciliation">
              <option value="">Any</option>
              <option value="yes">Reconciled</option>
              <option value="no">Not reconciled</option>
            </Select>
          </div>
          {values.scope && <input type="hidden" name="scope" value={values.scope} />}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">Apply filters</Button>
            <Link href={basePath + (values.scope ? `?scope=${values.scope}` : "")} className="inline-flex items-center rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Reset
            </Link>
          </div>
        </div>
      </details>
    </Form>
  );
}
