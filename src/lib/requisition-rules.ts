/**
 * Pure rules for requisitions (purchase requests), shared by the server and the form.
 *
 * Approval chain: requester → approver (e.g. COO, or their backup) → executor (e.g. Managing
 * Partner, or their backup), who pays. Nobody approves their own request: when the approver
 * raises one it goes to the executor for approval instead.
 */

export type ApprovalSettings = {
  requisitionApproverId?: string | null;
  requisitionApproverBackupId?: string | null;
  requisitionExecutorId?: string | null;
  requisitionExecutorBackupId?: string | null;
};

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))];

/** Who may pay approved requisitions. The requester is left out when someone else can do it. */
export function executorsFor(s: ApprovalSettings, requesterId: string) {
  const all = uniq([s.requisitionExecutorId, s.requisitionExecutorBackupId]);
  const others = all.filter((id) => id !== requesterId);
  return others.length ? others : all;
}

/** Who may approve a requisition raised by `requesterId` (never the requester themselves). */
export function approversFor(s: ApprovalSettings, requesterId: string) {
  const approvers = uniq([s.requisitionApproverId, s.requisitionApproverBackupId]).filter((id) => id !== requesterId);
  if (approvers.length) return approvers;
  // The approver's own request (or no approver set): the executor approves it.
  return uniq([s.requisitionExecutorId, s.requisitionExecutorBackupId]).filter((id) => id !== requesterId);
}

/** Quantity is stored in hundredths (1.5 → 150) so it stays exact. */
export function parseQuantity(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const n = Number(String(input).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function formatQuantity(hundredths: number) {
  const n = hundredths / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** Line amount in kobo: quantity × rate − discount, never below zero. */
export function lineAmount(quantityHundredths: number, rateKobo: number, discountKobo = 0) {
  return Math.max(Math.round((quantityHundredths * rateKobo) / 100) - discountKobo, 0);
}

/** Line subtotal before discount, in kobo. */
export function lineGross(quantityHundredths: number, rateKobo: number) {
  return Math.round((quantityHundredths * rateKobo) / 100);
}

/** Requisition prefix from the organisation name: "Teasoo Consulting" → "TC", "Teasoo Logistics Ltd" → "TL". */
export function defaultRequisitionPrefix(orgName: string) {
  const skip = new Set(["LTD", "LIMITED", "PLC", "INC", "CO", "LLC", "AND", "OF", "THE"]);
  const letters = orgName
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w && !skip.has(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 4);
  return letters || "TX";
}

export function formatRequisitionReference(prefix: string, n: number) {
  return `${prefix}-PR-${String(n).padStart(5, "0")}`;
}
