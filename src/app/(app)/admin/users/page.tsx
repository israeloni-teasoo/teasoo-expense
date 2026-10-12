import type { Metadata } from "next";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { KeyRound, Mail, Pencil, UserPlus } from "lucide-react";
import { ResendInviteForm, ResendLoginForm, UserForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, Avatar, PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { db } from "@/db";
import { memberships, organisations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { config, emailEnabled, googleEnabled } from "@/lib/config";
import { relativeTime } from "@/lib/dates";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { manageableOrganisations } from "@/lib/services/admin";
import { getLookups } from "@/lib/services/org";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireUser();
  const isAdmin = can(user.role, "admin.users");
  if (!isAdmin && !can(user.role, "users.addAdhoc")) redirect("/dashboard?denied=1");

  // Members of the active organisation. Only the fields the page needs — never password hashes or tokens.
  const [people, lookups] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        jobTitle: users.jobTitle,
        role: memberships.role,
        departmentId: memberships.departmentId,
        status: memberships.status,
        accountStatus: users.status,
        isGroupAdmin: users.isGroupAdmin,
        lastLoginAt: users.lastLoginAt,
        invitedAt: users.invitedAt,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        googleSub: users.googleSub,
        passwordSetByAdmin: users.passwordSetByAdmin,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, user.organisationId))
      .orderBy(asc(users.firstName), asc(users.lastName)),
    getLookups(user.organisationId),
  ]);
  // Other organisations each person belongs to, for the badges and the edit form.
  const others = people.length
    ? await db
        .select({ userId: memberships.userId, organisationId: memberships.organisationId, name: organisations.name, role: memberships.role })
        .from(memberships)
        .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
        .where(and(inArray(memberships.userId, people.map((p) => p.id)), ne(memberships.organisationId, user.organisationId), eq(organisations.archived, false)))
    : [];
  const otherOrgs = (id: string) => others.filter((o) => o.userId === id);
  const dept = new Map(lookups.departments.map((d) => [d.id, d.name]));
  const google = googleEnabled();
  const orgOptions = manageableOrganisations(user);
  const formProps = {
    companyDomain: config.companyDomain,
    googleSignIn: google,
    orgOptions,
    activeOrg: { id: user.organisationId, name: user.organisation.name },
    canGrantGroupAdmin: user.isGroupAdmin,
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${people.length} ${people.length === 1 ? "person" : "people"} in ${user.organisation.name}. Access is by invitation only — invite people here and they'll get an email telling them how to sign in.`}
        actions={
          <ModalButton label="Invite user" variant="primary" icon={<UserPlus className="h-4 w-4" />} title="Invite user" modalSize="lg">
            <UserForm departments={lookups.activeDepartments} canChooseRole={isAdmin} {...formProps} />
          </ModalButton>
        }
      />
      {!emailEnabled() && (
        <div className="mb-4">
          <Alert tone="amber" title="Email isn't configured">
            Invitations can&apos;t be emailed until RESEND_API_KEY is set. Tell people they&apos;ve been invited; password users will be shown their password to share.
          </Alert>
        </div>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {people.map((p) => {
            const passwordUser = !!p.hasPassword;
            const manageable = (isAdmin || (p.role === "STAFF" && !p.isGroupAdmin)) && p.id !== user.id;
            const pending = !p.lastLoginAt;
            const suspended = p.status === "SUSPENDED" || p.accountStatus === "SUSPENDED";
            const elsewhere = otherOrgs(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-testid="user-row">
                <Avatar name={`${p.firstName} ${p.lastName}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {p.firstName} {p.lastName} {p.id === user.id && <span className="text-xs font-normal text-gray-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {p.email}
                    {p.departmentId ? ` · ${dept.get(p.departmentId)}` : ""}
                    {p.lastLoginAt ? ` · last seen ${relativeTime(p.lastLoginAt)}` : p.invitedAt ? ` · invited ${relativeTime(p.invitedAt)}` : " · never signed in"}
                  </p>
                  {elsewhere.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">Also in {elsewhere.map((o) => `${o.name} (${ROLE_LABELS[o.role]})`).join(", ")}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    <Badge>{ROLE_LABELS[p.role]}</Badge>
                    {pending && <Badge tone="amber">Invited</Badge>}
                    {suspended && <Badge tone="red">Suspended</Badge>}
                  </div>
                </div>
                <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                  {pending && <Badge tone="amber">Invited</Badge>}
                  <Badge tone={passwordUser ? "amber" : "blue"}>{passwordUser ? (p.passwordSetByAdmin ? "Password · issued" : "Password") : "Google"}</Badge>
                  {p.isGroupAdmin && <Badge tone="purple">Group admin</Badge>}
                  <Badge tone={p.role === "ADMIN" ? "purple" : p.role === "ACCOUNTANT" ? "teal" : p.role === "MANAGEMENT" ? "amber" : "gray"}>{ROLE_LABELS[p.role]}</Badge>
                  {suspended && <Badge tone="red">Suspended</Badge>}
                </div>
                {manageable && passwordUser && (
                  <ModalButton label="Login" size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} title={`New login details for ${p.firstName}`} modalSize="sm">
                    <ResendLoginForm userId={p.id} email={p.email} />
                  </ModalButton>
                )}
                {manageable && !passwordUser && pending && (
                  <ModalButton label="Invite" size="sm" variant="ghost" icon={<Mail className="h-3.5 w-3.5" />} title={`Resend invitation to ${p.firstName}`} modalSize="sm">
                    <ResendInviteForm userId={p.id} email={p.email} />
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
                        status: suspended ? "SUSPENDED" : "ACTIVE",
                        isGroupAdmin: p.isGroupAdmin,
                        organisationIds: [user.organisationId, ...elsewhere.map((o) => o.organisationId)],
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
