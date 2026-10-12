import { api, jsonBody, os, s } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { reviewExpense } from "@/lib/services/expenses";

const DECISIONS = { APPROVED: "APPROVE", REJECTED: "REJECT", REQUEST_CLARIFICATION: "CLARIFY", UNDER_REVIEW: "START" } as const;

/** POST /api/reviews { expenseId, action: APPROVED | REJECTED | REQUEST_CLARIFICATION | UNDER_REVIEW, comment? } */
export const POST = api(async (user, req) => {
  const b = await jsonBody(req);
  const decision = DECISIONS[s(b.action) as keyof typeof DECISIONS];
  if (!decision) throw new DomainError("action must be APPROVED, REJECTED, REQUEST_CLARIFICATION or UNDER_REVIEW.", "VALIDATION");
  await reviewExpense(user, s(b.expenseId), decision, os(b.comment));
  return { ok: true };
}, "expenses.review");
