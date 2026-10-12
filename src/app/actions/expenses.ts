"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth/current";
import { type ActionResult, toActionError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { filesFrom } from "@/lib/storage";
import {
  addExpenseComment,
  addExpenseDocuments,
  addReviewNote,
  bulkApprove,
  removeDocument,
  reviewExpense,
  saveExpense,
  submitDraft,
  voidExpense,
  type ExpenseInput,
} from "@/lib/services/expenses";
import { bool, money, opt, str } from "./_helpers";

type Prev = ActionResult<unknown> | null;

function readExpense(fd: FormData): ExpenseInput {
  return {
    allocationId: str(fd, "allocationId"),
    categoryId: str(fd, "categoryId"),
    projectId: opt(fd, "projectId"),
    expenseDate: str(fd, "expenseDate"),
    amount: money(fd, "amount"),
    description: str(fd, "description"),
    vendor: opt(fd, "vendor"),
    paymentMethod: opt(fd, "paymentMethod"),
    paymentReference: opt(fd, "paymentReference"),
    notes: opt(fd, "notes"),
  };
}

export async function saveExpenseAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("funds.own");
    const id = opt(fd, "expenseId");
    const submit = str(fd, "intent") === "submit";
    const { expense, balance } = await saveExpense(
      actor,
      id,
      readExpense(fd),
      { receipts: filesFrom(fd, "receipts"), supporting: filesFrom(fd, "supporting") },
      { submit, confirmDuplicate: bool(fd, "confirm_DUPLICATE"), confirmOverBudget: bool(fd, "confirm_OVER_BUDGET"), comment: opt(fd, "comment") },
    );
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: submit
        ? `Expense submitted for review. ${balance.available >= 0 ? `${formatMoney(balance.available)} remaining.` : `Over budget by ${formatMoney(-balance.available)}.`}`
        : "Draft saved.",
      redirectTo: `/expenses/${expense.id}`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitDraftAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("funds.own");
    const id = str(fd, "expenseId");
    await submitDraft(actor, id, { confirmDuplicate: bool(fd, "confirm_DUPLICATE"), confirmOverBudget: bool(fd, "confirm_OVER_BUDGET") });
    revalidatePath("/", "layout");
    return { ok: true, message: "Expense submitted for review." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reviewExpenseAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("expenses.review");
    const decision = str(fd, "decision") as "START" | "APPROVE" | "REJECT" | "CLARIFY" | "EVIDENCE";
    await reviewExpense(actor, str(fd, "expenseId"), decision, opt(fd, "comment"));
    revalidatePath("/", "layout");
    const messages = { START: "Marked as under review.", APPROVE: "Expense approved.", REJECT: "Expense rejected — the staff member has been notified.", CLARIFY: "Question sent to the staff member.", EVIDENCE: "Evidence requested — the staff member has been notified." };
    const next = opt(fd, "next");
    return { ok: true, message: messages[decision], redirectTo: next ?? undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function bulkApproveAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("expenses.review");
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    if (!ids.length) return { ok: false, error: "Select at least one expense." };
    const r = await bulkApprove(actor, ids);
    revalidatePath("/", "layout");
    return { ok: true, message: `${r.approved} expense(s) approved${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function voidExpenseAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await voidExpense(actor, str(fd, "expenseId"), str(fd, "reason"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Expense voided. The record is kept in the audit trail." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function commentExpenseAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await addExpenseComment(actor, str(fd, "expenseId"), str(fd, "comment"));
    revalidatePath(`/expenses/${str(fd, "expenseId")}`);
    return { ok: true, message: "Comment added." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadExpenseDocsAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const kind = str(fd, "kind") === "SUPPORTING" ? "supporting" : "receipts";
    const files = filesFrom(fd, "files");
    const r = await addExpenseDocuments(actor, str(fd, "expenseId"), { receipts: kind === "receipts" ? files : [], supporting: kind === "supporting" ? files : [] });
    revalidatePath("/", "layout");
    return { ok: true, message: r.resubmitted ? "Evidence uploaded — your expense is back with finance for review." : `${files.length} file(s) uploaded.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeDocumentAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await removeDocument(actor, str(fd, "documentId"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Document removed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function noteExpenseAction(_: Prev, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor("expenses.review");
    const internal = bool(fd, "internal");
    await addReviewNote(actor, str(fd, "expenseId"), str(fd, "comment"), internal);
    revalidatePath(`/expenses/${str(fd, "expenseId")}`);
    return { ok: true, message: internal ? "Internal note added." : "Note added — the staff member has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}
