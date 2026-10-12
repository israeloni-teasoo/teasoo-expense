import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { resolvePeriod, todayISO } from "@/lib/dates";
import { toCSV, toPDF, toXLSX } from "@/lib/export";
import { can } from "@/lib/rbac";
import { parseExpenseFilters } from "@/lib/services/expenses";
import { getOrg } from "@/lib/services/org";
import { buildReportTables } from "@/lib/services/report-tables";
import { REPORT_LABELS, type ReportKind } from "@/lib/services/reports";

const KINDS = ["expenses", "staff", "allocations", "categories", "projects", "departments", "allocation"] as const;
const MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/**
 * GET /api/exports?report=expenses|staff|allocations|categories|projects|departments|allocation
 *   &format=csv|xlsx|pdf &period=this_month|…|custom &from &to
 *   plus expense filters (q, staff, category, status, …), ids=a,b,c for selected rows, allocationId for one allocation.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const report = (sp.report ?? "expenses") as (typeof KINDS)[number];
  const format = (sp.format ?? "xlsx") as keyof typeof MIME;
  if (!KINDS.includes(report) || !MIME[format]) return NextResponse.json({ error: "Invalid report or format" }, { status: 400 });

  // Staff may export their own expenses and allocations; organisation-wide reports need export permission.
  const ownOnly = !can(user.role, "reports.export");
  if (ownOnly && !["expenses", "allocation"].includes(report)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const range = resolvePeriod(sp.period, { from: sp.from, to: sp.to });
  const filters = parseExpenseFilters(sp);
  if (ownOnly) filters.scope = "mine";
  if (sp.ids) filters.ids = sp.ids.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 2000);

  try {
    const tables = await buildReportTables(user, report, range, { filters, allocationId: sp.allocationId });
    const org = await getOrg(user.organisationId);
    const meta = { organisation: org.name, generatedBy: user.fullName };
    const body = format === "csv" ? toCSV(tables[tables.length - 1]) : format === "xlsx" ? await toXLSX(tables, meta) : toPDF(tables, meta);
    const base = report === "allocation" ? "allocation" : REPORT_LABELS[report as ReportKind].toLowerCase().replace(/\s+/g, "-");
    const filename = `${base}-${todayISO()}.${format}`;
    await audit(db, {
      organisationId: user.organisationId,
      userId: user.id,
      entityType: "EXPORT",
      action: "EXPORTED",
      summary: `${user.fullName} exported ${report === "allocation" ? "an allocation" : REPORT_LABELS[report as ReportKind].toLowerCase()} (${format.toUpperCase()}, ${tables.reduce((s, t) => s + t.rows.length, 0)} rows)`,
      newValues: { report, format, period: range.label, filters: sp },
    });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error && e.name === "DomainError" ? e.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
