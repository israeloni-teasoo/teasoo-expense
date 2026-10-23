import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { RequisitionForm } from "@/components/forms/requisition-forms";
import { Alert, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePagePermission } from "@/lib/auth/current";
import { todayISO } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { notFoundOrSwitch } from "@/lib/org-redirect";
import { approversFor } from "@/lib/requisition-rules";
import { getLookups, getSettings } from "@/lib/services/org";
import { getRequisition, listVendors } from "@/lib/services/requisitions";

export const metadata: Metadata = { title: "Edit requisition" };

export default async function EditRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("requisitions.create");
  const { id } = await params;
  const d = await getRequisition(user, id).catch(async (e) => {
    if (e instanceof DomainError) await notFoundOrSwitch(user, "requisition", id, `/requisitions/${id}/edit`);
    throw e;
  });
  if (!d.can.edit) redirect(`/requisitions/${id}`);
  const r = d.requisition;
  const [lookups, settings] = await Promise.all([getLookups(user.organisationId), getSettings(user.organisationId)]);
  const usedVendorIds = new Set(d.items.map((i) => i.vendorId).filter(Boolean));
  const usedCategoryIds = new Set(d.items.map((i) => i.categoryId).filter(Boolean));
  const approverIds = approversFor(settings, user.id);
  const approvers = approverIds.length ? await db.select({ first: users.firstName, last: users.lastName }).from(users).where(inArray(users.id, approverIds)) : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Edit ${r.reference}`} back={{ href: `/requisitions/${id}`, label: r.reference }} />
      {r.status === "ON_HOLD" && r.decisionReason && (
        <div className="mb-4">
          <Alert tone="amber" title="The approver asked">{r.decisionReason}</Alert>
        </div>
      )}
      <RequisitionForm
        initial={{
          id: r.id,
          status: r.status,
          title: r.title,
          expectedDate: r.expectedDate,
          deliveryAddress: r.deliveryAddress,
          externalReference: r.externalReference,
          notesToApprover: r.notesToApprover,
          projectId: r.projectId,
          items: d.items.map((i) => ({ itemName: i.itemName, categoryId: i.categoryId, categoryOther: i.categoryOther, description: i.description, vendorId: i.vendorId, quantity: i.quantity, rate: i.rate, discount: i.discount })),
        }}
        categories={lookups.categories.filter((c) => !c.archived || usedCategoryIds.has(c.id))}
        projects={lookups.activeProjects}
        vendors={(await listVendors(user.organisationId, { includeArchived: true }))
          .filter((v) => !v.archived || usedVendorIds.has(v.id))
          .map((v) => ({ id: v.id, name: v.name, accountName: v.accountName, accountNumber: v.accountNumber, bankName: v.bankName }))}
        today={todayISO()}
        approverNames={approvers.map((a) => `${a.first} ${a.last}`)}
      />
    </div>
  );
}
