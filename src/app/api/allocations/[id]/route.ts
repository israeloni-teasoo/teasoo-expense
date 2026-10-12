import { api, nairaString } from "@/lib/api";
import { getAllocationDetail } from "@/lib/services/allocations";

/** GET /api/allocations/:id — the allocation, its balance, expenses, adjustments, returns and timeline. */
export const GET = api(async (user, _req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const d = await getAllocationDetail(user, id);
  return {
    allocation: { ...d.allocation, initialAmount: nairaString(d.allocation.initialAmount) },
    staff: d.staff,
    balance: d.balance,
    readyToReconcile: d.readyToReconcile,
    expenses: d.expenses.map((e) => ({ id: e.id, reference: e.reference, date: e.expenseDate, description: e.description, category: e.categoryName, amount: nairaString(e.amount), status: e.status, documents: e.docCount })),
    adjustments: d.adjustments.map((a) => ({ type: a.type, amount: nairaString(a.amount), reason: a.reason, createdAt: a.createdAt, by: a.byName })),
    returns: d.returns.map((r) => ({ amount: nairaString(r.amount), date: r.returnDate, method: r.paymentMethod, reference: r.reference, by: r.byName })),
    activity: d.activity.map((a) => ({ at: a.createdAt, by: a.userName, action: a.action, summary: a.summary })),
  };
});
