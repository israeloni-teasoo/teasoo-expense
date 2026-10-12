import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AllocationStatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { ExportMenu } from "@/components/domain/export-menu";
import { requirePagePermission } from "@/lib/auth/current";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listAllocations } from "@/lib/services/allocations";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Allocations" };

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("allocations.viewAll");
  const sp = await searchParams;
  const [rows, lookups] = await Promise.all([
    listAllocations(user, {
      q: sp.q,
      staffId: sp.staff,
      projectId: sp.project,
      departmentId: sp.department,
      status: sp.status,
      overdue: sp.overdue === "1",
    }),
    getLookups(user.organisationId),
  ]);
  const totals = rows.reduce(
    (t, r) => ({ received: t.received + r.balance.totalFunded, spent: t.spent + r.balance.spent, remaining: t.remaining + r.balance.available }),
    { received: 0, spent: 0, remaining: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Allocations"
        description="Money disbursed to staff, what it was for, and where it stands."
        actions={
          <>
            {can(user.role, "reports.export") && (
              <ExportMenu options={[{ label: "Allocation report", description: "All allocations with balances", query: "report=allocations" }]} />
            )}
            {can(user.role, "allocations.create") && (
              <LinkButton href="/allocations/new">
                <Plus className="h-4 w-4" /> New allocation
              </LinkButton>
            )}
          </>
        }
      />

      <Form action="/allocations" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input name="q" defaultValue={sp.q} placeholder="Search purpose, reference or staff…" className="pl-9" aria-label="Search allocations" />
        </div>
        <Select name="staff" defaultValue={sp.staff ?? ""} aria-label="Staff">
          <option value="">All staff</option>
          {lookups.users.filter((u) => u.role !== "MANAGEMENT").map((u) => (
            <option key={u.id} value={u.id}>{u.fullName}</option>
          ))}
        </Select>
        <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project">
          <option value="">All projects</option>
          {lookups.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Active & reconciled</option>
          <option value="ACTIVE">Active</option>
          <option value="RECONCILED">Reconciled</option>
          <option value="ARCHIVED">Archived</option>
          <option value="VOIDED">Voided</option>
          <option value="all">All</option>
        </Select>
        <div className="flex gap-2">
          {sp.overdue && <input type="hidden" name="overdue" value="1" />}
          <Button type="submit" variant="secondary" className="flex-1">Filter</Button>
        </div>
      </Form>
      {sp.overdue === "1" && (
        <p className="mb-3 text-sm text-red-700">
          Showing overdue allocations only. <Link href="/allocations" className="font-medium underline">Clear</Link>
        </p>
      )}

      <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200"><p className="text-xs text-gray-500">Received</p><p className="font-semibold tabular-nums">{formatMoneyCompact(totals.received)}</p></div>
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200"><p className="text-xs text-gray-500">Spent</p><p className="font-semibold tabular-nums">{formatMoneyCompact(totals.spent)}</p></div>
        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200"><p className="text-xs text-gray-500">Remaining</p><p className="font-semibold tabular-nums">{formatMoneyCompact(totals.remaining)}</p></div>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No allocations found" description="Create an allocation when money is sent to a staff member." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3">Purpose</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Spent</th>
                    <th className="px-4 py-3 text-right">Remaining</th>
                    <th className="w-32 px-4 py-3">Used</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((a) => (
                    <tr key={a.id} className="relative hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{a.staffName}</td>
                      <td className="max-w-xs px-4 py-3">
                        <Link href={`/allocations/${a.id}`} className="block truncate font-medium text-gray-900 after:absolute after:inset-0 hover:text-brand-700">
                          {a.purpose}
                        </Link>
                        <p className="truncate text-xs text-gray-500">
                          {a.reference} · {formatDate(a.dateReceived, "short")}
                          {a.projectName ? ` · ${a.projectName}` : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(a.balance.totalFunded)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(a.balance.spent)}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${a.balance.available < 0 ? "text-red-600" : ""}`}>{formatMoney(a.balance.available)}</td>
                      <td className="px-4 py-3">{a.kind === "REIMBURSEMENT" ? <span className="text-xs text-violet-700">Personal spend</span> : <Progress value={a.balance.utilisation} />}</td>
                      <td className="px-4 py-3"><AllocationStatusBadge status={a.status} overdue={a.overdue} overBudget={a.balance.overBudget && a.kind === "ADVANCE"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-gray-100 md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/allocations/${a.id}`} className="block px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{a.purpose}</p>
                        <p className="truncate text-xs text-gray-500">{a.staffName} · {a.reference}</p>
                      </div>
                      <AllocationStatusBadge status={a.status} overdue={a.overdue} overBudget={a.balance.overBudget && a.kind === "ADVANCE"} />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                      {a.kind === "REIMBURSEMENT" ? (
                        <span className="text-violet-700">Personal spend · {formatMoneyCompact(a.balance.spent)} paid by staff</span>
                      ) : (
                        <>
                          <span className="tabular-nums">{formatMoneyCompact(a.balance.spent)} of {formatMoneyCompact(a.balance.totalFunded)}</span>
                          <Progress value={a.balance.utilisation} className="flex-1" />
                          <span className={`font-medium tabular-nums ${a.balance.available < 0 ? "text-red-600" : "text-gray-900"}`}>{formatMoneyCompact(a.balance.available)} left</span>
                        </>
                      )}
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
