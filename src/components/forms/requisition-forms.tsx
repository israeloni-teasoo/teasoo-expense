"use client";

import { useMemo, useState } from "react";
import { Check, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Modal, ModalButton } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatBytes, PAYMENT_METHODS } from "@/lib/format";
import { formatMoney, koboToInput, parseMoney } from "@/lib/money";
import { formatQuantity, lineAmount, lineGross, parseQuantity } from "@/lib/requisition-rules";
import {
  processRequisitionAction,
  requisitionStepAction,
  saveRequisitionAction,
  saveRequisitionApproversAction,
  saveVendorAction,
  type SavedVendor,
} from "@/app/actions/requisitions";

type Category = { id: string; name: string; isOther?: boolean };
type Opt = { id: string; name: string };

type ItemState = {
  key: number;
  itemName: string;
  categoryId: string;
  categoryOther: string;
  description: string;
  vendorId: string;
  quantity: string;
  rate: string;
  discount: string;
};

export type RequisitionFormValues = {
  id?: string;
  status?: string;
  title?: string;
  expectedDate?: string;
  deliveryAddress?: string | null;
  externalReference?: string | null;
  notesToApprover?: string | null;
  projectId?: string | null;
  items?: { itemName: string; categoryId: string | null; categoryOther: string | null; description: string | null; vendorId: string | null; quantity: number; rate: number; discount: number }[];
};

let itemKey = 1;
const blankItem = (): ItemState => ({ key: itemKey++, itemName: "", categoryId: "", categoryOther: "", description: "", vendorId: "", quantity: "1", rate: "", discount: "" });

/** Create or edit a requisition: header details, line items (with saved vendors) and quotes. */
export function RequisitionForm({
  initial,
  categories,
  vendors: initialVendors,
  projects,
  today,
  approverNames,
}: {
  initial: RequisitionFormValues;
  categories: Category[];
  vendors: SavedVendor[];
  projects: Opt[];
  today: string;
  /** Who it will go to, shown next to the submit button. */
  approverNames: string[];
}) {
  const [vendors, setVendors] = useState(initialVendors);
  const [vendorFor, setVendorFor] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<File[]>([]);
  const [items, setItems] = useState<ItemState[]>(() =>
    initial.items?.length
      ? initial.items.map((i) => ({
          key: itemKey++,
          itemName: i.itemName,
          categoryId: i.categoryId ?? "",
          categoryOther: i.categoryOther ?? "",
          description: i.description ?? "",
          vendorId: i.vendorId ?? "",
          quantity: formatQuantity(i.quantity),
          rate: koboToInput(i.rate),
          discount: i.discount ? koboToInput(i.discount) : "",
        }))
      : [blankItem()],
  );
  const ordered = useMemo(() => [...categories.filter((c) => !c.isOther), ...categories.filter((c) => c.isOther)], [categories]);
  const amounts = items.map((i) => lineAmount(parseQuantity(i.quantity) ?? 0, parseMoney(i.rate) ?? 0, parseMoney(i.discount) ?? 0));
  const total = amounts.reduce((s, a) => s + a, 0);
  const update = (key: number, patch: Partial<ItemState>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const onHold = initial.status === "ON_HOLD";
  const payload = JSON.stringify(
    items.map((i) => ({ itemName: i.itemName, categoryId: i.categoryId, categoryOther: i.categoryOther, description: i.description, vendorId: i.vendorId, quantity: i.quantity, rate: i.rate, discount: i.discount })),
  );

  return (
    <>
      <ActionForm action={saveRequisitionAction} className="space-y-6">
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="items" value={payload} />
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="title" label="What is this for?" required className="sm:col-span-2" hint="e.g. Bird cages for the T4L nursery">
              <Input id="title" name="title" defaultValue={initial.title} maxLength={200} autoComplete="off" />
            </FormField>
            <FormField name="expectedDate" label="Needed by" required>
              <Input id="expectedDate" name="expectedDate" type="date" min={initial.id ? undefined : today} defaultValue={initial.expectedDate ?? ""} />
            </FormField>
            <FormField name="externalReference" label="Reference" hint="Quote or invoice number, if any">
              <Input id="externalReference" name="externalReference" defaultValue={initial.externalReference ?? ""} autoComplete="off" />
            </FormField>
            {projects.length > 0 && (
              <FormField name="projectId" label="Project">
                <Select id="projectId" name="projectId" defaultValue={initial.projectId ?? ""}>
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField name="deliveryAddress" label="Delivery address" className={projects.length ? "" : "sm:col-span-2"}>
              <Textarea id="deliveryAddress" name="deliveryAddress" rows={2} defaultValue={initial.deliveryAddress ?? ""} />
            </FormField>
            <FormField name="notesToApprover" label="Notes to approver" className="sm:col-span-2">
              <Textarea id="notesToApprover" name="notesToApprover" rows={2} defaultValue={initial.notesToApprover ?? ""} autoComplete="off" />
            </FormField>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Items</h2>
            <p className="text-xs text-gray-500">Estimated prices — the approver sees the total</p>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const vendor = vendors.find((v) => v.id === item.vendorId);
              const gross = lineGross(parseQuantity(item.quantity) ?? 0, parseMoney(item.rate) ?? 0);
              return (
                <fieldset key={item.key} data-testid="req-item" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <legend className="text-sm font-semibold text-gray-900">Item {i + 1}</legend>
                    <button
                      type="button"
                      onClick={() => setItems((all) => (all.length === 1 ? [blankItem()] : all.filter((x) => x.key !== item.key)))}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove item ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-12">
                    <label className="sm:col-span-5">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Item name <span className="text-red-500">*</span></span>
                      <Input value={item.itemName} onChange={(e) => update(item.key, { itemName: e.target.value })} aria-label={`Item ${i + 1} name`} autoComplete="off" />
                    </label>
                    <label className="sm:col-span-4">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Category <span className="text-red-500">*</span></span>
                      <Select value={item.categoryId} onChange={(e) => update(item.key, { categoryId: e.target.value })} aria-label={`Item ${i + 1} category`}>
                        <option value="">Choose…</option>
                        {ordered.map((c) => (
                          <option key={c.id} value={c.id}>{c.isOther ? `${c.name} (not listed)` : c.name}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="sm:col-span-3">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Vendor</span>
                      <Select
                        value={item.vendorId}
                        onChange={(e) => (e.target.value === "__new__" ? setVendorFor(item.key) : update(item.key, { vendorId: e.target.value }))}
                        aria-label={`Item ${i + 1} vendor`}
                      >
                        <option value="">—</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                        <option value="__new__">+ Add a new vendor…</option>
                      </Select>
                    </label>
                    {cat?.isOther && (
                      <label className="sm:col-span-12">
                        <span className="mb-1 block text-xs font-medium text-gray-600">What category is it? <span className="text-red-500">*</span></span>
                        <Input value={item.categoryOther} maxLength={60} onChange={(e) => update(item.key, { categoryOther: e.target.value })} aria-label={`Item ${i + 1} typed category`} autoComplete="off" />
                      </label>
                    )}
                    {vendor && (vendor.accountNumber || vendor.bankName) && (
                      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:col-span-12">
                        Pay to <span className="font-medium text-gray-900">{vendor.accountName || vendor.name}</span>
                        {vendor.accountNumber ? ` · ${vendor.accountNumber}` : ""}
                        {vendor.bankName ? ` · ${vendor.bankName}` : ""}
                      </p>
                    )}
                    <label className="sm:col-span-12">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Description</span>
                      <Input value={item.description} onChange={(e) => update(item.key, { description: e.target.value })} aria-label={`Item ${i + 1} description`} autoComplete="off" />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Quantity <span className="text-red-500">*</span></span>
                      <Input inputMode="decimal" value={item.quantity} onChange={(e) => update(item.key, { quantity: e.target.value })} aria-label={`Item ${i + 1} quantity`} autoComplete="off" />
                    </label>
                    <label className="sm:col-span-4">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Estimated price (each) <span className="text-red-500">*</span></span>
                      <MoneyInput value={item.rate} onChange={(e) => update(item.key, { rate: e.target.value })} aria-label={`Item ${i + 1} price`} />
                    </label>
                    <label className="sm:col-span-3">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Discount</span>
                      <MoneyInput value={item.discount} onChange={(e) => update(item.key, { discount: e.target.value })} aria-label={`Item ${i + 1} discount`} />
                    </label>
                    <div className="sm:col-span-3">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Amount</span>
                      <p className={cn("flex h-10 items-center justify-end rounded-lg bg-brand-50 px-3 text-sm font-semibold tabular-nums text-brand-900", (parseMoney(item.discount) ?? 0) > gross && "bg-red-50 text-red-700")}>
                        {formatMoney(amounts[i])}
                      </p>
                    </div>
                  </div>
                </fieldset>
              );
            })}
          </div>
          <Button type="button" variant="secondary" className="mt-3 w-full border-dashed" onClick={() => setItems((all) => [...all, blankItem()])}>
            <Plus className="h-4 w-4" /> Add another item
          </Button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-gray-900">Quotes, invoices or other documents</p>
          <p className="mb-2 text-xs text-gray-500">Optional. JPG, PNG, WebP or PDF.</p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
            <Paperclip className="h-4 w-4" /> Attach files
            <input
              type="file"
              name="quotes"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
              className="sr-only"
              data-testid="req-quotes"
              onChange={(e) => setQuotes(Array.from(e.target.files ?? []))}
            />
          </label>
          {quotes.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {quotes.map((f, i) => (
                <li key={i}>{f.name} · {formatBytes(f.size)}</li>
              ))}
            </ul>
          )}
        </div>

        {onHold && (
          <FormField name="comment" label="Reply to the approver" hint="Explain what you changed or answer their question.">
            <Textarea id="comment" name="comment" rows={2} />
          </FormField>
        )}

        <div className="sticky bottom-16 z-20 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">Total ({items.length} {items.length === 1 ? "item" : "items"})</p>
              <p className="text-lg font-semibold tabular-nums text-gray-900" data-testid="req-total">{formatMoney(total)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {approverNames.length > 0 && <span className="hidden text-xs text-gray-500 md:inline">Goes to {approverNames.join(" or ")}</span>}
              <SubmitButton variant="secondary" name="intent" value="draft" pendingText="Saving…">
                Save draft
              </SubmitButton>
              <SubmitButton name="intent" value="submit" pendingText="Submitting…">
                <Send className="h-4 w-4" /> {onHold ? "Resubmit" : "Submit for approval"}
              </SubmitButton>
            </div>
          </div>
        </div>
      </ActionForm>

      <Modal open={vendorFor !== null} onClose={() => setVendorFor(null)} title="Add a vendor" description="Saved for future requisitions too.">
        <VendorForm
          onSaved={(v) => {
            setVendors((all) => [...all, v].sort((a, b) => a.name.localeCompare(b.name)));
            if (vendorFor !== null) update(vendorFor, { vendorId: v.id });
            setVendorFor(null);
          }}
        />
      </Modal>
    </>
  );
}

export function VendorForm({
  vendor,
  onSaved,
  canArchive,
}: {
  vendor?: { id: string; name: string; accountName: string | null; accountNumber: string | null; bankName: string | null; email: string | null; phone: string | null; notes: string | null; archived: boolean };
  onSaved?: (v: SavedVendor) => void;
  canArchive?: boolean;
}) {
  return (
    <ActionForm
      action={saveVendorAction}
      resetOnSuccess={!vendor}
      onSuccess={(r) => {
        if (r.ok && r.data) onSaved?.(r.data as SavedVendor);
      }}
    >
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      <FormField name="name" label="Vendor name" required>
        <Input id="vendor-name" name="name" defaultValue={vendor?.name} autoComplete="off" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="accountName" label="Account name">
          <Input id="accountName" name="accountName" defaultValue={vendor?.accountName ?? ""} autoComplete="off" />
        </FormField>
        <FormField name="accountNumber" label="Account number">
          <Input id="accountNumber" name="accountNumber" inputMode="numeric" defaultValue={vendor?.accountNumber ?? ""} autoComplete="off" />
        </FormField>
        <FormField name="bankName" label="Bank">
          <Input id="bankName" name="bankName" defaultValue={vendor?.bankName ?? ""} autoComplete="off" />
        </FormField>
        <FormField name="phone" label="Phone">
          <Input id="vendor-phone" name="phone" type="tel" defaultValue={vendor?.phone ?? ""} autoComplete="off" />
        </FormField>
        <FormField name="email" label="Email" className="sm:col-span-2">
          <Input id="vendor-email" name="email" type="email" defaultValue={vendor?.email ?? ""} autoComplete="off" />
        </FormField>
      </div>
      <FormField name="notes" label="Notes">
        <Textarea id="vendor-notes" name="notes" rows={2} defaultValue={vendor?.notes ?? ""} />
      </FormField>
      {vendor && canArchive && <Checkbox name="archived" defaultChecked={vendor.archived} label="Archived" description="Hidden when choosing a vendor; past requisitions keep it." />}
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">{vendor ? "Save vendor" : "Add vendor"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

const STEP_COPY = {
  APPROVE: { label: "Approve", variant: "success", comment: "Note (optional)", required: false, description: "It goes to the person who pays." },
  REJECT: { label: "Decline", variant: "danger", comment: "Reason for declining", required: true, description: "The requester sees your reason." },
  HOLD: { label: "Ask for more info", variant: "secondary", comment: "What do you need?", required: true, description: "It goes back to the requester to update and resubmit." },
  cancel: { label: "Cancel requisition", variant: "ghost", comment: "Reason (optional)", required: false, description: "This can't be undone." },
  recall: { label: "Recall to edit", variant: "secondary", comment: null, required: false, description: "It comes back to you as a draft; submit it again when you're done." },
} as const;

/** A confirm-with-comment step: approve, decline, ask for info, cancel or recall. */
export function RequisitionStep({ id, step }: { id: string; step: keyof typeof STEP_COPY }) {
  const c = STEP_COPY[step];
  return (
    <ModalButton label={c.label} size="sm" variant={c.variant} title={c.label} description={c.description} modalSize="sm">
      <ActionForm action={requisitionStepAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="step" value={step} />
        {c.comment && (
          <FormField name="comment" label={c.comment} required={c.required}>
            <Textarea id={`comment-${step}`} name="comment" rows={3} />
          </FormField>
        )}
        <div className="flex justify-end">
          <SubmitButton variant={c.variant === "ghost" ? "danger" : c.variant} pendingText="Saving…">
            {c.label}
          </SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}

/** The person who pays records the payment (and optionally funds the requester instead). */
export function ProcessRequisitionForm({ id, total, requesterName, today }: { id: string; total: number; requesterName: string; today: string }) {
  const [payTo, setPayTo] = useState<"VENDOR" | "REQUESTER">("VENDOR");
  return (
    <ActionForm action={processRequisitionAction}>
      <input type="hidden" name="id" value={id} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-gray-900">Who was paid?</legend>
        {(
          [
            ["VENDOR", "The vendor(s) directly", "Pay the bank details on the items."],
            ["REQUESTER", `${requesterName}`, `They receive ${formatMoney(total)} as an allocation and account for it with receipts.`],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 text-sm", payTo === value ? "border-brand-600 bg-brand-50" : "border-gray-200")}>
            <input type="radio" name="payTo" value={value} checked={payTo === value} onChange={() => setPayTo(value)} className="mt-0.5" />
            <span>
              <span className="block font-medium text-gray-900">{label}</span>
              <span className="block text-xs text-gray-500">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="paymentDate" label="Payment date" required>
          <Input id="paymentDate" name="paymentDate" type="date" max={today} defaultValue={today} />
        </FormField>
        <FormField name="paymentMethod" label="Payment method">
          <Select id="paymentMethod" name="paymentMethod" defaultValue="Bank transfer">
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </FormField>
        <FormField name="paymentReference" label="Transfer / payment reference" className="sm:col-span-2">
          <Input id="paymentReference" name="paymentReference" autoComplete="off" />
        </FormField>
      </div>
      <FormField name="proof" label="Proof of payment" hint="Transfer receipt or screenshot (optional)">
        <input id="proof" name="proof" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-800" />
      </FormField>
      <FormField name="notes" label="Note (optional)">
        <Textarea id="pay-notes" name="notes" rows={2} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton variant="success" pendingText="Recording…">
          <Check className="h-4 w-4" /> Record payment of {formatMoney(total)}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RequisitionCommentForm({ id }: { id: string }) {
  return (
    <ActionForm action={requisitionStepAction} resetOnSuccess>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="step" value="comment" />
      <FormField name="comment" label="Add a comment">
        <Textarea id="req-comment" name="comment" rows={2} placeholder="Ask a question or add context…" />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-700">
          <Paperclip className="h-4 w-4" /> Attach
          <input type="file" name="files" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="sr-only" />
        </label>
        <SubmitButton size="sm" variant="secondary" pendingText="Posting…">
          Post comment
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RequisitionApproversForm({
  members,
  values,
  numbering,
}: {
  members: { id: string; name: string; role: string }[];
  values: { approverId?: string | null; approverBackupId?: string | null; executorId?: string | null; executorBackupId?: string | null };
  numbering: { prefix: string; nextNumber: number };
}) {
  const [prefix, setPrefix] = useState(numbering.prefix);
  const [next, setNext] = useState(String(numbering.nextNumber));
  const preview = `${(prefix || numbering.prefix).toUpperCase()}-PR-${String(Number(next) || numbering.nextNumber).padStart(5, "0")}`;
  const select = (name: keyof typeof values, label: string, hint: string, required?: boolean) => (
    <FormField name={name} label={label} hint={hint} required={required}>
      <Select id={name} name={name} defaultValue={values[name] ?? ""}>
        <option value="">{required ? "Choose…" : "None"}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
        ))}
      </Select>
    </FormField>
  );
  return (
    <ActionForm action={saveRequisitionApproversAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        {select("approverId", "Approver (e.g. COO)", "Approves, declines or asks for more information.", true)}
        {select("approverBackupId", "Backup approver", "Can also approve, e.g. when the approver is away.")}
        {select("executorId", "Pays approved requisitions (e.g. Managing Partner)", "Records the payment. Also approves the approver's own requisitions.", true)}
        {select("executorBackupId", "Backup payer", "Can also record payments.")}
      </div>
      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium text-gray-900">Numbering</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="prefix" label="Prefix" hint="e.g. TC for Teasoo Consulting">
            <Input id="prefix" name="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6} autoComplete="off" />
          </FormField>
          <FormField name="nextNumber" label="Next number" hint="Continue from your last Zoho number">
            <Input id="nextNumber" name="nextNumber" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
          </FormField>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Next requisition</p>
            <p className="flex h-10 items-center rounded-lg bg-gray-50 px-3 font-mono text-sm font-semibold text-gray-900" data-testid="req-number-preview">{preview}</p>
          </div>
        </div>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save requisition settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
