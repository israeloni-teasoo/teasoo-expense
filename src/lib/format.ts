import type { AllocationStatus, ClaimStatus, ExpenseStatus, RequisitionStatus } from "@/db/schema";

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "purple" | "teal" | "orange";

export const EXPENSE_STATUS: Record<ExpenseStatus, { label: string; tone: Tone; staffLabel?: string }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  SUBMITTED: { label: "Submitted", tone: "blue", staffLabel: "Pending" },
  UNDER_REVIEW: { label: "Under review", tone: "purple", staffLabel: "Being reviewed" },
  NEEDS_CLARIFICATION: { label: "Awaiting staff", tone: "orange", staffLabel: "Action needed" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red", staffLabel: "Needs correction" },
  RECONCILED: { label: "Reconciled", tone: "teal" },
  VOIDED: { label: "Voided", tone: "gray" },
};

export const ALLOCATION_STATUS: Record<AllocationStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "blue" },
  RECONCILED: { label: "Reconciled", tone: "teal" },
  ARCHIVED: { label: "Archived", tone: "gray" },
  VOIDED: { label: "Voided", tone: "gray" },
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone }> = {
  SUBMITTED: { label: "Awaiting review", tone: "blue" },
  RECOMMENDED: { label: "Awaiting approval", tone: "purple" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const REQUISITION_STATUS: Record<RequisitionStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  ON_HOLD: { label: "More info needed", tone: "orange" },
  APPROVED: { label: "Approved · awaiting payment", tone: "blue" },
  REJECTED: { label: "Declined", tone: "red" },
  PROCESSED: { label: "Paid", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export const PAYMENT_METHODS = ["Bank transfer", "Cash", "Debit card", "Credit card", "POS", "Mobile money", "Cheque", "Other"];

export const ADJUSTMENT_LABELS = {
  ADDITIONAL_FUNDING: "Additional funding",
  REIMBURSEMENT: "Reimbursement",
  CORRECTION: "Correction",
  TRANSFER: "Transfer",
} as const;

export const DOCUMENT_KIND_LABELS = {
  RECEIPT: "Receipt",
  SUPPORTING: "Supporting document",
  TRANSFER_RECEIPT: "Transfer receipt",
  RETURN_EVIDENCE: "Return evidence",
  AUTHORIZATION: "Authorization evidence",
  SCREENSHOT: "Screenshot",
  QUOTE: "Quote / invoice",
  PAYMENT_PROOF: "Proof of payment",
} as const;

export function initials(first: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}
