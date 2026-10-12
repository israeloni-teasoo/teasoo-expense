import type { Metadata } from "next";
import Link from "next/link";
import { RankedBars } from "@/components/charts/charts";
import { ExportMenu } from "@/components/domain/export-menu";
import { ReportTable } from "@/components/domain/report-table";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { PERIODS, resolvePeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { buildReportTables } from "@/lib/services/report-tables";
import { REPORT_LABELS, spendBy, type ReportKind } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Reports" };

const KINDS = Object.keys(REPORT_LABELS) as ReportKind[];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("reports.view");
  const sp = await searchParams;
  const report = KINDS.includes(sp.report as ReportKind) ? (sp.report as ReportKind) : "expenses";
  const period = sp.period ?? "this_month";
  const range = resolvePeriod(period, { from: sp.from, to: sp.to });
  const [tables, byCategory, byStaff] = await Promise.all([
    buildReportTables(user, report, range),
    spendBy(user.organisationId, "category", range),
    spendBy(user.organisationId, "staff", range),
  ]);
  const table = tables[0];
  const totalSpend = byCategory.reduce((s, r) => s + r.total, 0);
  const txCount = byCategory.reduce((s, r) => s + r.count, 0);
  const periodQuery = new URLSearchParams(Object.entries({ period, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generated directly from the transaction records — no manual assembly."
        actions={
          can(user.role, "reports.export") ? (
            <ExportMenu
              options={[
                { label: REPORT_LABELS[report], description: range.label, query: `report=${report}&${periodQuery}` },
                ...(report !== "staff" ? [{ label: REPORT_LABELS.staff, query: `report=staff&${periodQuery}` }] : []),
                ...(report !== "projects" ? [{ label: REPORT_LABELS.projects, query: `report=projects&${periodQuery}` }] : []),
              ]}
            />
          ) : undefined
        }
      />

      <form method="get" className="mb-5 grid gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-[auto_auto_auto_auto] sm:items-center">
        <input type="hidden" name="report" value={report} />
        <Select name="period" defaultValue={period} aria-label="Reporting period">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={sp.from} aria-label="From (custom range)" />
        <Input type="date" name="to" defaultValue={sp.to} aria-label="To (custom range)" />
        <Button type="submit" variant="secondary">Update</Button>
        <p className="text-xs text-gray-500 sm:col-span-4">
          {range.label}
          {period !== "custom" && " · pick “Custom range” to use the dates"}
        </p>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="brand" label="Spending in period" value={formatMoney(totalSpend)} hint="Approved + pending" />
        <StatCard label="Transactions" value={txCount} />
        <StatCard label="Top category" value={byCategory[0]?.name ?? "—"} hint={byCategory[0] ? formatMoney(byCategory[0].total) : undefined} />
        <StatCard label="Top spender" value={byStaff[0]?.name ?? "—"} hint={byStaff[0] ? formatMoney(byStaff[0].total) : undefined} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spending by category" description={range.label} />
          <CardBody><RankedBars data={byCategory} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Spending by staff" description={range.label} />
          <CardBody><RankedBars data={byStaff} /></CardBody>
        </Card>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-gray-200 scrollbar-none">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/reports?report=${k}&${periodQuery}`}
            scroll={false}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", report === k ? "border-brand-700 text-brand-800" : "border-transparent text-gray-500 hover:text-gray-800")}
          >
            {REPORT_LABELS[k]}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader title={table.title} description={`${range.label} · ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}`} />
        <ReportTable table={table} />
      </Card>
    </div>
  );
}
