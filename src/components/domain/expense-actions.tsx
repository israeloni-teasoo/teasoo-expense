"use client";

import { useState } from "react";
import { Ban, Check, FileWarning, HelpCircle, Send, StickyNote, X } from "lucide-react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { commentExpenseAction, noteExpenseAction, reviewExpenseAction, submitDraftAction, voidExpenseAction } from "@/app/actions/expenses";

type Mode = "APPROVE" | "EVIDENCE" | "CLARIFY" | "REJECT" | "NOTE";

const MODES: { key: Mode; label: string; icon: typeof Check; tone: string }[] = [
  { key: "APPROVE", label: "Approve", icon: Check, tone: "text-emerald-700 ring-emerald-300 bg-emerald-50" },
  { key: "EVIDENCE", label: "Request evidence", icon: FileWarning, tone: "text-orange-700 ring-orange-300 bg-orange-50" },
  { key: "CLARIFY", label: "Ask a question", icon: HelpCircle, tone: "text-orange-700 ring-orange-300 bg-orange-50" },
  { key: "REJECT", label: "Reject", icon: X, tone: "text-red-700 ring-red-300 bg-red-50" },
  { key: "NOTE", label: "Add note", icon: StickyNote, tone: "text-violet-700 ring-violet-300 bg-violet-50" },
];

export function ReviewPanel({ expenseId, status, next, hasEvidence }: { expenseId: string; status: string; next?: string; hasEvidence?: boolean }) {
  const [mode, setMode] = useState<Mode>(hasEvidence === false ? "EVIDENCE" : "APPROVE");
  const copy: Record<Mode, { label: string; hint?: string; placeholder?: string; required: boolean; button: string }> = {
    APPROVE: { label: "Note (optional)", required: false, button: "Approve expense" },
    EVIDENCE: {
      label: "Message to the staff member",
      hint: "The expense goes back to them. When they upload the receipt it returns to this queue automatically.",
      placeholder: "Please upload the receipt or other evidence for this expense.",
      required: false,
      button: "Request evidence",
    },
    CLARIFY: { label: "Your question", placeholder: "e.g. Which client was this printing for?", required: true, button: "Send question" },
    REJECT: { label: "Reason for rejection", hint: "The staff member will see this and can correct and resubmit.", required: true, button: "Reject expense" },
    NOTE: { label: "Note", hint: "Doesn't change the status — use it for the reason behind a decision or a follow-up action.", required: true, button: "Add note" },
  };
  const c = copy[mode];
  return (
    <div className="space-y-4">
      {hasEvidence === false && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No receipt is attached to this expense.
        </p>
      )}
      {status === "SUBMITTED" && (
        <ActionForm action={reviewExpenseAction} className="space-y-0">
          <input type="hidden" name="expenseId" value={expenseId} />
          <input type="hidden" name="decision" value="START" />
          <SubmitButton variant="ghost" size="sm" className="-ml-2 text-gray-600">
            Mark as under review
          </SubmitButton>
        </ActionForm>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Decision">
        {MODES.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={mode === o.key}
            onClick={() => setMode(o.key)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center text-xs font-medium ring-1 ring-inset transition",
              mode === o.key ? o.tone : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50",
            )}
          >
            <o.icon className="h-4 w-4" />
            {o.label}
          </button>
        ))}
      </div>
      <ActionForm action={mode === "NOTE" ? noteExpenseAction : reviewExpenseAction} key={mode} resetOnSuccess={mode === "NOTE"}>
        <input type="hidden" name="expenseId" value={expenseId} />
        <input type="hidden" name="decision" value={mode} />
        {next && mode !== "NOTE" && <input type="hidden" name="next" value={next} />}
        <FormField name="comment" label={c.label} required={c.required} hint={c.hint}>
          <Textarea id="comment" name="comment" rows={3} placeholder={c.placeholder} />
        </FormField>
        {mode === "NOTE" && <Checkbox name="internal" label="Internal — visible to finance only" description="Leave unticked to show the note to the staff member and notify them." />}
        <SubmitButton
          className="w-full"
          variant={mode === "APPROVE" ? "success" : mode === "REJECT" ? "danger" : "primary"}
          pendingText="Saving…"
        >
          {c.button}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

/** Notes on expenses that are no longer awaiting review (approved, rejected, reconciled…). */
export function NoteForm({ expenseId }: { expenseId: string }) {
  return (
    <ActionForm action={noteExpenseAction} resetOnSuccess>
      <input type="hidden" name="expenseId" value={expenseId} />
      <FormField name="comment" label="Note" required>
        <Textarea id="comment" name="comment" rows={3} />
      </FormField>
      <Checkbox name="internal" label="Internal — visible to finance only" description="Leave unticked to show the note to the staff member and notify them." />
      <SubmitButton pendingText="Saving…">Add note</SubmitButton>
    </ActionForm>
  );
}

export function VoidExpenseButton({ expenseId, own }: { expenseId: string; own: boolean }) {
  return (
    <ModalButton
      label={own ? "Discard" : "Void"}
      icon={<Ban className="h-4 w-4" />}
      variant="ghost"
      size="sm"
      className="text-red-600 hover:bg-red-50"
      title={own ? "Discard this expense?" : "Void this expense?"}
      description="Financial records are never deleted. The expense is marked as voided and stays in the audit trail."
      modalSize="sm"
    >
      <ActionForm action={voidExpenseAction}>
        <input type="hidden" name="expenseId" value={expenseId} />
        <FormField name="reason" label="Reason" required>
          <Textarea id="reason" name="reason" rows={2} placeholder="e.g. Duplicate entry" />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton variant="danger" pendingText="Voiding…">
            {own ? "Discard expense" : "Void expense"}
          </SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}

export function SubmitDraftButton({ expenseId }: { expenseId: string }) {
  return (
    <ActionForm action={submitDraftAction} className="space-y-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <SubmitButton pendingText="Submitting…">
        <Send className="h-4 w-4" /> Submit for review
      </SubmitButton>
    </ActionForm>
  );
}

export function CommentForm({ expenseId }: { expenseId: string }) {
  return (
    <ActionForm action={commentExpenseAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <Textarea name="comment" rows={2} placeholder="Add a comment…" aria-label="Comment" />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="secondary" pendingText="Posting…">
          Comment
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

