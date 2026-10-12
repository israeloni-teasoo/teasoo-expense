"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { saveOrganisationAction } from "@/app/actions/organisations";
import { OrgMark } from "@/components/shell/org-switcher";

const CURRENCIES = [
  ["NGN", "Nigerian naira (₦)"],
  ["USD", "US dollar ($)"],
  ["GBP", "British pound (£)"],
  ["EUR", "Euro (€)"],
  ["GHS", "Ghanaian cedi (GH₵)"],
  ["KES", "Kenyan shilling (KSh)"],
  ["ZAR", "South African rand (R)"],
] as const;

type Org = { id: string; name: string; currency: string; logoUrl: string | null; archived: boolean };

/**
 * Create or edit an organisation (company/subsidiary). Group admins see every field;
 * an organisation's own administrators can change its name and logo from Settings.
 */
export function OrganisationForm({ org, groupAdmin, logoOnly }: { org?: Org; groupAdmin: boolean; /** Settings page: just the logo (the name is edited above). */ logoOnly?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(org?.name ?? "");
  return (
    <ActionForm action={saveOrganisationAction} resetOnSuccess={!org}>
      {org && <input type="hidden" name="id" value={org.id} />}
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain p-0.5" />
        ) : (
          <span className="[&>*]:h-12 [&>*]:w-12 [&>*]:text-sm">
            <OrgMark org={{ name: name || "New", logoUrl: org?.logoUrl ?? null }} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <FormField name="logo" label="Logo" hint="PNG, JPG or WebP, up to 2 MB. A square logo looks best.">
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-100"
            />
          </FormField>
        </div>
      </div>
      {org?.logoUrl && <Checkbox name="removeLogo" label="Remove the current logo" />}
      {logoOnly ? (
        <input type="hidden" name="name" value={name} />
      ) : (
        <FormField name="name" label="Organisation name" required>
          <Input id="org-name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Teasoo Logistics Ltd" />
        </FormField>
      )}
      {groupAdmin && (
        <FormField name="currency" label="Currency">
          <Select id="currency" name="currency" defaultValue={org?.currency ?? "NGN"}>
            {CURRENCIES.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </Select>
        </FormField>
      )}
      {groupAdmin && org && (
        <>
          <input type="hidden" name="archivedShown" value="1" />
          <Checkbox
            name="archived"
            defaultChecked={org.archived}
            label="Archived"
            description="Hidden from the organisation menu; nobody can work in it. Its records are kept and it can be restored."
          />
        </>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{logoOnly ? "Save logo" : org ? "Save organisation" : "Create organisation"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
