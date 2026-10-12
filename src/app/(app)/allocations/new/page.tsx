import type { Metadata } from "next";
import { NewAllocationForm } from "@/components/forms/allocation-forms";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { todayISO } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/rbac";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "New allocation" };

export default async function NewAllocationPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const user = await requirePagePermission("allocations.create");
  const { staff } = await searchParams;
  const lookups = await getLookups(user.organisationId);
  const deptName = new Map(lookups.departments.map((d) => [d.id, d.name]));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New allocation" description="Record money sent to a staff member and what it’s for. They’ll be notified straight away." back={{ href: "/allocations", label: "Allocations" }} />
      <Card>
        <CardBody>
          <NewAllocationForm
            staff={lookups.users
              .filter((u) => u.status === "ACTIVE" && u.role !== "MANAGEMENT")
              .map((u) => ({ id: u.id, name: u.fullName, departmentId: u.departmentId, detail: [u.departmentId ? deptName.get(u.departmentId) : null, u.role !== "STAFF" ? ROLE_LABELS[u.role] : null].filter(Boolean).join(", ") }))}
            departments={lookups.activeDepartments}
            projects={lookups.activeProjects}
            today={todayISO()}
            defaultStaffId={staff}
          />
        </CardBody>
      </Card>
    </div>
  );
}
