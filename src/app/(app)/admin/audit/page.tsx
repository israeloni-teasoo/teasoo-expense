import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log" };

const ENTITY_TYPES = ["ALLOCATION", "EXPENSE", "DOCUMENT", "RETURN", "CLAIM", "RECONCILIATION", "USER", "CATEGORY", "DEPARTMENT", "PROJECT", "SETTINGS", "AUTH", "EXPORT"];
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const c: SQL[] = [eq(auditLogs.organisationId, user.organisationId)];
  if (sp.entity) c.push(eq(auditLogs.entityType, sp.entity));
  if (sp.user) c.push(eq(auditLogs.userId, sp.user));
  if (sp.from) c.push(gte(auditLogs.createdAt, new Date(sp.from + "T00:00:00+01:00")));
  if (sp.to) c.push(lte(auditLogs.createdAt, new Date(sp.to + "T23:59:59+01:00")));
  if (sp.q) c.push(or(ilike(auditLogs.summary, `%${sp.q}%`), ilike(auditLogs.entityRef, `%${sp.q}%`))!);
  const where = and(...c);
  const [rows, count, people] = await Promise.all([
    db
      .select({ log: auditLogs, first: users.firstName, last: users.lastName })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    db.select({ id: users.id, first: users.firstName, last: users.lastName }).from(users).where(eq(users.organisationId, user.organisationId)),
  ]);
  const pages = Math.max(1, Math.ceil(Number(count[0].n) / PAGE));
  const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  return (
    <div>
      <PageHeader title="Audit log" description="Every important action — who, what, when, and the before/after values. Records are append-only." />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input name="q" defaultValue={sp.q} placeholder="Search actions or references…" className="pl-9" aria-label="Search audit log" />
        </div>
        <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Record type">
          <option value="">All records</option>
          {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e.charAt(0) + e.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select name="user" defaultValue={sp.user ?? ""} aria-label="User">
          <option value="">All users</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={sp.from} aria-label="From" />
        <Input type="date" name="to" defaultValue={sp.to} aria-label="To" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card className="overflow-hidden">
        {rows.length ? (
          <>
            <ul className="divide-y divide-gray-100">
              {rows.map(({ log, first, last }) => (
                <li key={log.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{log.summary}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {first ? `${first} ${last}` : "System"} · {formatDateTime(log.createdAt)}
                        {log.entityRef ? ` · ${log.entityRef}` : ""}
                        {log.ipAddress ? ` · ${log.ipAddress}` : ""}
                        {log.allocationId && (
                          <>
                            {" · "}
                            <Link href={`/allocations/${log.allocationId}?tab=activity`} className="text-brand-700 hover:underline">allocation</Link>
                          </>
                        )}
                      </p>
                      {log.oldValues != null || log.newValues != null ? (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-gray-500">Changes</summary>
                          <div className="mt-1 grid gap-2 sm:grid-cols-2">
                            <pre className="overflow-x-auto rounded bg-red-50 p-2 text-[11px] text-red-900">{JSON.stringify(log.oldValues ?? {}, null, 1)}</pre>
                            <pre className="overflow-x-auto rounded bg-emerald-50 p-2 text-[11px] text-emerald-900">{JSON.stringify(log.newValues ?? {}, null, 1)}</pre>
                          </div>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge>{log.entityType.toLowerCase()}</Badge>
                      <Badge tone="blue">{log.action.toLowerCase().replace(/_/g, " ")}</Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pages={pages} makeHref={(p) => `/admin/audit?${new URLSearchParams({ ...Object.fromEntries(q), page: String(p) })}`} />
          </>
        ) : (
          <EmptyState title="No audit entries match" />
        )}
      </Card>
    </div>
  );
}
