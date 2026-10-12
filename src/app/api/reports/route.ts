import { api } from "@/lib/api";
import { resolvePeriod } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { buildReportTables } from "@/lib/services/report-tables";
import { REPORT_LABELS, type ReportKind } from "@/lib/services/reports";

/** GET /api/reports?report=expenses|staff|allocations|categories|projects|departments&period=this_month|custom&from&to */
export const GET = api(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const report = (sp.get("report") ?? "expenses") as ReportKind;
  if (!(report in REPORT_LABELS)) throw new DomainError("Unknown report.", "VALIDATION");
  const range = resolvePeriod(sp.get("period") ?? undefined, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const tables = await buildReportTables(user, report, range);
  return {
    report,
    period: range,
    tables: tables.map((t) => ({
      title: t.title,
      columns: t.columns.map((c) => ({ key: c.key, header: c.header, type: c.type ?? "text" })),
      rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.key, c.value(r) ?? null]))),
      totals: t.totals ?? null,
      note: "money columns are in kobo",
    })),
  };
}, "reports.view");
