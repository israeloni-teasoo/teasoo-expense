"use client";

import { useState } from "react";
import { Ban, Check, HelpCircle, Send, X } from "lucide-react";
import { ActionForm, FormField, SubmitButton } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/form";
import { ModalButton } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { commentExpenseAction, reviewExpenseAction, submitDraftAction, voidExpenseAction } from "@/app/actions/expenses";

export function ReviewPanel({ expenseId, status, next }: { expenseId: string; status: string; next?: string }) {
  const [mode, setMode] = useState<"APPROVE" | "REJECT" | "CLARIFY">("APPROVE");
  const options = [
    { key: "APPROVE", label: "Approve", icon: Check, tone: "text-emerald-700 ring-emerald-300 bg-emerald-50" },
    { key: "CLARIFY", label: "Ask a question", icon: HelpCircle, tone: "text-orange-700 ring-orange-300 bg-orange-50" },
    { key: "REJECT", label: "Reject", icon: X, tone: "text-red-700 ring-red-300 bg-red-50" },
  ] as const;
  return (
    <div className="space-y-4">
      {status === "SUBMITTED" && (
        <ActionForm action={reviewExpenseAction} className="space-y-0">
          <input type="hidden" name="expenseId" value={expenseId} />
          <input type="hidden" name="decision" value="START" />
          <SubmitButton variant="ghost" size="sm" className="-ml-2 text-gray-600">
            Mark as under review
          </SubmitButton>
        </ActionForm>
      )}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Decision">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={mode === o.key}
            onClick={() => setMode(o.key)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium ring-1 ring-inset transition",
              mode === o.key ? o.tone : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50",
            )}
          >
            <o.icon className="h-4 w-4" />
            {o.label}
          </button>
        ))}
      </div>
      <ActionForm action={reviewExpenseAction} key={mode}>
        <input type="hidden" name="expenseId" value={expenseId} />
        <input type="hidden" name="decision" value={mode} />
        {next && <input type="hidden" name="next" value={next} />}
        <FormField
          name="comment"
          label={mode === "APPROVE" ? "Comment (optional)" : mode === "REJECT" ? "Reason for rejection" : "Your question"}
          required={mode !== "APPROVE"}
          hint={mode === "REJECT" ? "The staff member will see this and can correct and resubmit." : undefined}
        >
          <Textarea id="comment" name="comment" rows={3} placeholder={mode === "CLARIFY" ? "e.g. Which client was this printing for?" : undefined} />
        </FormField>
        <SubmitButton
          className="w-full"
          variant={mode === "APPROVE" ? "success" : mode === "REJECT" ? "danger" : "primary"}
          pendingText="Saving…"
        >
          {mode === "APPROVE" ? "Approve expense" : mode === "REJECT" ? "Reject expense" : "Send question"}
        </SubmitButton>
      </ActionForm>
    </div>
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

