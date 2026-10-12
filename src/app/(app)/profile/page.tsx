import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { ProfileForm } from "@/components/forms/admin-forms";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, DescriptionList, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/dates";
import { PERMISSIONS, permissionsFor, ROLE_LABELS } from "@/lib/rbac";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const dept = user.departmentId ? await db.query.departments.findFirst({ where: eq(departments.id, user.departmentId) }) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" />
      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar name={user.fullName} className="h-14 w-14 text-lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-gray-900">{user.fullName}</p>
            <p className="truncate text-sm text-gray-500">{user.email}</p>
          </div>
        </CardBody>
        <CardBody className="border-t border-gray-100">
          <DescriptionList
            items={[
              { label: "Role", value: ROLE_LABELS[user.role] },
              { label: "Department", value: dept?.name },
              { label: "Job title", value: user.jobTitle },
              { label: "Last sign-in", value: formatDateTime(user.lastLoginAt) },
              { label: "Signs in with", value: user.hasPassword ? "Email & password" : "Google" },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={user.hasPassword ? "Contact, notifications & password" : "Contact & notifications"} />
        <CardBody>
          <ProfileForm phone={user.phone} emailNotifications={user.emailNotifications} hasPassword={user.hasPassword} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="What you can do" description="Permissions granted by your role" />
        <CardBody>
          <ul className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
            {permissionsFor(user.role).map((p) => (
              <li key={p} className="flex gap-2"><span className="text-emerald-600">✓</span>{PERMISSIONS[p]}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
