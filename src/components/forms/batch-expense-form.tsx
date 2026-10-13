"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, CheckCircle2, Copy, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { compressImage } from "@/lib/compress-image";
import { formatBytes, PAYMENT_METHODS } from "@/lib/format";
import { formatMoney, parseMoney } from "@/lib/money";
import { DEFAULT_PERSONAL_SPEND_PURPOSE, PERSONAL_SPEND_CHOICE } from "@/lib/personal-spend";
import { receiptRequired } from "@/lib/receipt-rules";
import { suggestCategory } from "@/lib/suggest";
import { saveExpenseAction } from "@/app/actions/expenses";
import type { FundOption } from "./expense-form";

type Category = { id: string; name: string; keywords: string | null; receiptRequired: boolean; isOther?: boolean };

type Row = {
  key: number;
  allocationId: string;
  expenseDate: string;
  amount: string;
  description: string;
  categoryId: string;
  categoryTouched: boolean;
  categoryOther: string;
  vendor: string;
  paymentMethod: string;
  files: File[];
  state: "editing" | "saving" | "saved" | "error" | "confirm";
  error?: string;
  fieldErrors?: Record<string, string>;
  warning?: { kind: string; message: string };
  confirmed: string[];
  saved?: { id: string; reference: string; submitted: boolean };
};

let nextKey = 1;
function blankRow(from?: Partial<Row>): Row {
  return {
    key: nextKey++,
    allocationId: from?.allocationId ?? "",
    expenseDate: from?.expenseDate ?? "",
    amount: "",
    description: "",
    categoryId: "",
    categoryTouched: false,
    categoryOther: "",
    vendor: "",
    paymentMethod: from?.paymentMethod ?? "",
    files: [],
    state: "editing",
    confirmed: [],
  };
}

/**
 * Log several expenses in one go: each row is its own expense (with its own fund, category and
 * receipts). Rows are saved one request at a time so large receipts never hit the upload limit,
 * and a row that needs attention stays on the page while the others are saved.
 */
export function BatchExpenseForm({
  funds,
  categories,
  requireReceipt,
  maxUploadMb,
  today,
  initialAllocationId,
}: {
  funds: FundOption[];
  categories: Category[];
  requireReceipt: boolean;
  maxUploadMb: number;
  today: string;
  initialAllocationId?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<"submit" | "draft" | null>(null);
  const defaultFund = initialAllocationId ?? (funds.filter((f) => f.kind !== "REIMBURSEMENT").length === 1 ? funds.find((f) => f.kind !== "REIMBURSEMENT")!.id : "");
  const [rows, setRows] = useState<Row[]>(() => [blankRow({ allocationId: defaultFund, expenseDate: today }), blankRow({ allocationId: defaultFund, expenseDate: today })]);

  const fundedOptions = funds.filter((f) => f.kind !== "REIMBURSEMENT");
  const personalOptions: FundOption[] = funds.filter((f) => f.kind === "REIMBURSEMENT");
  if (!personalOptions.some((f) => f.purpose === DEFAULT_PERSONAL_SPEND_PURPOSE)) {
    personalOptions.unshift({ id: PERSONAL_SPEND_CHOICE, reference: "", purpose: "My own money (personal spend)", kind: "REIMBURSEMENT", available: 0, totalFunded: 0, projectId: null });
  }
  const allFunds = [...fundedOptions, ...personalOptions];
  const fundOf = (id: string) => allFunds.find((f) => f.id === id);
  const orderedCategories = useMemo(() => [...categories.filter((c) => !c.isOther), ...categories.filter((c) => c.isOther)], [categories]);
  const suggestable = useMemo(() => categories.filter((c) => !c.isOther), [categories]);

  const open = rows.filter((r) => r.state !== "saved");
  const saved = rows.filter((r) => r.state === "saved");
  const total = open.reduce((s, r) => s + (parseMoney(r.amount) ?? 0), 0);

  // Allocated funds only: what's left after the expenses still on the page.
  const fundImpact = fundedOptions
    .map((f) => {
      const used = open.filter((r) => r.allocationId === f.id).reduce((s, r) => s + (parseMoney(r.amount) ?? 0), 0);
      return { fund: f, used, after: f.available - used };
    })
    .filter((x) => x.used > 0);

  function update(key: number, patch: Partial<Row>) {
    setRows((all) =>
      all.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Editing a row that had a problem puts it back to normal.
        if (r.state === "error" || r.state === "confirm") Object.assign(next, { state: "editing", error: undefined, fieldErrors: undefined, warning: undefined });
        return next;
      }),
    );
  }

  function addRow(copyFrom?: Row) {
    const last = copyFrom ?? rows[rows.length - 1];
    const row = blankRow({ allocationId: last?.allocationId ?? defaultFund, expenseDate: last?.expenseDate || today, paymentMethod: last?.paymentMethod });
    if (copyFrom) Object.assign(row, { amount: copyFrom.amount, description: copyFrom.description, categoryId: copyFrom.categoryId, categoryTouched: copyFrom.categoryTouched, categoryOther: copyFrom.categoryOther, vendor: copyFrom.vendor });
    setRows((all) => [...all, row]);
    setTimeout(() => document.getElementById(`row-${row.key}-amount`)?.focus(), 50);
  }

  function removeRow(key: number) {
    setRows((all) => (all.length === 1 ? [blankRow({ allocationId: defaultFund, expenseDate: today })] : all.filter((r) => r.key !== key)));
  }

  function problemsFor(r: Row, submitting: boolean): string | null {
    const amount = parseMoney(r.amount);
    if (!r.allocationId) return "Choose which fund this expense is for.";
    if (!amount || amount <= 0) return "Enter the amount you spent.";
    if (!r.description.trim()) return "Describe what the money was spent on.";
    if (!r.categoryId) return "Choose a category.";
    const cat = categories.find((c) => c.id === r.categoryId);
    if (cat?.isOther && !r.categoryOther.trim()) return "Type the category for this expense.";
    if (!r.expenseDate) return "Enter the date of the expense.";
    if (r.expenseDate > today) return "Expense date cannot be in the future.";
    const tooBig = r.files.find((f) => f.size > maxUploadMb * 1024 * 1024);
    if (tooBig) return `"${tooBig.name}" is larger than ${maxUploadMb} MB.`;
    if (submitting && r.files.length === 0) {
      const fund = fundOf(r.allocationId);
      if (receiptRequired({ allocationKind: fund?.kind, orgRequiresReceipts: requireReceipt, categoryRequiresReceipt: !!cat?.receiptRequired }))
        return fund?.kind === "REIMBURSEMENT" ? "Personal spend needs a receipt. Attach one, or save as a draft." : `A receipt is required for ${cat?.name}. Attach one, or save as a draft.`;
    }
    return null;
  }

  async function saveRow(r: Row, submit: boolean, confirmed: string[]): Promise<Row> {
    const fd = new FormData();
    fd.set("allocationId", r.allocationId);
    fd.set("categoryId", r.categoryId);
    if (r.categoryOther.trim()) fd.set("categoryOther", r.categoryOther.trim());
    fd.set("expenseDate", r.expenseDate);
    fd.set("amount", r.amount);
    fd.set("description", r.description.trim());
    if (r.vendor.trim()) fd.set("vendor", r.vendor.trim());
    if (r.paymentMethod) fd.set("paymentMethod", r.paymentMethod);
    fd.set("intent", submit ? "submit" : "draft");
    fd.set("stay", "1");
    for (const k of confirmed) fd.set(`confirm_${k}`, "1");
    for (const f of r.files) fd.append("receipts", await compressImage(f));
    try {
      const res = await saveExpenseAction(null, fd);
      if (res.ok) return { ...r, state: "saved", confirmed, saved: { id: res.data!.id, reference: res.data!.reference, submitted: submit } };
      if (res.warning) return { ...r, state: "confirm", warning: res.warning, confirmed, error: undefined };
      return { ...r, state: "error", error: res.error, fieldErrors: res.fieldErrors, confirmed };
    } catch {
      return { ...r, state: "error", error: "Couldn't reach the server. Check your connection and try again.", confirmed };
    }
  }

  function saveAll(submit: boolean, only?: { key: number; confirm: string }) {
    setIntent(submit ? "submit" : "draft");
    startTransition(async () => {
      let targets = rows.filter((r) => r.state !== "saved");
      if (only) targets = targets.filter((r) => r.key === only.key);
      // Check everything first so nothing is half-saved because of a typo further down.
      let invalid = 0;
      const checked = rows.map((r) => {
        if (!targets.includes(r)) return r;
        const problem = problemsFor(r, submit);
        if (problem) invalid++;
        return problem ? { ...r, state: "error" as const, error: problem, fieldErrors: undefined } : r;
      });
      setRows(checked);
      if (invalid) {
        toast(`${invalid} ${invalid === 1 ? "expense needs" : "expenses need"} attention before saving.`, "error");
        return;
      }
      let ok = 0;
      let attention = 0;
      for (const r of targets) {
        setRows((all) => all.map((x) => (x.key === r.key ? { ...x, state: "saving" } : x)));
        const confirmed = only ? [...new Set([...r.confirmed, only.confirm])] : r.confirmed;
        const result = await saveRow(r, submit, confirmed);
        if (result.state === "saved") ok++;
        else attention++;
        setRows((all) => all.map((x) => (x.key === r.key ? result : x)));
      }
      if (ok && !attention) toast(`${ok} ${ok === 1 ? "expense" : "expenses"} ${submit ? "submitted for review" : "saved as drafts"}.`);
      else if (attention) toast(`${ok} saved. ${attention} ${attention === 1 ? "needs" : "need"} your attention — see below.`, "error");
    });
  }

  if (!open.length && saved.length) {
    const submitted = saved.filter((r) => r.saved?.submitted).length;
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" data-testid="batch-done">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-900">
              {saved.length} {saved.length === 1 ? "expense" : "expenses"} saved
              {submitted ? ` · ${submitted} submitted for review` : ""}
              {saved.length - submitted ? ` · ${saved.length - submitted} draft${saved.length - submitted === 1 ? "" : "s"}` : ""}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {saved.map((r) => (
                <li key={r.key} className="flex justify-between gap-3">
                  <Link href={`/expenses/${r.saved!.id}`} className="truncate text-emerald-900 underline-offset-2 hover:underline">
                    {r.saved!.reference} · {r.description}
                  </Link>
                  <span className="shrink-0 font-medium text-emerald-900">{formatMoney(parseMoney(r.amount) ?? 0)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/expenses" className={buttonClasses("primary", "sm")}>View my expenses</Link>
              <Button size="sm" variant="secondary" onClick={() => setRows([blankRow({ allocationId: saved[saved.length - 1].allocationId, expenseDate: today })])}>
                Log more
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {saved.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Saved: {saved.map((r) => r.saved!.reference).join(", ")}</p>
          <p className="text-emerald-800">Fix the {open.length === 1 ? "expense" : "expenses"} below and save again.</p>
        </div>
      )}

      {open.map((r, i) => {
        const cat = categories.find((c) => c.id === r.categoryId);
        const fund = fundOf(r.allocationId);
        const busy = r.state === "saving";
        const suggested = !r.categoryTouched && r.description.length > 3 ? suggestCategory(r.description, suggestable) : null;
        return (
          <fieldset
            key={r.key}
            disabled={pending}
            data-testid="batch-row"
            className={cn(
              "rounded-xl border bg-white p-4 shadow-sm sm:p-5",
              r.state === "error" ? "border-red-300" : r.state === "confirm" ? "border-amber-300" : "border-gray-200",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">
                Expense {i + 1}
                {busy && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-brand-600" />}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => addRow(r)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Duplicate expense ${i + 1}`} title="Duplicate">
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeRow(r.key)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove expense ${i + 1}`} title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {r.state === "error" && r.error && (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r.error}
              </p>
            )}
            {r.state === "confirm" && r.warning && (
              <div role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r.warning.message}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveAll(intent !== "draft", { key: r.key, confirm: r.warning!.kind })} loading={busy}>
                    Yes, save it
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => update(r.key, {})}>
                    Edit instead
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-6">
              <label className="sm:col-span-3">
                <span className="mb-1 block text-xs font-medium text-gray-600">Fund</span>
                <Select value={r.allocationId} onChange={(e) => update(r.key, { allocationId: e.target.value })} aria-label={`Fund for expense ${i + 1}`} invalid={!!r.fieldErrors?.allocationId}>
                  <option value="">Choose a fund…</option>
                  {fundedOptions.length > 0 && (
                    <optgroup label="Allocated funds">
                      {fundedOptions.map((f) => (
                        <option key={f.id} value={f.id}>{f.purpose} · {formatMoney(f.available)} left</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="My own money">
                    {personalOptions.map((f) => (
                      <option key={f.id} value={f.id}>{f.purpose}</option>
                    ))}
                  </optgroup>
                </Select>
              </label>
              <label className="sm:col-span-1">
                <span className="mb-1 block text-xs font-medium text-gray-600">Date</span>
                <Input type="date" max={today} value={r.expenseDate} onChange={(e) => update(r.key, { expenseDate: e.target.value })} aria-label={`Date of expense ${i + 1}`} invalid={!!r.fieldErrors?.expenseDate} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-600">Amount (₦)</span>
                <MoneyInput id={`row-${r.key}-amount`} value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} aria-label={`Amount of expense ${i + 1}`} invalid={!!r.fieldErrors?.amount} />
              </label>
              <label className="sm:col-span-4">
                <span className="mb-1 block text-xs font-medium text-gray-600">Description</span>
                <Input
                  value={r.description}
                  maxLength={300}
                  autoComplete="off"
                  placeholder="What was it for?"
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  onBlur={() => {
                    if (!r.categoryId && suggested) update(r.key, { categoryId: suggested });
                  }}
                  aria-label={`Description of expense ${i + 1}`}
                  invalid={!!r.fieldErrors?.description}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-600">Category</span>
                <Select
                  value={r.categoryId}
                  onChange={(e) => update(r.key, { categoryId: e.target.value, categoryTouched: true })}
                  aria-label={`Category of expense ${i + 1}`}
                  invalid={!!r.fieldErrors?.categoryId}
                >
                  <option value="">Choose…</option>
                  {orderedCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.isOther ? `${c.name} (not listed)` : c.name}</option>
                  ))}
                </Select>
              </label>
              {cat?.isOther && (
                <label className="sm:col-span-6">
                  <span className="mb-1 block text-xs font-medium text-gray-600">What category is it?</span>
                  <Input
                    value={r.categoryOther}
                    maxLength={60}
                    autoComplete="off"
                    placeholder="e.g. Gifts, Medical, Visa fees"
                    onChange={(e) => update(r.key, { categoryOther: e.target.value })}
                    aria-label={`Typed category of expense ${i + 1}`}
                    invalid={!!r.fieldErrors?.categoryOther}
                  />
                </label>
              )}
              <label className="sm:col-span-3">
                <span className="mb-1 block text-xs font-medium text-gray-600">Vendor / paid to</span>
                <Input value={r.vendor} onChange={(e) => update(r.key, { vendor: e.target.value })} aria-label={`Vendor of expense ${i + 1}`} />
              </label>
              <label className="sm:col-span-3">
                <span className="mb-1 block text-xs font-medium text-gray-600">Payment method</span>
                <Select value={r.paymentMethod} onChange={(e) => update(r.key, { paymentMethod: e.target.value })} aria-label={`Payment method of expense ${i + 1}`}>
                  <option value="">Select…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </label>
            </div>

            <ReceiptPicker
              files={r.files}
              index={i}
              onChange={(files) => update(r.key, { files })}
              hint={
                fund?.kind === "REIMBURSEMENT"
                  ? "Receipt required for personal spend"
                  : receiptRequired({ allocationKind: fund?.kind, orgRequiresReceipts: requireReceipt, categoryRequiresReceipt: !!cat?.receiptRequired })
                    ? "Receipt required to submit"
                    : "Optional — you can add it later"
              }
            />
          </fieldset>
        );
      })}

      <Button type="button" variant="secondary" className="w-full border-dashed" onClick={() => addRow()} disabled={pending}>
        <Plus className="h-4 w-4" /> Add another expense
      </Button>

      {fundImpact.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          {fundImpact.map(({ fund, used, after }) => (
            <p key={fund.id} className="flex flex-wrap justify-between gap-x-3">
              <span className="text-gray-600">{fund.purpose}: {formatMoney(used)} of {formatMoney(fund.available)}</span>
              <span className={cn("font-medium", after < 0 ? "text-red-700" : "text-gray-900")}>
                {after < 0 ? `Over by ${formatMoney(-after)}` : `${formatMoney(after)} left after these`}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:rounded-xl lg:border lg:px-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{open.length}</span> {open.length === 1 ? "expense" : "expenses"} ·{" "}
            <span className="font-semibold text-gray-900" data-testid="batch-total">{formatMoney(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => saveAll(false)} loading={pending && intent === "draft"} disabled={pending}>
              Save all as drafts
            </Button>
            <Button type="button" onClick={() => saveAll(true)} loading={pending && intent === "submit"} disabled={pending}>
              Submit all ({open.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptPicker({ files, onChange, hint, index }: { files: File[]; onChange: (files: File[]) => void; hint: string; index: number }) {
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (list?.length) onChange([...files, ...Array.from(list)]);
  };
  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => pick.current?.click()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
          <Paperclip className="h-4 w-4" /> Attach receipt
        </button>
        <button type="button" onClick={() => camera.current?.click()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:hidden">
          <Camera className="h-4 w-4" /> Take photo
        </button>
        <span className="text-xs text-gray-500">{hint}</span>
      </div>
      <input
        ref={pick}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Receipt for expense ${index + 1}`}
        data-testid="batch-receipt"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-xs text-gray-700">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-gray-400">{formatBytes(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-gray-200" aria-label={`Remove ${f.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
