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
              { label: "Organisation", value: user.organisation.name },
              { label: "Role", value: `${ROLE_LABELS[user.role]}${user.isGroupAdmin ? " · Group administrator" : ""}` },
              { label: "Department", value: dept?.name },
              { label: "Job title", value: user.jobTitle },
              { label: "Last sign-in", value: formatDateTime(user.lastLoginAt) },
              { label: "Signs in with", value: user.hasPassword ? "Email & password" : "Google" },
            ]}
          />
        </CardBody>
      </Card>
      {user.organisations.length > 1 && (
        <Card>
          <CardHeader title="Your organisations" description="Switch between them from the menu at the top left" />
          <ul className="divide-y divide-gray-100">
            {user.organisations.map((o) => (
              <li key={o.organisationId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 truncate font-medium text-gray-900">
                  {o.name} {o.organisationId === user.organisationId && <span className="text-xs font-normal text-gray-400">(current)</span>}
                </span>
                <span className="shrink-0 text-gray-500">{ROLE_LABELS[o.role]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title={user.hasPassword ? "Contact, notifications & password" : "Contact & notifications"} />
        <CardBody>
          <ProfileForm phone={user.phone} emailNotifications={user.emailNotifications} hasPassword={user.hasPassword} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="What you can do" description={`Permissions granted by your role in ${user.organisation.name}`} />
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
