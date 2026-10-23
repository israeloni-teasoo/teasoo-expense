import type { Metadata } from "next";
import { RequisitionForm } from "@/components/forms/requisition-forms";
import { Alert, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/current";
import { addDays, todayISO } from "@/lib/dates";
import { approversFor } from "@/lib/requisition-rules";
import { getLookups, getSettings } from "@/lib/services/org";
import { listVendors } from "@/lib/services/requisitions";

export const metadata: Metadata = { title: "New requisition" };

export default async function NewRequisitionPage() {
  const user = await requirePagePermission("requisitions.create");
  const [lookups, settings, vendorRows] = await Promise.all([getLookups(user.organisationId), getSettings(user.organisationId), listVendors(user.organisationId)]);
  const approverIds = approversFor(settings, user.id);
  const approvers = approverIds.length ? await db.select({ id: users.id, first: users.firstName, last: users.lastName }).from(users).where(inArray(users.id, approverIds)) : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New requisition" description="Ask for money to be paid out. Add each item with its estimated price and, if you know it, the vendor." back={{ href: "/requisitions", label: "Requisitions" }} />
      {!approvers.length && (
        <div className="mb-4">
          <Alert tone="amber" title="Approvals aren't set up yet">
            You can save a draft, but it can&apos;t be submitted until an administrator chooses who approves requisitions in Settings.
          </Alert>
        </div>
      )}
      <RequisitionForm
        initial={{ expectedDate: addDays(todayISO(), 7) }}
        categories={lookups.activeCategories}
        projects={lookups.activeProjects}
        vendors={vendorRows.map((v) => ({ id: v.id, name: v.name, accountName: v.accountName, accountNumber: v.accountNumber, bankName: v.bankName }))}
        today={todayISO()}
        approverNames={approvers.map((a) => `${a.first} ${a.last}`)}
      />
    </div>
  );
}
