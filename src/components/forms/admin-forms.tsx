"use client";

import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { koboToInput } from "@/lib/money";
import type { OrgSettings, Role } from "@/db/schema";
import { saveCategoryAction, saveDepartmentAction, saveProjectAction, saveSettingsAction, saveUserAction } from "@/app/actions/admin";
import { updateProfileAction } from "@/app/actions/account";

type Opt = { id: string; name: string };

export function ProfileForm({ phone }: { phone: string | null }) {
  return (
    <ActionForm action={updateProfileAction}>
      <FormField name="phone" label="Phone">
        <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} autoComplete="tel" />
      </FormField>
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
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function UserForm({
  user,
  departments,
}: {
  user?: { id: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null; role: Role; departmentId: string | null; status: string };
  departments: Opt[];
}) {
  return (
    <ActionForm action={saveUserAction} resetOnSuccess={!user}>
      {user && <input type="hidden" name="userId" value={user.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="firstName" label="First name" required>
          <Input id="firstName" name="firstName" defaultValue={user?.firstName} />
        </FormField>
        <FormField name="lastName" label="Last name" required>
          <Input id="lastName" name="lastName" defaultValue={user?.lastName} />
        </FormField>
        <FormField name="email" label="Email" required className="sm:col-span-2">
          <Input id="email" name="email" type="email" defaultValue={user?.email} />
        </FormField>
        <FormField name="role" label="Role" required>
          <Select id="role" name="role" defaultValue={user?.role ?? "STAFF"}>
            <option value="STAFF">Staff</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="ADMIN">Administrator</option>
            <option value="MANAGEMENT">Management (read-only)</option>
          </Select>
        </FormField>
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
        <FormField name="password" label={user ? "Reset password" : "Temporary password"} required={!user} hint={user ? "Leave blank to keep the current password." : "At least 8 characters with letters and numbers."}>
          <Input id="password" name="password" type="text" autoComplete="new-password" />
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{user ? "Save changes" : "Create user"}</SubmitButton>
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
