import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRightLeft, Building2, Pencil, Plus } from "lucide-react";
import { OrganisationForm } from "@/components/forms/organisation-forms";
import { OrgMark } from "@/components/shell/org-switcher";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requireUser } from "@/lib/auth/current";
import { formatDate } from "@/lib/dates";
import { listOrganisations } from "@/lib/services/organisations";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrganisationsPage() {
  const user = await requireUser();
  if (!user.isGroupAdmin) redirect("/dashboard?denied=1");
  const orgs = await listOrganisations(user);
  const logoUrl = (o: (typeof orgs)[number]) => (o.logoKey ? `/api/organisations/${o.id}/logo?v=${o.updatedAt.getTime()}` : null);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Organisations"
        description="Your companies and subsidiaries. Each has its own people, funds, expenses, categories and reports. Switch between them from the menu at the top left."
        actions={
          <ModalButton label="Add organisation" variant="primary" icon={<Plus className="h-4 w-4" />} title="Add organisation">
            <OrganisationForm groupAdmin />
          </ModalButton>
        }
      />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {orgs.map((o) => {
            const active = o.id === user.organisationId;
            return (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-testid="org-row">
                <OrgMark org={{ name: o.name, logoUrl: logoUrl(o) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {o.name} {active && <span className="text-xs font-normal text-gray-400">(current)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {o.members} active {o.members === 1 ? "member" : "members"} · {o.currency} · added {formatDate(o.createdAt, "short")}
                  </p>
                </div>
                {o.archived && <Badge tone="gray">Archived</Badge>}
                {!active && !o.archived && (
                  <a href={`/api/org/switch?org=${o.id}&next=/dashboard`} className={buttonClasses("ghost", "sm")}>
                    <ArrowRightLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Switch</span>
                  </a>
                )}
                <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${o.name}`}>
                  <OrganisationForm groupAdmin org={{ id: o.id, name: o.name, currency: o.currency, archived: o.archived, logoUrl: logoUrl(o) }} />
                </ModalButton>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="mt-4 flex items-start gap-2 text-sm text-gray-500">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
        New organisations start with the default departments and expense categories (including “Others”). You become their administrator; invite people from Users after switching to it.
      </p>
    </div>
  );
}
