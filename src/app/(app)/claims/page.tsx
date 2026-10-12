import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ClaimDecision } from "@/components/domain/claim-actions";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listClaims } from "@/lib/services/claims";

export const metadata: Metadata = { title: "Claims" };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const { status = "open" } = await searchParams;
  const claims = await listClaims(user, status);
  const finance = can(user.role, "claims.review");
  return (
    <div>
      <PageHeader
        title="Claims"
        description={
          finance
            ? "Over-spend reimbursements and requests for more funds. Finance reviews, an administrator gives final approval."
            : "Your requests for reimbursement or additional funds."
        }
      />
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 text-sm">
        {[
          ["open", "Open"],
          ["APPROVED", "Approved"],
          ["REJECTED", "Rejected"],
          ["all", "All"],
        ].map(([k, l]) => (
          <Link key={k} href={`/claims?status=${k}`} className={cn("rounded-md px-3 py-1.5 font-medium", status === k ? "bg-white shadow-sm" : "text-gray-600")}>
            {l}
          </Link>
        ))}
      </div>
      {claims.length === 0 ? (
        <Card>
          <EmptyState
            title="No claims"
            description={finance ? "Claims raised by staff will appear here." : "If you spend more than you were given, open the allocation and log a claim with evidence of approval."}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {claims.map((c) => {
            const own = c.staffId === user.id;
            const open = c.status === "SUBMITTED" || c.status === "RECOMMENDED";
            return (
              <Card key={c.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{formatMoney(c.amount)}</p>
                      <ClaimStatusBadge status={c.status} />
                      <span className="text-xs text-gray-500">{c.type === "REIMBURSEMENT" ? "Reimbursement" : "Additional funds"}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{c.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.reference} · {c.staffName} ·{" "}
                      <Link href={`/allocations/${c.allocationId}`} className="text-brand-700 hover:underline">
                        {c.allocationRef} — {c.allocationPurpose}
                      </Link>{" "}
                      · {formatDateTime(c.createdAt)}
                    </p>
                    {c.authorizedBy && <p className="mt-1 text-xs text-gray-500">Authorized by: {c.authorizedBy}</p>}
                    {c.reviewComment && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Review: “{c.reviewComment}”</p>}
                    {c.decisionComment && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Decision: “{c.decisionComment}”</p>}
                    {c.documents.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.documents.map((d) => (
                          <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200">
                            <FileText className="h-3.5 w-3.5" /> {d.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    {open && (
                      <p className="mt-2 text-xs text-gray-500">
                        Allocation balance: {c.balance.available < 0 ? `${formatMoney(-c.balance.available)} over budget` : `${formatMoney(c.balance.available)} remaining`}
                      </p>
                    )}
                  </div>
                  {open && (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {own && <ClaimDecision claimId={c.id} decision="CANCEL" label="Cancel claim" variant="ghost" />}
                      {!own && can(user.role, "claims.review") && c.status === "SUBMITTED" && (
                        <ClaimDecision claimId={c.id} decision="RECOMMEND" label="Recommend" variant="primary" description="Send to an administrator for final approval." />
                      )}
                      {!own && can(user.role, "claims.approve") && (
                        <ClaimDecision claimId={c.id} decision="APPROVE" label="Approve" variant="success" description={`${formatMoney(c.amount)} will be added to the allocation as ${c.type === "REIMBURSEMENT" ? "a reimbursement" : "additional funding"}.`} />
                      )}
                      {!own && can(user.role, "claims.review") && <ClaimDecision claimId={c.id} decision="REJECT" label="Reject" variant="danger" requireComment />}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
