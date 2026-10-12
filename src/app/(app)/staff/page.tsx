import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { ExportMenu } from "@/components/domain/export-menu";
import { requirePagePermission } from "@/lib/auth/current";
import { relativeTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { staffDirectory } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requirePagePermission("staff.view");
  const { filter } = await searchParams;
  let people = (await staffDirectory(user)).filter((p) => p.role !== "MANAGEMENT");
  if (filter === "outstanding") people = people.filter((p) => p.outstanding > 0);
  people.sort((a, b) => b.outstanding - a.outstanding || a.fullName.localeCompare(b.fullName));
  return (
    <div>
      <PageHeader
        title="Staff directory"
        description="Who holds organisation money, and how much is still to be accounted for."
        actions={can(user.role, "reports.export") ? <ExportMenu options={[{ label: "Staff accountability report", query: "report=staff" }]} /> : undefined}
      />
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        <Link href="/staff" className={`rounded-md px-3 py-1.5 font-medium ${filter !== "outstanding" ? "bg-white shadow-sm" : "text-gray-600"}`}>All</Link>
        <Link href="/staff?filter=outstanding" className={`rounded-md px-3 py-1.5 font-medium ${filter === "outstanding" ? "bg-white shadow-sm" : "text-gray-600"}`}>With outstanding balances</Link>
      </div>
      <Card className="overflow-hidden">
        {people.length === 0 ? (
          <EmptyState title="No staff found" />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Spent</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3">Last activity</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {people.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={p.fullName} />
                          <div className="min-w-0">
                            <Link href={`/allocations?staff=${p.id}&status=all`} className="font-medium text-gray-900 hover:text-brand-700">{p.fullName}</Link>
                            <p className="truncate text-xs text-gray-500">{p.jobTitle ?? ROLE_LABELS[p.role]}{p.status === "SUSPENDED" ? " · suspended" : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.departmentName ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(p.received)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(p.spent)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(p.pending)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {p.outstanding > 0 ? formatMoney(p.outstanding) : <span className="text-gray-400">—</span>}
                        {p.overdue > 0 && <Badge tone="red" className="ml-2">{p.overdue} overdue</Badge>}
                        {p.owedToStaff > 0 && <span className="block text-xs font-normal text-violet-700">owed {formatMoney(p.owedToStaff)}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.lastActivity ? relativeTime(p.lastActivity) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3 text-xs font-medium">
                          <Link href={`/expenses?staff=${p.id}`} className="text-brand-700 hover:underline">Expenses</Link>
                          {can(user.role, "allocations.create") && (
                            <Link href={`/allocations/new?staff=${p.id}`} className="inline-flex items-center gap-0.5 text-brand-700 hover:underline"><Plus className="h-3 w-3" />Allocate</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-gray-100 md:hidden">
              {people.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <Link href={`/allocations?staff=${p.id}&status=all`} className="flex items-center gap-3">
                    <Avatar name={p.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{p.fullName}</p>
                      <p className="truncate text-xs text-gray-500">{p.departmentName ?? "—"} · {p.activeAllocations} active</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(p.outstanding)}</p>
                      <p className="text-xs text-gray-500">outstanding</p>
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
