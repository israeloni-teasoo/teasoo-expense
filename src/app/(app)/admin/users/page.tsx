import type { Metadata } from "next";
import { Pencil, UserPlus } from "lucide-react";
import { UserForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/current";
import { relativeTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/rbac";
import { getLookups } from "@/lib/services/org";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requirePagePermission("admin.users");
  const [people, lookups] = await Promise.all([
    db.select().from(users).where(eq(users.organisationId, user.organisationId)).orderBy(asc(users.firstName)),
    getLookups(user.organisationId),
  ]);
  const dept = new Map(lookups.departments.map((d) => [d.id, d.name]));
  return (
    <div>
      <PageHeader
        title="Users"
        description={`${people.length} people in your organisation`}
        actions={
          <ModalButton label="Add user" variant="primary" icon={<UserPlus className="h-4 w-4" />} title="Add user" modalSize="lg">
            <UserForm departments={lookups.activeDepartments} />
          </ModalButton>
        }
      />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={`${p.firstName} ${p.lastName}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {p.firstName} {p.lastName} {p.id === user.id && <span className="text-xs font-normal text-gray-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {p.email}
                  {p.departmentId ? ` · ${dept.get(p.departmentId)}` : ""}
                  {p.lastLoginAt ? ` · last seen ${relativeTime(p.lastLoginAt)}` : " · never signed in"}
                </p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Badge tone={p.role === "ADMIN" ? "purple" : p.role === "ACCOUNTANT" ? "teal" : p.role === "MANAGEMENT" ? "amber" : "gray"}>{ROLE_LABELS[p.role]}</Badge>
                {p.status === "SUSPENDED" && <Badge tone="red">Suspended</Badge>}
              </div>
              <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${p.firstName} ${p.lastName}`} modalSize="lg">
                <UserForm departments={lookups.departments} user={p} />
              </ModalButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
