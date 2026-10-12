"use client";

import { useState } from "react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { formatMoney, koboToInput } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/format";
import {
  addFundingAction,
  createAllocationAction,
  createPersonalSpendAction,
  reconcileAction,
  recordReturnAction,
  setAllocationStatusAction,
  settlePersonalSpendAction,
  updateAllocationAction,
} from "@/app/actions/allocations";
import { createClaimAction } from "@/app/actions/claims";

type Opt = { id: string; name: string };

export function NewAllocationForm({
  staff,
  departments,
  projects,
  today,
  defaultStaffId,
}: {
  staff: { id: string; name: string; departmentId: string | null; detail?: string }[];
  departments: Opt[];
  projects: Opt[];
  today: string;
  defaultStaffId?: string;
}) {
  const [staffId, setStaffId] = useState(defaultStaffId ?? "");
  const [departmentId, setDepartmentId] = useState(staff.find((s) => s.id === defaultStaffId)?.departmentId ?? "");
  return (
    <ActionForm action={createAllocationAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Who and how much</h2>
        <FormField name="staffId" label="Staff member" required>
          <Select
            id="staffId"
            name="staffId"
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              const d = staff.find((s) => s.id === e.target.value)?.departmentId;
              if (d) setDepartmentId(d);
            }}
          >
            <option value="">Choose staff member…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.detail ? ` — ${s.detail}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="amount" label="Amount sent" required>
            <MoneyInput id="amount" name="amount" />
          </FormField>
          <FormField name="dateReceived" label="Date received" required>
            <Input id="dateReceived" name="dateReceived" type="date" defaultValue={today} max={today} />
          </FormField>
        </div>
        <FormField name="purpose" label="Purpose" required hint="What the money is for, e.g. September Office Subscriptions">
          <Input id="purpose" name="purpose" maxLength={200} />
        </FormField>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Classification</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="departmentId" label="Department">
            <Select id="departmentId" name="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField name="projectId" label="Project">
            <Select id="projectId" name="projectId" defaultValue="">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField name="expectedCompletionDate" label="Expected completion" hint="When should this be fully accounted for?">
            <Input id="expectedCompletionDate" name="expectedCompletionDate" type="date" min={today} />
          </FormField>
          <FormField name="fundingSource" label="Funding source">
            <Input id="fundingSource" name="fundingSource" placeholder="e.g. Operating account" />
          </FormField>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Transfer evidence (optional)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="transferReference" label="Bank transfer reference">
            <Input id="transferReference" name="transferReference" />
          </FormField>
          <FormField name="approvingOfficer" label="Approving officer">
            <Input id="approvingOfficer" name="approvingOfficer" />
          </FormField>
        </div>
        <FormField name="transferReceipt" label="Original transfer receipt" hint="JPG, PNG, WebP or PDF">
          <Input id="transferReceipt" name="transferReceipt" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="h-auto py-2" />
        </FormField>
        <FormField name="notes" label="Notes">
          <Textarea id="notes" name="notes" />
        </FormField>
      </section>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <SubmitButton pendingText="Creating…">Create allocation & notify staff</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditAllocationForm({
  a,
  departments,
  projects,
}: {
  a: { id: string; purpose: string; expectedCompletionDate: string | null; projectId: string | null; departmentId: string | null; notes: string | null; transferReference: string | null };
  departments: Opt[];
  projects: Opt[];
}) {
  return (
    <ActionForm action={updateAllocationAction}>
      <input type="hidden" name="allocationId" value={a.id} />
      <FormField name="purpose" label="Purpose" required>
        <Input id="purpose" name="purpose" defaultValue={a.purpose} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="departmentId" label="Department">
          <Select id="departmentId" name="departmentId" defaultValue={a.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="projectId" label="Project">
          <Select id="projectId" name="projectId" defaultValue={a.projectId ?? ""}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="expectedCompletionDate" label="Expected completion">
          <Input id="expectedCompletionDate" name="expectedCompletionDate" type="date" defaultValue={a.expectedCompletionDate ?? ""} />
        </FormField>
        <FormField name="transferReference" label="Transfer reference">
          <Input id="transferReference" name="transferReference" defaultValue={a.transferReference ?? ""} />
        </FormField>
      </div>
      <FormField name="notes" label="Notes">
        <Textarea id="notes" name="notes" defaultValue={a.notes ?? ""} />
      </FormField>
      <p className="text-xs text-gray-500">The amount cannot be edited. Use “Add funds” or an admin correction so the change is traceable.</p>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddFundingForm({ allocationId, isAdmin }: { allocationId: string; isAdmin: boolean }) {
  const [type, setType] = useState("ADDITIONAL_FUNDING");
  return (
    <ActionForm action={addFundingAction}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <FormField name="type" label="Type">
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="ADDITIONAL_FUNDING">Additional funding</option>
          <option value="TRANSFER">Transfer from another fund</option>
          {isAdmin && <option value="CORRECTION">Correction (admin)</option>}
        </Select>
      </FormField>
      <FormField name="amount" label="Amount" required hint={type === "CORRECTION" ? "Use a negative amount to reduce the allocation." : undefined}>
        <MoneyInput id="amount" name="amount" />
      </FormField>
      <FormField name="reason" label="Reason" required>
        <Textarea id="reason" name="reason" rows={2} />
      </FormField>
      <FormField name="reference" label="Transfer reference">
        <Input id="reference" name="reference" />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Add funds</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RecordReturnForm({ allocationId, unspent, today }: { allocationId: string; unspent: number; today: string }) {
  return (
    <ActionForm action={recordReturnAction}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
        Unspent balance: <span className="font-semibold">{formatMoney(unspent)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="amount" label="Amount returned" required>
          <MoneyInput id="amount" name="amount" defaultValue={koboToInput(Math.max(unspent, 0))} />
        </FormField>
        <FormField name="returnDate" label="Date" required>
          <Input id="returnDate" name="returnDate" type="date" defaultValue={today} max={today} />
        </FormField>
        <FormField name="paymentMethod" label="Method">
          <Select id="paymentMethod" name="paymentMethod" defaultValue="Bank transfer">
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="reference" label="Reference">
          <Input id="reference" name="reference" />
        </FormField>
      </div>
      <FormField name="evidence" label="Evidence" hint="Bank slip or transfer confirmation">
        <Input id="evidence" name="evidence" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="h-auto py-2" />
      </FormField>
      <FormField name="notes" label="Notes">
        <Textarea id="notes" name="notes" rows={2} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Recording…">Record return</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ReconcileForm({ allocationId, summary }: { allocationId: string; summary: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <ActionForm action={reconcileAction}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
        {summary.map((s) => (
          <div key={s.label} className="flex justify-between px-4 py-2.5">
            <dt className="text-gray-500">{s.label}</dt>
            <dd className={s.strong ? "font-semibold" : ""}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <FormField name="notes" label="Reconciliation notes">
        <Textarea id="notes" name="notes" rows={2} />
      </FormField>
      <p className="text-xs text-gray-500">Approved expenses will be locked as reconciled. This can’t be undone.</p>
      <div className="flex justify-end">
        <SubmitButton variant="success" pendingText="Reconciling…">
          Mark as reconciled
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AllocationStatusForm({ allocationId, status, label, danger }: { allocationId: string; status: "VOIDED" | "ARCHIVED" | "ACTIVE"; label: string; danger?: boolean }) {
  return (
    <ActionForm action={setAllocationStatusAction}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <input type="hidden" name="status" value={status} />
      <FormField name="reason" label="Reason" required>
        <Textarea id="reason" name="reason" rows={2} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton variant={danger ? "danger" : "primary"} pendingText="Saving…">
          {label}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ClaimForm({ allocationId, suggested, kind }: { allocationId: string; suggested: number; kind: string }) {
  const [type, setType] = useState(suggested > 0 || kind === "REIMBURSEMENT" ? "REIMBURSEMENT" : "ADDITIONAL_FUNDS");
  return (
    <ActionForm action={createClaimAction}>
      <input type="hidden" name="allocationId" value={allocationId} />
      {kind !== "REIMBURSEMENT" && (
        <FormField name="type" label="What do you need?">
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="REIMBURSEMENT">Reimbursement — I already spent more than I was given</option>
            <option value="ADDITIONAL_FUNDS">Additional funds — I need more before I spend</option>
          </Select>
        </FormField>
      )}
      {kind === "REIMBURSEMENT" && <input type="hidden" name="type" value="REIMBURSEMENT" />}
      <FormField name="amount" label="Amount" required hint={suggested > 0 ? `You're currently ${formatMoney(suggested)} over budget.` : undefined}>
        <MoneyInput id="amount" name="amount" defaultValue={suggested > 0 ? koboToInput(suggested) : ""} />
      </FormField>
      <FormField name="reason" label="Reason" required>
        <Textarea id="reason" name="reason" rows={3} placeholder="Why was the extra spending necessary?" />
      </FormField>
      <FormField name="authorizedBy" label="Authorized by" hint="Who approved the extra spending?">
        <Input id="authorizedBy" name="authorizedBy" />
      </FormField>
      <FormField name="evidence" label="Evidence of approval" required={type === "REIMBURSEMENT"} hint="Email, memo or message approving the spend">
        <Input id="evidence" name="evidence" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="h-auto py-2" />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Submitting…">Submit claim</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PersonalSpendForm({ projects, today }: { projects: Opt[]; today: string }) {
  return (
    <ActionForm action={createPersonalSpendAction}>
      <p className="text-sm text-gray-600">
        Paid for something work-related with your own money? You can also just pick “My own money” when adding an expense. A separate record is useful to group spending for one purpose (e.g. a trip). It never reduces your allocated funds; once approved, finance refunds you or settles it from funds you hold.
      </p>
      <FormField name="purpose" label="What was it for?" required>
        <Input id="purpose" name="purpose" placeholder="e.g. Emergency generator repair" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="date" label="Date">
          <Input id="date" name="date" type="date" defaultValue={today} max={today} />
        </FormField>
        <FormField name="projectId" label="Project">
          <Select id="projectId" name="projectId" defaultValue="">
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Creating…">Continue to add expenses</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SettlePersonalSpendForm({
  allocationId,
  owed,
  sources,
}: {
  allocationId: string;
  owed: number;
  /** The staff member's funded allocations that still hold unspent money. */
  sources: { id: string; label: string; available: number }[];
}) {
  const [method, setMethod] = useState<"REFUND" | "OFFSET">("REFUND");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const max = method === "OFFSET" && source ? Math.min(owed, source.available) : owed;
  return (
    <ActionForm action={settlePersonalSpendAction} key={`${method}:${sourceId}`}>
      <input type="hidden" name="allocationId" value={allocationId} />
      <input type="hidden" name="method" value={method} />
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How is it being settled?">
        {(
          [
            ["REFUND", "Refund by company", "The company pays the staff member back."],
            ["OFFSET", "From allocated funds", sources.length ? "Use unspent money they're holding — they keep it instead of returning it." : "They hold no unspent allocated funds."],
          ] as const
        ).map(([value, title, desc]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            disabled={value === "OFFSET" && !sources.length}
            onClick={() => setMethod(value)}
            className={`rounded-lg p-3 text-left text-sm ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50 ${method === value ? "bg-brand-50 ring-brand-500" : "bg-white ring-gray-200 hover:bg-gray-50"}`}
          >
            <span className="block font-medium text-gray-900">{title}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{desc}</span>
          </button>
        ))}
      </div>
      {method === "OFFSET" && (
        <FormField name="sourceAllocationId" label="Settle from" required>
          <Select id="sourceAllocationId" name="sourceAllocationId" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {formatMoney(s.available)} unspent
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <FormField name="amount" label="Amount" required hint={`Up to ${formatMoney(max)}`}>
        <MoneyInput id="amount" name="amount" defaultValue={koboToInput(max)} />
      </FormField>
      {method === "REFUND" && (
        <FormField name="reference" label="Payment reference" hint="e.g. bank transfer reference">
          <Input id="reference" name="reference" />
        </FormField>
      )}
      <FormField name="note" label="Note">
        <Textarea id="note" name="note" rows={2} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingText="Settling…">{method === "OFFSET" ? "Settle from allocated funds" : "Record refund"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
