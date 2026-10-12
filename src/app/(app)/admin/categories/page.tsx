import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { CategoryForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requirePagePermission("admin.config");
  const { categories } = await getLookups(user.organisationId);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Expense categories"
        description="Configurable, not hard-coded. Archived categories stay on historical records."
        actions={<ModalButton label="Add category" variant="primary" icon={<Plus className="h-4 w-4" />} title="Add category"><CategoryForm /></ModalButton>}
      />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="truncate text-xs text-gray-500">{c.keywords || c.description || "No keywords"}</p>
              </div>
              <div className="hidden gap-1 sm:flex">
                {c.receiptRequired ? <Badge tone="blue">Receipt required</Badge> : <Badge>Receipt optional</Badge>}
                {c.archived && <Badge tone="gray">Archived</Badge>}
              </div>
              <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${c.name}`}>
                <CategoryForm c={c} />
              </ModalButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
