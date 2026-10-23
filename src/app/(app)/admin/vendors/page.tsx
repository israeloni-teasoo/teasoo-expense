import type { Metadata } from "next";
import { Pencil, Plus, Store } from "lucide-react";
import { VendorForm } from "@/components/forms/requisition-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { listVendors } from "@/lib/services/requisitions";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const user = await requirePagePermission("vendors.manage");
  const rows = await listVendors(user.organisationId, { includeArchived: true });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Vendors"
        description="Suppliers paid through requisitions, with their bank details. Staff can add new vendors while raising a requisition."
        actions={
          <ModalButton label="Add vendor" variant="primary" icon={<Plus className="h-4 w-4" />} title="Add vendor">
            <VendorForm />
          </ModalButton>
        }
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Store className="h-6 w-6" />} title="No vendors yet" description="Vendors added here or on requisitions appear in this list." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{v.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {[v.accountName, v.accountNumber, v.bankName].filter(Boolean).join(" · ") || "No bank details"}
                    {v.phone ? ` · ${v.phone}` : ""}
                  </p>
                </div>
                {v.archived && <Badge tone="gray">Archived</Badge>}
                <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${v.name}`}>
                  <VendorForm vendor={v} canArchive />
                </ModalButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
