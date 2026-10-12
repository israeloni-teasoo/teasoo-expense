import type { Table } from "@/lib/export";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/* eslint-disable @typescript-eslint/no-explicit-any */
function render(type: string | undefined, v: unknown) {
  if (v == null || v === "") return "—";
  if (type === "money" && typeof v === "number") return formatMoney(v);
  if (type === "percent" && typeof v === "number") return `${v}%`;
  if (type === "date" && typeof v === "string") return formatDate(v);
  return String(v);
}

/** Renders the same table definition that powers the CSV / Excel / PDF exports. */
export function ReportTable({ table }: { table: Table<any> }) {
  const right = (t?: string) => t === "money" || t === "number" || t === "percent";
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            {table.columns.map((c) => (
              <th key={c.key} className={cn("whitespace-nowrap px-4 py-3", right(c.type) && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={table.columns.length} className="px-4 py-10 text-center text-gray-500">
                No data for this period.
              </td>
            </tr>
          )}
          {table.rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {table.columns.map((c) => {
                const v = c.value(row);
                return (
                  <td key={c.key} className={cn("px-4 py-2.5", right(c.type) ? "whitespace-nowrap text-right tabular-nums" : "max-w-xs truncate", typeof v === "number" && v < 0 && c.type === "money" && "text-red-600")}>
                    {render(c.type, v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {table.totals && table.rows.length > 0 && (
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              {table.columns.map((c, i) => {
                const v = table.totals![c.key];
                return (
                  <td key={c.key} className={cn("whitespace-nowrap px-4 py-3", right(c.type) && "text-right tabular-nums")}>
                    {v == null ? (i === 0 ? "Total" : "") : render(c.type, v)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
