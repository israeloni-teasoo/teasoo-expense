import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { ExportMenu } from "@/components/domain/export-menu";
import { RequisitionStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import type { RequisitionStatus } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { REQUISITION_STATUS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listRequisitions, pendingRequisitionCount, type RequisitionScope } from "@/lib/services/requisitions";
import { getSettings } from "@/lib/services/org";

export const metadata: Metadata = { title: "Requisitions" };

export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string }> }) {
  const user = await requirePagePermission("requisitions.create");
  const sp = await searchParams;
  const settings = await getSettings(user.organisationId);
  const involved = [settings.requisitionApproverId, settings.requisitionApproverBackupId, settings.requisitionExecutorId, settings.requisitionExecutorBackupId].includes(user.id);
  const seeAll = can(user.role, "requisitions.viewAll") || involved;
  const pendingCount = await pendingRequisitionCount(user);
  const views: { key: RequisitionScope; label: string; badge?: number }[] = [
    ...(involved ? [{ key: "pending" as const, label: "Waiting for me", badge: pendingCount }] : []),
    { key: "mine", label: "My requisitions" },
    ...(seeAll ? [{ key: "all" as const, label: "All" }] : []),
  ];
  const view: RequisitionScope = views.find((v) => v.key === sp.view)?.key ?? (involved && pendingCount ? "pending" : "mine");
  const status = (sp.status && (sp.status === "open" || sp.status in REQUISITION_STATUS) ? sp.status : "all") as RequisitionStatus | "open" | "all";
  const rows = await listRequisitions(user, { scope: view, status, q: sp.q });
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { view, status: status === "all" ? undefined : status, q: sp.q, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/requisitions${p.size ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Requisitions"
        description={`Ask for money to be paid out. ${settings.requisitionApproverId ? "Requests go to the approver, then to whoever pays." : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportMenu
              options={[
                {
                  label: "This list",
                  description: "Requisitions matching the current view and filters",
                  query: new URLSearchParams({ report: "requisitions", view, status, ...(sp.q ? { q: sp.q } : {}) }).toString(),
                },
              ]}
            />
            <LinkButton href="/requisitions/new">
              <Plus className="h-4 w-4" /> New requisition
            </LinkButton>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
          {views.map((v) => (
            <Link key={v.key} href={qs({ view: v.key })} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium", view === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900")}>
              {v.label}
              {!!v.badge && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold leading-5 text-brand-950">{v.badge}</span>}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2" action="/requisitions">
          <input type="hidden" name="view" value={view} />
          <select name="status" defaultValue={status} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm" aria-label="Status">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            {Object.entries(REQUISITION_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search…" className="h-9 w-40 rounded-lg border border-gray-300 px-3 text-sm" aria-label="Search requisitions" />
          <button className="h-9 rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Filter</button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={view === "pending" ? "Nothing waiting for you" : "No requisitions yet"}
            description={view === "pending" ? "Requisitions that need your approval or payment appear here." : "Raise a requisition when you need money paid out for the business."}
            action={view !== "pending" ? <LinkButton href="/requisitions/new">New requisition</LinkButton> : undefined}
          />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Requisition</th>
                  {view !== "mine" && <th className="px-4 py-3">Requested by</th>}
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Needed by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">With</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-gray-50", r.canAct && "bg-amber-50/40")}>
                    <td className="max-w-xs px-4 py-3">
                      <Link href={`/requisitions/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link>
                      <p className="truncate text-xs text-gray-500">{r.title}</p>
                    </td>
                    {view !== "mine" && <td className="px-4 py-3 text-gray-700">{r.requesterName}</td>}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.submittedAt ? formatDate(r.submittedAt, "short") : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(r.expectedDate, "short")}</td>
                    <td className="px-4 py-3"><RequisitionStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{r.canAct ? <span className="font-medium text-amber-800">You</span> : r.approverName ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-gray-100 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/requisitions/${r.id}`} className={cn("block px-4 py-3", r.canAct && "bg-amber-50/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{r.title}</p>
                        <p className="truncate text-xs text-gray-500">
                          {r.reference}
                          {view !== "mine" ? ` · ${r.requesterName}` : ""} · needed {formatDate(r.expectedDate, "short")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(r.total)}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <RequisitionStatusBadge status={r.status} />
                      {r.canAct ? <span className="font-medium text-amber-800">Waiting for you</span> : r.approverName ? <span>With {r.approverName}</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
