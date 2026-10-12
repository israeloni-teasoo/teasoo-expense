/**
 * When must an expense have a receipt before it can be submitted?
 * - Personal spend (staff paid from their own pocket and want to be reimbursed): always.
 * - Funded expenses (money finance gave them): optional by default — staff can submit now and
 *   add the receipt later, and finance can request it during review. An administrator can make
 *   receipts compulsory for categories marked "receipt required" in Settings.
 */
export function receiptRequired(p: { allocationKind: string | undefined; orgRequiresReceipts: boolean; categoryRequiresReceipt: boolean }) {
  if (p.allocationKind === "REIMBURSEMENT") return true;
  return p.orgRequiresReceipts && p.categoryRequiresReceipt;
}
