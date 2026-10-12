"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { koboToInput } from "@/lib/money";
import type { OrgSettings, Role } from "@/db/schema";
import { resendInviteAction, resendLoginAction, saveCategoryAction, saveDepartmentAction, saveProjectAction, saveSettingsAction, saveUserAction, type IssuedCredentials } from "@/app/actions/admin";
import { updateProfileAction } from "@/app/actions/account";

type Opt = { id: string; name: string };

export function ProfileForm({ phone, emailNotifications, hasPassword }: { phone: string | null; emailNotifications: boolean; hasPassword: boolean }) {
  return (
    <ActionForm action={updateProfileAction}>
      <FormField name="phone" label="Phone">
        <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} autoComplete="tel" />
      </FormField>
      <Checkbox
        name="emailNotifications"
        defaultChecked={emailNotifications}
        label="Email me notifications"
        description="Approvals, questions, new funds and reminders are also sent to your inbox."
      />
      {hasPassword && (
        <div id="password" className="scroll-mt-24 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-900">Change password</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField name="currentPassword" label="Current password">
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
            </FormField>
            <FormField name="newPassword" label="New password">
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
            </FormField>
            <FormField name="confirmPassword" label="Confirm new password">
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" />
            </FormField>
          </div>
          <p className="text-xs text-gray-500">Leave the password fields empty to keep your current password.</p>
        </div>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

function CredentialsPanel({ creds, onDone }: { creds: IssuedCredentials; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (creds.existing || creds.google) {
    const orgs = creds.organisations?.join(", ");
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {creds.existing ? (
            <>
              <span className="font-semibold">{creds.email}</span> already had an account and now also has access to <span className="font-semibold">{orgs}</span>.
            </>
          ) : (
            <>
              <span className="font-semibold">{creds.email}</span> has been invited{orgs ? <> to <span className="font-semibold">{orgs}</span></> : null}. They sign in with “Sign in with Google” — no password needed.
            </>
          )}
        </p>
        {creds.emailed === false && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">The invitation email could not be sent. Let them know they can sign in at {window.location.origin}/login.</p>
        )}
        {creds.emailed && <p className="text-sm text-gray-600">An email with sign-in instructions is on its way.</p>}
        {onDone && <div className="flex justify-end"><Button type="button" onClick={onDone}>Done</Button></div>}
      </div>
    );
  }
  const text = `Sign in at ${window.location.origin}/login\nEmail: ${creds.email}\nPassword: ${creds.password}`;
  return (
    <div className="space-y-3">
      {creds.emailed ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Login details were emailed to <span className="font-semibold">{creds.email}</span>.</p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {creds.emailed === false ? "The email could not be sent. " : ""}Share these login details with them securely — the password won&apos;t be shown again.
        </p>
      )}
      <dl className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Email</dt><dd className="font-medium">{creds.email}</dd></div>
        <div className="mt-1 flex justify-between gap-3"><dt className="text-gray-500">Password</dt><dd className="font-mono font-semibold">{creds.password}</dd></div>
      </dl>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </Button>
        {onDone && <Button type="button" onClick={onDone}>Done</Button>}
      </div>
    </div>
  );
}

export type OrgOption = { id: string; name: string; anyRole: boolean };

export function UserForm({
  user,
  departments,
  canChooseRole = true,
  companyDomain,
  googleSignIn,
  orgOptions = [],
  activeOrg,
  canGrantGroupAdmin = false,
}: {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    jobTitle: string | null;
    role: Role;
    departmentId: string | null;
    status: string;
    isGroupAdmin?: boolean;
    /** Organisations the person currently belongs to. */
    organisationIds?: string[];
  };
  departments: Opt[];
  /** Accountants can only add staff. */
  canChooseRole?: boolean;
  companyDomain: string;
  googleSignIn: boolean;
  /** Organisations the actor manages (for inviting into several at once, or adding access later). */
  orgOptions?: OrgOption[];
  activeOrg: { id: string; name: string };
  canGrantGroupAdmin?: boolean;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [creds, setCreds] = useState<IssuedCredentials | null>(null);
  const modal = useModal();
  const usesGoogle = googleSignIn && email.trim().toLowerCase().endsWith("@" + companyDomain);
  // When editing, only other organisations where the actor is an administrator can be toggled.
  const orgChoices = user ? orgOptions.filter((o) => o.anyRole && o.id !== activeOrg.id) : orgOptions;
  const showOrgs = user ? orgChoices.length > 0 : orgChoices.length > 1;
  if (creds) return <CredentialsPanel creds={creds} onDone={() => modal?.close()} />;
  return (
    <ActionForm
      action={saveUserAction}
      closeOnSuccess={!!user}
      onSuccess={(r) => {
        if (!user && r.ok && r.data) setCreds(r.data as IssuedCredentials);
      }}
    >
      {user && <input type="hidden" name="userId" value={user.id} />}
      {!user && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          People can only sign in after they&apos;re invited.{" "}
          {googleSignIn ? `@${companyDomain} staff sign in with Google; anyone else gets a password.` : "They'll get a password to sign in with."}
          {" "}If they already have an account, they&apos;re simply given access to the organisations you choose.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="firstName" label="First name" required>
          <Input id="firstName" name="firstName" defaultValue={user?.firstName} />
        </FormField>
        <FormField name="lastName" label="Last name" required>
          <Input id="lastName" name="lastName" defaultValue={user?.lastName} />
        </FormField>
        <FormField
          name="email"
          label="Email"
          required
          className="sm:col-span-2"
          hint={usesGoogle ? `@${companyDomain} accounts sign in with Google, so no password is set.` : undefined}
        >
          <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        {canChooseRole ? (
          <FormField name="role" label={user ? `Role in ${activeOrg.name}` : "Role"} required>
            <Select id="role" name="role" defaultValue={user?.role ?? "STAFF"}>
              <option value="STAFF">Staff</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="ADMIN">Administrator</option>
              <option value="MANAGEMENT">Management (read-only)</option>
            </Select>
          </FormField>
        ) : (
          <input type="hidden" name="role" value="STAFF" />
        )}
        <FormField name="departmentId" label={`Department in ${activeOrg.name}`}>
          <Select id="departmentId" name="departmentId" defaultValue={user?.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="jobTitle" label="Job title">
          <Input id="jobTitle" name="jobTitle" defaultValue={user?.jobTitle ?? ""} />
        </FormField>
        <FormField name="phone" label="Phone">
          <Input id="phone" name="phone" type="tel" defaultValue={user?.phone ?? ""} />
        </FormField>
        {user && (
          <FormField name="status" label={`Access to ${activeOrg.name}`}>
            <Select id="status" name="status" defaultValue={user.status}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended (cannot use this organisation)</option>
            </Select>
          </FormField>
        )}
        {!usesGoogle && (
          <FormField
            name="password"
            label={user ? "Set a new password" : "Password"}
            hint={user ? "Leave blank to keep the current password." : "Leave blank to generate a secure one."}
          >
            <Input id="password" name="password" type="text" autoComplete="new-password" />
          </FormField>
        )}
      </div>
      {showOrgs && (
        <fieldset className="rounded-lg border border-gray-200 p-3">
          <input type="hidden" name="orgsShown" value="1" />
          <legend className="px-1 text-sm font-medium text-gray-900">{user ? "Other organisations" : "Organisations"}</legend>
          <p className="mb-2 text-xs text-gray-500">
            {user
              ? `They keep access to ${activeOrg.name}. Tick other companies they should also work in (with the role above); untick to remove access.`
              : "Invite them into one or more companies. You can change this later."}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {orgChoices.map((o) => (
              <label key={o.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  name="organisationIds"
                  value={o.id}
                  defaultChecked={user ? !!user.organisationIds?.includes(o.id) : o.id === activeOrg.id}
                  autoComplete="off"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-600"
                />
                <span>
                  {o.name}
                  {!o.anyRole && <span className="block text-xs text-gray-500">Staff only (you&apos;re an accountant here)</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!showOrgs && !user && <input type="hidden" name="organisationIds" value={activeOrg.id} />}
      {canGrantGroupAdmin && user && (
        <>
          <input type="hidden" name="groupAdminShown" value="1" />
          <Checkbox
            name="isGroupAdmin"
            defaultChecked={!!user.isGroupAdmin}
            label="Group administrator"
            description="Can see and manage every organisation, including adding new subsidiaries."
          />
        </>
      )}
      {!usesGoogle && (
        <Checkbox
          name="sendCredentials"
          defaultChecked={!user}
          label={user ? "Email the new login details to them" : "Email the invitation with their login details"}
          description="They can keep the password or change it after signing in."
        />
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText={user ? "Saving…" : "Inviting…"}>{user ? "Save changes" : "Send invite"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResendInviteForm({ userId, email }: { userId: string; email: string }) {
  return (
    <ActionForm action={resendInviteAction}>
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm text-gray-600">
        Send the invitation to <span className="font-medium text-gray-900">{email}</span> again. It tells them to sign in with Google using this address.
      </p>
      <div className="flex justify-end">
        <SubmitButton pendingText="Sending…">Resend invite</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResendLoginForm({ userId, email }: { userId: string; email: string }) {
  const [creds, setCreds] = useState<IssuedCredentials | null>(null);
  const modal = useModal();
  if (creds) return <CredentialsPanel creds={creds} onDone={() => modal?.close()} />;
  return (
    <ActionForm action={resendLoginAction} closeOnSuccess={false} onSuccess={(r) => r.ok && r.data && setCreds(r.data as IssuedCredentials)}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <p className="text-sm text-gray-600">
        A new password will be generated for <span className="font-medium text-gray-900">{email}</span>. Their current password stops working.
      </p>
      <Checkbox name="sendCredentials" defaultChecked label="Email the new login details to them" />
      <div className="flex justify-end">
        <SubmitButton pendingText="Issuing…">Issue new password</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CategoryForm({ c }: { c?: { id: string; name: string; description: string | null; keywords: string | null; receiptRequired: boolean; isOther: boolean; archived: boolean } }) {
  return (
    <ActionForm action={saveCategoryAction} resetOnSuccess={!c}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <FormField name="name" label="Name" required>
        <Input id="name" name="name" defaultValue={c?.name} />
      </FormField>
      <FormField name="description" label="Description">
        <Input id="description" name="description" defaultValue={c?.description ?? ""} />
      </FormField>
      <FormField name="keywords" label="Keywords" hint="Comma-separated. Used to suggest this category from an expense description.">
        <Textarea id="keywords" name="keywords" rows={2} defaultValue={c?.keywords ?? ""} />
      </FormField>
      <Checkbox name="receiptRequired" defaultChecked={c?.receiptRequired ?? true} label="Receipt required" description="Enforced when “Require receipts before funded expenses can be submitted” is on in Settings. Personal-spend claims always need a receipt." />
      <Checkbox name="isOther" defaultChecked={c?.isOther ?? false} label="Staff type the category" description="For an “Others” category: when chosen, staff must type what the expense was (e.g. Gifts)." />
      {c && <Checkbox name="archived" defaultChecked={c.archived} label="Archived" description="Hidden from new expenses; existing records keep it." />}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save category</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DepartmentForm({ d }: { d?: { id: string; name: string; code: string | null; archived: boolean } }) {
  return (
    <ActionForm action={saveDepartmentAction} resetOnSuccess={!d}>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" defaultValue={d?.name} />
        </FormField>
        <FormField name="code" label="Code">
          <Input id="code" name="code" defaultValue={d?.code ?? ""} />
        </FormField>
      </div>
      {d && <Checkbox name="archived" defaultChecked={d.archived} label="Archived" />}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save department</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProjectForm({
  p,
  departments,
}: {
  p?: { id: string; name: string; code: string | null; description: string | null; budget: number | null; departmentId: string | null; startDate: string | null; endDate: string | null; archived: boolean };
  departments: Opt[];
}) {
  return (
    <ActionForm action={saveProjectAction} resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" defaultValue={p?.name} />
        </FormField>
        <FormField name="code" label="Code">
          <Input id="code" name="code" defaultValue={p?.code ?? ""} />
        </FormField>
      </div>
      <FormField name="description" label="Description">
        <Input id="description" name="description" defaultValue={p?.description ?? ""} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="budget" label="Budget">
          <MoneyInput id="budget" name="budget" defaultValue={koboToInput(p?.budget)} />
        </FormField>
        <FormField name="departmentId" label="Department">
          <Select id="departmentId" name="departmentId" defaultValue={p?.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="startDate" label="Start date">
          <Input id="startDate" name="startDate" type="date" defaultValue={p?.startDate ?? ""} />
        </FormField>
        <FormField name="endDate" label="End date">
          <Input id="endDate" name="endDate" type="date" defaultValue={p?.endDate ?? ""} />
        </FormField>
      </div>
      {p && <Checkbox name="archived" defaultChecked={p.archived} label="Archived" />}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save project</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SettingsForm({ name, settings }: { name: string; settings: OrgSettings }) {
  return (
    <ActionForm action={saveSettingsAction} className="space-y-6">
      <FormField name="name" label="Organisation name" required>
        <Input id="name" name="name" defaultValue={name} />
      </FormField>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-gray-900">Expense validation rules</legend>
        <Checkbox
          name="requireReceipt"
          defaultChecked={settings.requireReceipt}
          label="Require receipts before funded expenses can be submitted"
          description="Applies to categories marked “receipt required”. When off, staff can submit now and add the receipt later. Personal-spend claims always need a receipt."
        />
        <Checkbox name="blockFutureDates" defaultChecked={settings.blockFutureDates} label="Block future expense dates" description="“Expense date cannot be in the future.”" />
        <Checkbox name="duplicateDetection" defaultChecked={settings.duplicateDetection} label="Warn about possible duplicates" description="Same amount within 3 days with a similar description or vendor." />
        <Checkbox name="blockOverspend" defaultChecked={settings.blockOverspend} label="Block over-spending" description="When off, over-budget expenses are allowed but flagged, and the staff member logs a claim with evidence of approval." />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="maxUploadMb" label="Max upload size (MB)">
          <Input id="maxUploadMb" name="maxUploadMb" type="number" min={1} max={25} defaultValue={settings.maxUploadMb} />
        </FormField>
        <FormField name="nearDepletionPercent" label="“Nearly used up” alert at (%)">
          <Input id="nearDepletionPercent" name="nearDepletionPercent" type="number" min={50} max={100} defaultValue={settings.nearDepletionPercent} />
        </FormField>
        <FormField name="unusualMultiplier" label="Unusual expense threshold (× avg)">
          <Input id="unusualMultiplier" name="unusualMultiplier" type="number" step="0.5" min={1.5} max={20} defaultValue={settings.unusualMultiplier} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
