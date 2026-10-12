"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { koboToInput } from "@/lib/money";
import type { OrgSettings, Role } from "@/db/schema";
import { resendLoginAction, saveCategoryAction, saveDepartmentAction, saveProjectAction, saveSettingsAction, saveUserAction, type IssuedCredentials } from "@/app/actions/admin";
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
  if (creds.google) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="font-semibold">{creds.email}</span> has been added. They sign in with “Sign in with Google” — no password needed.
        </p>
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

export function UserForm({
  user,
  departments,
  canChooseRole = true,
  companyDomain,
  googleSignIn,
}: {
  user?: { id: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null; role: Role; departmentId: string | null; status: string };
  departments: Opt[];
  /** Accountants can only add ad-hoc staff. */
  canChooseRole?: boolean;
  companyDomain: string;
  googleSignIn: boolean;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [creds, setCreds] = useState<IssuedCredentials | null>(null);
  const modal = useModal();
  const usesGoogle = googleSignIn && email.trim().toLowerCase().endsWith("@" + companyDomain);
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
      {!user && !canChooseRole && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          For people without an @{companyDomain} email — contractors, temporary or field staff. They sign in with an email and password.
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
          <FormField name="role" label="Role" required>
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
        <FormField name="departmentId" label="Department">
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
          <FormField name="status" label="Status">
            <Select id="status" name="status" defaultValue={user.status}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended (cannot sign in)</option>
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
      {!usesGoogle && (
        <Checkbox
          name="sendCredentials"
          defaultChecked={!user}
          label="Email the login details to them"
          description="They can keep the password or change it after signing in."
        />
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{user ? "Save changes" : "Add user"}</SubmitButton>
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

export function CategoryForm({ c }: { c?: { id: string; name: string; description: string | null; keywords: string | null; receiptRequired: boolean; archived: boolean } }) {
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
      <Checkbox name="receiptRequired" defaultChecked={c?.receiptRequired ?? true} label="Receipt required" description="Expenses in this category can't be submitted without a receipt." />
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
        <Checkbox name="requireReceipt" defaultChecked={settings.requireReceipt} label="Require a receipt for every expense" description="When off, only categories marked “receipt required” need one." />
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
