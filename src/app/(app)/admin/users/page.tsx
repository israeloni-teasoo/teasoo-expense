import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { ResendLoginForm, UserForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, Avatar, PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { config, emailEnabled, googleEnabled } from "@/lib/config";
import { relativeTime } from "@/lib/dates";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { getLookups } from "@/lib/services/org";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireUser();
  const isAdmin = can(user.role, "admin.users");
  if (!isAdmin && !can(user.role, "users.addAdhoc")) redirect("/dashboard?denied=1");

  // Only the fields the page needs — never send password hashes or tokens to the browser.
  const [people, lookups] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        jobTitle: users.jobTitle,
        role: users.role,
        departmentId: users.departmentId,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        googleSub: users.googleSub,
        passwordSetByAdmin: users.passwordSetByAdmin,
      })
      .from(users)
      .where(eq(users.organisationId, user.organisationId))
      .orderBy(asc(users.firstName)),
    getLookups(user.organisationId),
  ]);
  const dept = new Map(lookups.departments.map((d) => [d.id, d.name]));
  const google = googleEnabled();
  const formProps = { companyDomain: config.companyDomain, googleSignIn: google };

  return (
    <div>
      <PageHeader
        title="Users"
        description={
          google
            ? `Anyone with an @${config.companyDomain} Google account is let in as Staff on first sign-in. Add ad-hoc staff without a company email here.`
            : `${people.length} people in your organisation`
        }
        actions={
          <ModalButton
            label={isAdmin ? "Add user" : "Add ad-hoc staff"}
            variant="primary"
            icon={<UserPlus className="h-4 w-4" />}
            title={isAdmin ? "Add user" : "Add ad-hoc staff"}
            modalSize="lg"
          >
            <UserForm departments={lookups.activeDepartments} canChooseRole={isAdmin} {...formProps} />
          </ModalButton>
        }
      />
      {!emailEnabled() && (
        <div className="mb-4">
          <Alert tone="amber" title="Email isn't configured">
            Login details can&apos;t be emailed until RESEND_API_KEY is set. You&apos;ll be shown the password to share instead.
          </Alert>
        </div>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {people.map((p) => {
            const passwordUser = !!p.hasPassword;
            const canResend = passwordUser && (isAdmin || p.role === "STAFF") && p.id !== user.id;
            return (
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
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    <Badge>{ROLE_LABELS[p.role]}</Badge>
                    {p.status === "SUSPENDED" && <Badge tone="red">Suspended</Badge>}
                  </div>
                </div>
                <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                  <Badge tone={passwordUser ? "amber" : "blue"}>{passwordUser ? (p.passwordSetByAdmin ? "Password · issued" : "Password") : "Google"}</Badge>
                  <Badge tone={p.role === "ADMIN" ? "purple" : p.role === "ACCOUNTANT" ? "teal" : p.role === "MANAGEMENT" ? "amber" : "gray"}>{ROLE_LABELS[p.role]}</Badge>
                  {p.status === "SUSPENDED" && <Badge tone="red">Suspended</Badge>}
                </div>
                {canResend && (
                  <ModalButton label="Login" size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} title={`New login details for ${p.firstName}`} modalSize="sm">
                    <ResendLoginForm userId={p.id} email={p.email} />
                  </ModalButton>
                )}
                {isAdmin && (
                  <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${p.firstName} ${p.lastName}`} modalSize="lg">
                    <UserForm
                      departments={lookups.departments}
                      user={{
                        id: p.id,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        email: p.email,
                        phone: p.phone,
                        jobTitle: p.jobTitle,
                        role: p.role,
                        departmentId: p.departmentId,
                        status: p.status,
                      }}
                      {...formProps}
                    />
                  </ModalButton>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
