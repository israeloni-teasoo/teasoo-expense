import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { DepartmentForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { formatMoney } from "@/lib/money";
import { getLookups } from "@/lib/services/org";
import { spendBy } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const user = await requirePagePermission("admin.config");
  const [{ departments, users }, spend] = await Promise.all([getLookups(user.organisationId), spendBy(user.organisationId, "department", { from: null, to: null })]);
  const spendMap = new Map(spend.map((s) => [s.id, s.total]));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Departments"
        description="Organisation structure, so expenses can be analysed by department."
        actions={<ModalButton label="Add department" variant="primary" icon={<Plus className="h-4 w-4" />} title="Add department"><DepartmentForm /></ModalButton>}
      />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{d.name} {d.code && <span className="text-xs text-gray-400">· {d.code}</span>}</p>
                <p className="text-xs text-gray-500">{users.filter((u) => u.departmentId === d.id).length} people · {formatMoney(spendMap.get(d.id) ?? 0)} spent</p>
              </div>
              {d.archived && <Badge>Archived</Badge>}
              <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${d.name}`}>
                <DepartmentForm d={d} />
              </ModalButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
