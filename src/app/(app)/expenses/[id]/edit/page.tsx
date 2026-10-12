import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExpenseForm } from "@/components/forms/expense-form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { notFoundOrSwitch } from "@/lib/org-redirect";
import { requirePagePermission } from "@/lib/auth/current";
import { PENDING_STATUSES } from "@/lib/balance";
import { todayISO } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { listAllocations } from "@/lib/services/allocations";
import { getExpenseDetail } from "@/lib/services/expenses";
import { getLookups, getSettings } from "@/lib/services/org";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("funds.own");
  const { id } = await params;
  const detail = await getExpenseDetail(user, id).catch(async (e) => {
    if (e instanceof DomainError) await notFoundOrSwitch(user, "expense", id, `/expenses/${id}/edit`);
    throw e;
  });
  if (!detail.canEdit) redirect(`/expenses/${id}`);
  const e = detail.expense;
  const [funds, lookups, settings] = await Promise.all([
    listAllocations(user, { scope: "mine", status: "ACTIVE" }),
    getLookups(user.organisationId),
    getSettings(user.organisationId),
  ]);
  const lastQuery = [...detail.reviews].reverse().find((r) => r.action === "REJECTED" || r.action === "REQUEST_CLARIFICATION");
  return (
    <div>
      <PageHeader title="Edit expense" description={e.reference} back={{ href: `/expenses/${id}`, label: "Back to expense" }} />
      {lastQuery && (
        <div className="mx-auto mb-6 max-w-2xl">
          <Alert tone={lastQuery.action === "REJECTED" ? "red" : "amber"} title={lastQuery.action === "REJECTED" ? `Rejected by ${lastQuery.reviewerName}` : `${lastQuery.reviewerName} asked a question`}>
            “{lastQuery.comment}”
          </Alert>
        </div>
      )}
      <ExpenseForm
        funds={funds.map((f) => ({ id: f.id, reference: f.reference, purpose: f.purpose, kind: f.kind, available: f.balance.available, totalFunded: f.balance.totalFunded, projectId: f.projectId }))}
        categories={lookups.categories.filter((c) => !c.archived || c.id === e.categoryId)}
        projects={lookups.activeProjects}
        initial={{
          id: e.id,
          allocationId: e.allocationId,
          categoryId: e.categoryId,
          categoryOther: e.categoryOther,
          projectId: e.projectId,
          expenseDate: e.expenseDate,
          amount: e.amount,
          description: e.description,
          vendor: e.vendor,
          paymentMethod: e.paymentMethod,
          paymentReference: e.paymentReference,
          notes: e.notes,
          status: e.status,
          reserved: PENDING_STATUSES.includes(e.status) ? e.amount : 0,
        }}
        existingDocs={detail.documents.map((d) => ({ id: d.id, fileName: d.fileName, fileType: d.fileType, fileSize: d.fileSize }))}
        requireReceipt={settings.requireReceipt}
        maxUploadMb={settings.maxUploadMb}
        today={todayISO()}
      />
    </div>
  );
}
