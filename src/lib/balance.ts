import type { ExpenseStatus } from "@/db/schema";

/** Statuses that are waiting on a decision and still reserve funds. */
export const PENDING_STATUSES: ExpenseStatus[] = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_CLARIFICATION"];
/** Statuses that count as accepted spending. */
export const APPROVED_STATUSES: ExpenseStatus[] = ["APPROVED", "RECONCILED"];
/** Statuses that must be resolved before an allocation can be reconciled. */
export const UNRESOLVED_STATUSES: ExpenseStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_CLARIFICATION", "REJECTED"];
/** Statuses a staff member can still edit (submitted ones only until a reviewer picks them up). */
export const EDITABLE_STATUSES: ExpenseStatus[] = ["DRAFT", "SUBMITTED", "REJECTED", "NEEDS_CLARIFICATION"];

export type BalanceInput = {
  initialAmount: number;
  adjustments: { amount: number }[];
  expenses: { amount: number; status: ExpenseStatus }[];
  returns: { amount: number }[];
};

export type BalanceSummary = {
  initial: number;
  adjustments: number;
  /** Initial amount plus all adjustments (additional funding, reimbursements, corrections). */
  totalFunded: number;
  approved: number;
  pending: number;
  rejected: number;
  draft: number;
  /** Approved + pending. What the staff member has spent so far as far as they are concerned. */
  spent: number;
  returned: number;
  /** totalFunded − approved − pending − returned. Can be negative when over budget. */
  available: number;
  /** totalFunded − approved − returned. What must be returned (or reimbursed when negative) to close. */
  outstanding: number;
  overBudget: boolean;
  /** Amount spent beyond the funds available (0 when within budget). */
  overspend: number;
  utilisation: number;
  counts: { total: number; approved: number; pending: number; rejected: number; draft: number };
};

/**
 * Single source of truth for allocation balances. The server always derives balances
 * from the underlying records; nothing is stored or entered by hand.
 */
export function computeBalance(input: BalanceInput): BalanceSummary {
  const adjustments = input.adjustments.reduce((s, a) => s + a.amount, 0);
  const returned = input.returns.reduce((s, r) => s + r.amount, 0);
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let draft = 0;
  const counts = { total: 0, approved: 0, pending: 0, rejected: 0, draft: 0 };
  for (const e of input.expenses) {
    if (e.status === "VOIDED") continue;
    counts.total++;
    if (APPROVED_STATUSES.includes(e.status)) {
      approved += e.amount;
      counts.approved++;
    } else if (PENDING_STATUSES.includes(e.status)) {
      pending += e.amount;
      counts.pending++;
    } else if (e.status === "REJECTED") {
      rejected += e.amount;
      counts.rejected++;
    } else if (e.status === "DRAFT") {
      draft += e.amount;
      counts.draft++;
    }
  }
  const totalFunded = input.initialAmount + adjustments;
  const spent = approved + pending;
  const available = totalFunded - approved - pending - returned;
  const outstanding = totalFunded - approved - returned;
  const utilisation = totalFunded > 0 ? Math.round((spent / totalFunded) * 100) : spent > 0 ? 100 : 0;
  return {
    initial: input.initialAmount,
    adjustments,
    totalFunded,
    approved,
    pending,
    rejected,
    draft,
    spent,
    returned,
    available,
    outstanding,
    overBudget: available < 0,
    overspend: available < 0 ? -available : 0,
    utilisation,
    counts,
  };
}

export const EMPTY_BALANCE = computeBalance({ initialAmount: 0, adjustments: [], expenses: [], returns: [] });

/**
 * Personal spend (money staff paid from their own pocket) is never part of their allocated funds.
 * What the company owes them is the approved amount not yet settled (refunded or offset).
 */
export function personalSpendOwed(b: BalanceSummary) {
  return Math.max(b.approved - b.adjustments - b.returned, 0);
}
