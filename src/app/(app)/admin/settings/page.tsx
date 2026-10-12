import type { Metadata } from "next";
import { SettingsForm } from "@/components/forms/admin-forms";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { getOrg } from "@/lib/services/org";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePagePermission("admin.config");
  const org = await getOrg(user.organisationId);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Organisation details and the validation rules applied to every expense." />
      <Card>
        <CardBody>
          <SettingsForm name={org.name} settings={org.settings} />
        </CardBody>
      </Card>
    </div>
  );
}
