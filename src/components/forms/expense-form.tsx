"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, FileText, ImageIcon, Paperclip, Sparkles, Upload, X } from "lucide-react";
import { ActionForm, FormField, SubmitButton, useFormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatBytes, PAYMENT_METHODS } from "@/lib/format";
import { formatMoney, koboToInput, parseMoney } from "@/lib/money";
import { suggestCategory } from "@/lib/suggest";
import { saveExpenseAction } from "@/app/actions/expenses";

export type FundOption = {
  id: string;
  reference: string;
  purpose: string;
  kind: string;
  available: number;
  totalFunded: number;
  projectId: string | null;
};

type Category = { id: string; name: string; keywords: string | null; receiptRequired: boolean };

export type ExpenseFormValues = {
  id?: string;
  allocationId?: string;
  categoryId?: string;
  projectId?: string | null;
  expenseDate: string;
  amount?: number;
  description?: string;
  vendor?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  status?: string;
  /** Amount this expense already reserves on its allocation (pending statuses). */
  reserved?: number;
};

const STEPS = ["Fund", "Details", "Evidence", "Review"] as const;

export function ExpenseForm({
  funds,
  categories,
  projects,
  initial,
  existingDocs = [],
  requireReceipt,
  maxUploadMb,
  today,
}: {
  funds: FundOption[];
  categories: Category[];
  projects: { id: string; name: string }[];
  initial: ExpenseFormValues;
  existingDocs?: { id: string; fileName: string; fileType: string; fileSize: number }[];
  requireReceipt: boolean;
  maxUploadMb: number;
  today: string;
}) {
  const editing = !!initial.id;
  const returned = initial.status === "REJECTED" || initial.status === "NEEDS_CLARIFICATION";
  return (
    <ActionForm action={saveExpenseAction} className="space-y-0">
      {initial.id && <input type="hidden" name="expenseId" value={initial.id} />}
      <Steps
        funds={funds}
        categories={categories}
        projects={projects}
        initial={initial}
        existingDocs={existingDocs}
        requireReceipt={requireReceipt}
        maxUploadMb={maxUploadMb}
        today={today}
        editing={editing}
        returned={returned}
      />
    </ActionForm>
  );
}

function Steps({
  funds,
  categories,
  projects,
  initial,
  existingDocs,
  requireReceipt,
  maxUploadMb,
  today,
  editing,
  returned,
}: {
  funds: FundOption[];
  categories: Category[];
  projects: { id: string; name: string }[];
  initial: ExpenseFormValues;
  existingDocs: { id: string; fileName: string; fileType: string; fileSize: number }[];
  requireReceipt: boolean;
  maxUploadMb: number;
  today: string;
  editing: boolean;
  returned: boolean;
}) {
  const { state } = useFormState();
  const [step, setStep] = useState(initial.allocationId ? 1 : 0);
  const [allocationId, setAllocationId] = useState(initial.allocationId ?? (funds.length === 1 ? funds[0].id : ""));
  const [amountText, setAmountText] = useState(koboToInput(initial.amount));
  const [description, setDescription] = useState(initial.description ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [categoryTouched, setCategoryTouched] = useState(!!initial.categoryId);
  const [vendor, setVendor] = useState(initial.vendor ?? "");
  const [expenseDate, setExpenseDate] = useState(initial.expenseDate);
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [receipts, setReceipts] = useState<File[]>([]);
  const [supporting, setSupporting] = useState<File[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const supportingInput = useRef<HTMLInputElement>(null);

  const fund = funds.find((f) => f.id === allocationId);
  const amount = parseMoney(amountText);
  const category = categories.find((c) => c.id === categoryId);
  const suggested = useMemo(() => (description.length > 3 ? suggestCategory(description, categories) : null), [description, categories]);
  const reserved = initial.allocationId === allocationId ? (initial.reserved ?? 0) : 0;
  const availableBefore = fund ? fund.available + reserved : 0;
  const remainingAfter = availableBefore - (amount ?? 0);
  const receiptNeeded = requireReceipt || !!category?.receiptRequired;
  const docCount = existingDocs.length + receipts.length + supporting.length;

  // Jump back to the step that has a server-side field error.
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const errorStep = fieldErrors
    ? fieldErrors.allocationId
      ? 0
      : ["amount", "categoryId", "description", "expenseDate"].some((k) => fieldErrors[k])
        ? 1
        : fieldErrors.receipts
          ? 2
          : null
    : null;
  const [lastErrorState, setLastErrorState] = useState<unknown>(null);
  if (state && errorStep != null && lastErrorState !== state) {
    setLastErrorState(state);
    setStep(errorStep);
  }

  function addFiles(list: FileList | null, kind: "receipts" | "supporting") {
    if (!list) return;
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      // Photos are downscaled in the browser before upload, so only PDFs need to fit the limit as-is.
      if (f.size > maxUploadMb * 1024 * 1024 && !/^image\//.test(f.type)) {
        setLocalError(`"${f.name}" is larger than ${maxUploadMb} MB.`);
        continue;
      }
      if (!/\.(jpe?g|png|webp|pdf)$/i.test(f.name) && !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) {
        setLocalError(`"${f.name}" is not a JPG, PNG, WebP or PDF.`);
        continue;
      }
      accepted.push(f);
    }
    if (kind === "receipts") setReceipts((r) => [...r, ...accepted]);
    else setSupporting((r) => [...r, ...accepted]);
  }

  function next() {
    setLocalError(null);
    if (step === 0 && !allocationId) return setLocalError("Choose which fund this expense is for.");
    if (step === 1) {
      if (!amount || amount <= 0) return setLocalError("Enter the amount you spent.");
      if (!description.trim()) return setLocalError("Describe what the money was spent on.");
      if (!categoryId) return setLocalError("Choose a category.");
      if (!expenseDate) return setLocalError("Enter the date of the expense.");
      if (expenseDate > today) return setLocalError("Expense date cannot be in the future.");
    }
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Files are attached to the real <input type=file> elements via DataTransfer so they post with the form.
  function sync(input: HTMLInputElement | null, files: File[]) {
    if (!input) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn("flex w-full flex-col items-start gap-1.5 text-left", i < step ? "cursor-pointer" : "cursor-default")}
            >
              <span className={cn("h-1.5 w-full rounded-full", i <= step ? "bg-brand-600" : "bg-gray-200")} />
              <span className={cn("text-xs font-medium", i === step ? "text-brand-800" : "text-gray-500")}>
                <span className="hidden sm:inline">Step {i + 1} · </span>
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {localError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {localError}
        </div>
      )}

      {/* Step 1: fund */}
      <section className={cn(step !== 0 && "hidden")}>
        <h2 className="text-lg font-semibold text-gray-900">Which fund is this expense for?</h2>
        <p className="mt-1 text-sm text-gray-500">Pick the money you were given for this purchase.</p>
        <div className="mt-4 space-y-3">
          {funds.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              You have no active funds. Ask finance to assign funds, or open a personal-spend record from My Funds.
            </p>
          )}
          {funds.map((f) => (
            <label
              key={f.id}
              className={cn(
                "flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition",
                allocationId === f.id ? "border-brand-600 ring-2 ring-brand-600/20" : "border-gray-200 hover:border-gray-300",
              )}
            >
              <input
                type="radio"
                name="allocationId"
                value={f.id}
                checked={allocationId === f.id}
                onChange={() => {
                  setAllocationId(f.id);
                  if (!projectId && f.projectId) setProjectId(f.projectId);
                }}
                className="h-4 w-4 border-gray-300 text-brand-700 focus:ring-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">{f.purpose}</span>
                <span className="block text-xs text-gray-500">{f.reference}</span>
              </span>
              <span className="text-right">
                {f.kind === "REIMBURSEMENT" ? (
                  <span className="text-xs font-medium text-violet-700">Personal spend</span>
                ) : (
                  <>
                    <span className={cn("block font-semibold tabular-nums", f.available < 0 ? "text-red-600" : "text-brand-700")}>{formatMoney(f.available)}</span>
                    <span className="block text-xs text-gray-500">remaining</span>
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Step 2: details */}
      <section className={cn("space-y-4", step !== 1 && "hidden")}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">What did you spend on?</h2>
          {fund && <p className="mt-1 text-sm text-gray-500">From {fund.purpose} · {fund.kind === "REIMBURSEMENT" ? "personal spend" : `${formatMoney(availableBefore)} available`}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="amount" label="Amount" required>
            <MoneyInput id="amount" name="amount" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </FormField>
          <FormField name="expenseDate" label="Expense date" required>
            <Input id="expenseDate" name="expenseDate" type="date" max={today} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </FormField>
        </div>
        <FormField name="description" label="Description" required hint="e.g. Adobe Creative Cloud subscription">
          <Input id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} autoComplete="off" />
        </FormField>
        <FormField name="categoryId" label="Category" required>
          <Select
            id="categoryId"
            name="categoryId"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setCategoryTouched(true);
            }}
          >
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {suggested && suggested !== categoryId && (
            <button
              type="button"
              onClick={() => {
                setCategoryId(suggested);
                setCategoryTouched(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
            >
              <Sparkles className="h-3.5 w-3.5" /> Suggested: {categories.find((c) => c.id === suggested)?.name}
              {!categoryTouched && " — tap to use"}
            </button>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="vendor" label="Vendor / paid to">
            <Input id="vendor" name="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </FormField>
          <FormField name="paymentMethod" label="Payment method">
            <Select id="paymentMethod" name="paymentMethod" defaultValue={initial.paymentMethod ?? ""}>
              <option value="">Select…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <details className="group rounded-xl border border-gray-200 bg-white" open={!!(initial.paymentReference || initial.notes || initial.projectId)}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700">
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-4 w-4 transition group-open:rotate-90" /> More details (optional)
            </span>
          </summary>
          <div className="space-y-4 border-t border-gray-100 p-4">
            <FormField name="projectId" label="Project">
              <Select id="projectId" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField name="paymentReference" label="Payment / receipt reference">
              <Input id="paymentReference" name="paymentReference" defaultValue={initial.paymentReference ?? ""} />
            </FormField>
            <FormField name="notes" label="Notes">
              <Textarea id="notes" name="notes" defaultValue={initial.notes ?? ""} />
            </FormField>
          </div>
        </details>
      </section>

      {/* Step 3: evidence */}
      <section className={cn("space-y-4", step !== 2 && "hidden")}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Upload evidence</h2>
          <p className="mt-1 text-sm text-gray-500">
            {receiptNeeded ? "A receipt is required before you can submit." : "Attach a receipt if you have one."} JPG, PNG, WebP or PDF, up to {maxUploadMb} MB each.
          </p>
        </div>

        <input ref={receiptInput} type="file" name="receipts" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="sr-only" tabIndex={-1}
          onChange={(e) => { addFiles(e.target.files, "receipts"); }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
          onChange={(e) => { addFiles(e.target.files, "receipts"); e.target.value = ""; }} />
        <input ref={supportingInput} type="file" name="supporting" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf" className="sr-only" tabIndex={-1}
          onChange={(e) => { addFiles(e.target.files, "supporting"); }} />
        {/* keep the real inputs in sync with the chosen files */}
        <FileSync input={receiptInput} files={receipts} sync={sync} />
        <FileSync input={supportingInput} files={supporting} sync={sync} />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => receiptInput.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-600 hover:border-brand-400 hover:bg-brand-50/40"
          >
            <Upload className="h-6 w-6 text-brand-600" />
            <span className="font-medium text-gray-900">+ Add receipt</span>
            <span className="text-xs text-gray-500">Choose a file</span>
          </button>
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-600 hover:border-brand-400 hover:bg-brand-50/40"
          >
            <Camera className="h-6 w-6 text-brand-600" />
            <span className="font-medium text-gray-900">Take a photo</span>
            <span className="text-xs text-gray-500">Use your phone camera</span>
          </button>
        </div>

        <FileList
          title="Receipts"
          files={receipts}
          existing={existingDocs}
          onRemove={(i) => setReceipts((r) => r.filter((_, idx) => idx !== i))}
        />
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => supportingInput.current?.click()}>
            <Paperclip className="h-4 w-4" /> Add supporting document
          </Button>
          <FileList title="Supporting documents" files={supporting} onRemove={(i) => setSupporting((r) => r.filter((_, idx) => idx !== i))} />
        </div>
        {fieldErrors?.receipts && <p className="text-sm text-red-600">{fieldErrors.receipts}</p>}
      </section>

      {/* Step 4: review */}
      <section className={cn("space-y-4", step !== 3 && "hidden")}>
        <h2 className="text-lg font-semibold text-gray-900">Review</h2>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
          {[
            ["Fund", fund?.purpose ?? "—"],
            ["Expense", amount ? formatMoney(amount) : "—"],
            ["Date", expenseDate],
            ["Category", category?.name ?? "—"],
            ["Description", description || "—"],
            ["Vendor", vendor || "—"],
            ["Evidence", docCount ? `${docCount} file${docCount === 1 ? "" : "s"}` : "No receipt attached"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3">
              <span className="text-gray-500">{k}</span>
              <span className={cn("text-right font-medium text-gray-900", k === "Evidence" && !docCount && receiptNeeded && "text-red-600")}>{v}</span>
            </div>
          ))}
          {fund && fund.kind !== "REIMBURSEMENT" && (
            <div className={cn("flex justify-between gap-4 px-4 py-3", remainingAfter < 0 ? "bg-red-50" : "bg-brand-50")}>
              <span className={remainingAfter < 0 ? "text-red-800" : "text-brand-900"}>{remainingAfter < 0 ? "Over budget by" : "Remaining after this expense"}</span>
              <span className={cn("font-semibold tabular-nums", remainingAfter < 0 ? "text-red-700" : "text-brand-800")}>{formatMoney(Math.abs(remainingAfter))}</span>
            </div>
          )}
        </div>
        {fund && fund.kind !== "REIMBURSEMENT" && remainingAfter < 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This expense goes beyond the funds you were given. It will be flagged as over budget — log a claim with evidence of approval to be reimbursed.
          </p>
        )}
        {receiptNeeded && !docCount && <p className="text-xs text-red-600">Add a receipt before submitting, or save this as a draft.</p>}
        {returned && (
          <FormField name="comment" label="Note to the reviewer" hint="Explain what you corrected or answer their question.">
            <Textarea id="comment" name="comment" rows={2} />
          </FormField>
        )}
      </section>

      {/* Navigation */}
      <div className="sticky bottom-16 z-10 -mx-4 mt-6 flex items-center gap-2 border-t border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 lg:bottom-0">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {step < 3 ? (
            <>
              {step >= 1 && (
                <SubmitButton variant="ghost" name="intent" value="draft" className="hidden sm:inline-flex">
                  Save draft
                </SubmitButton>
              )}
              <Button type="button" onClick={next}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <SubmitButton variant="secondary" name="intent" value="draft" pendingText="Saving…">
                Save draft
              </SubmitButton>
              <SubmitButton name="intent" value="submit" pendingText="Submitting…">
                <Check className="h-4 w-4" /> {editing && returned ? "Resubmit" : "Submit expense"}
              </SubmitButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FileSync({ input, files, sync }: { input: React.RefObject<HTMLInputElement | null>; files: File[]; sync: (i: HTMLInputElement | null, f: File[]) => void }) {
  // Keep the posted files equal to the visible list.
  useEffect(() => sync(input.current, files), [input, files, sync]);
  return null;
}

function FileList({
  title,
  files,
  existing = [],
  onRemove,
}: {
  title: string;
  files: File[];
  existing?: { id: string; fileName: string; fileType: string; fileSize: number }[];
  onRemove: (i: number) => void;
}) {
  if (!files.length && !existing.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-2">
        {existing.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            {d.fileType === "application/pdf" ? <FileText className="h-4 w-4 text-gray-400" /> : <ImageIcon className="h-4 w-4 text-gray-400" />}
            <span className="min-w-0 flex-1 truncate">{d.fileName}</span>
            <span className="text-xs text-gray-500">already attached</span>
          </li>
        ))}
        {files.map((f, i) => (
          <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            {f.type === "application/pdf" ? <FileText className="h-4 w-4 text-gray-400" /> : <ImageIcon className="h-4 w-4 text-gray-400" />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-xs text-gray-500">{formatBytes(f.size)}</span>
            <button type="button" onClick={() => onRemove(i)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Remove ${f.name}`}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
