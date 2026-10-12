import type { Metadata } from "next";
import { headers } from "next/headers";
import { SettingsForm } from "@/components/forms/admin-forms";
import { OrganisationForm } from "@/components/forms/organisation-forms";
import { DiagnosticsButtons } from "@/components/forms/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { redirectUriFor } from "@/lib/auth/google";
import { config, emailEnabled, emailFromWarning, googleEnabled } from "@/lib/config";
import { storageDriverName } from "@/lib/storage";
import { getOrg } from "@/lib/services/org";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePagePermission("admin.config");
  const org = await getOrg(user.organisationId);
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (host.startsWith("localhost") ? "http" : "https");
  const redirectUri = redirectUriFor(`${proto}://${host}`);
  const status = [
    { label: "Google sign-in", ok: googleEnabled(), detail: googleEnabled() ? `@${config.companyDomain} accounts` : "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set" },
    {
      label: "Email (Resend)",
      ok: emailEnabled(),
      detail: !emailEnabled() ? "RESEND_API_KEY not set — emails are logged, not sent" : config.email.from,
      warning: emailFromWarning(),
    },
    { label: "Receipt storage", ok: storageDriverName() === "supabase", detail: storageDriverName() === "supabase" ? "Supabase Storage (private bucket)" : "Local folder (development only)" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Organisation details and the validation rules applied to every expense." />
      <Card>
        <CardBody>
          <SettingsForm name={org.name} settings={org.settings} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Logo" description={`Shown beside ${org.name} in the organisation menu at the top left`} />
        <CardBody>
          <OrganisationForm
            logoOnly
            groupAdmin={false}
            org={{ id: org.id, name: org.name, currency: org.currency, archived: org.archived, logoUrl: org.logoKey ? `/api/organisations/${org.id}/logo?v=${org.updatedAt.getTime()}` : null }}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Integrations" description="Configured through environment variables on the server" />
        <CardBody className="space-y-4">
          <ul className="space-y-2 text-sm">
            {status.map((s) => (
              <li key={s.label} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-gray-900">{s.label}</span>
                <span className="flex items-center gap-2 text-gray-500">
                  <span className="text-xs">{s.detail}</span>
                  <Badge tone={s.ok ? "green" : "amber"}>{s.ok ? "On" : "Off"}</Badge>
                </span>
                {"warning" in s && s.warning && <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{s.warning}</p>}
              </li>
            ))}
          </ul>
          <DiagnosticsButtons />
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-900">Google OAuth redirect URI for this domain</p>
            <p className="mt-1 text-xs text-gray-500">
              Add this exactly under Google Cloud Console → APIs &amp; Services → Credentials → your OAuth client → Authorised redirect URIs. Add one per domain people sign in from.
            </p>
            <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 text-xs text-gray-900 ring-1 ring-gray-200">{redirectUri}</code>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
