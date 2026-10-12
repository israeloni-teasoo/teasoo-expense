import type { Metadata } from "next";
import Link from "next/link";
import { Download, Eye, FileText, ImageIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/dates";
import { DOCUMENT_KIND_LABELS, formatBytes } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { listDocuments } from "@/lib/services/reports";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("documents.viewAll");
  const sp = await searchParams;
  const [result, lookups] = await Promise.all([
    listDocuments(user, { q: sp.q, kind: sp.kind, staffId: sp.staff, page: Number(sp.page ?? 1) || 1 }),
    getLookups(user.organisationId),
  ]);
  const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  return (
    <div>
      <PageHeader title="Documents" description="Every receipt, transfer slip and supporting document in one place." />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input name="q" defaultValue={sp.q} placeholder="Search file name, expense, vendor or reference…" className="pl-9" aria-label="Search documents" />
        </div>
        <Select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type">
          <option value="">All types</option>
          {Object.entries(DOCUMENT_KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select name="staff" defaultValue={sp.staff ?? ""} aria-label="Staff">
          <option value="">All staff</option>
          {lookups.users.filter((u) => u.role !== "MANAGEMENT").map((u) => (
            <option key={u.id} value={u.id}>{u.fullName}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <p className="mb-3 text-sm text-gray-600">{result.count} document{result.count === 1 ? "" : "s"}</p>
      <Card className="overflow-hidden">
        {result.rows.length ? (
          <>
            <ul className="divide-y divide-gray-100">
              {result.rows.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="rounded-lg bg-gray-100 p-2 text-gray-500">
                      {d.fileType === "application/pdf" ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{d.fileName}</p>
                      <p className="truncate text-xs text-gray-500">
                        {DOCUMENT_KIND_LABELS[d.kind]} · {formatBytes(d.fileSize)} · {d.uploaderName} · {formatDateTime(d.uploadedAt)}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {d.expenseId ? (
                          <Link href={`/expenses/${d.expenseId}`} className="text-brand-700 hover:underline">
                            {d.expenseRef} · {d.expenseDescription} · {formatMoney(d.expenseAmount ?? 0)}
                          </Link>
                        ) : d.linkedAllocationId ? (
                          <Link href={`/allocations/${d.linkedAllocationId}`} className="text-brand-700 hover:underline">
                            {d.allocationRef} · {d.allocationPurpose}
                          </Link>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </a>
                    <a href={`/api/documents/${d.id}?download=1`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={result.page} pages={result.pages} makeHref={(p) => `/documents?${new URLSearchParams({ ...Object.fromEntries(q), page: String(p) })}`} />
          </>
        ) : (
          <EmptyState title="No documents found" />
        )}
      </Card>
    </div>
  );
}
