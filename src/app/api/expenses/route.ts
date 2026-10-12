import { api, apiMoney, jsonBody, nairaString, os, s } from "@/lib/api";
import { listExpenses, parseExpenseFilters, saveExpense } from "@/lib/services/expenses";

/** GET /api/expenses — same filters as the Expenses screen (q, staff, category, status, from, to, min, max, receipt…). */
export const GET = api(async (user, req) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = parseExpenseFilters(sp);
  f.pageSize = Math.min(Number(sp.pageSize ?? 50) || 50, 500);
  const r = await listExpenses(user, f);
  return {
    data: r.rows.map((e) => ({
      id: e.id,
      reference: e.reference,
      allocationId: e.allocationId,
      allocation: e.allocationRef,
      staff: { id: e.staffId, name: e.staffName },
      date: e.expenseDate,
      category: e.categoryName,
      project: e.projectName,
      description: e.description,
      vendor: e.vendor,
      paymentMethod: e.paymentMethod,
      amount: nairaString(e.amount),
      amountKobo: e.amount,
      currency: e.currency,
      status: e.status,
      overBudget: e.overBudget,
      hasReceipt: e.hasReceipt,
    })),
    count: r.count,
    total: nairaString(r.total),
    page: r.page,
    pages: r.pages,
  };
});

/**
 * POST /api/expenses
 * { allocationId, categoryId, amount, expenseDate, vendor, description, paymentMethod?, submit?, confirmDuplicate?, confirmOverBudget? }
 * Authenticates → verifies the allocation belongs to the user → checks its status → validates →
 * calculates the available balance → creates the expense → audits → returns the updated balance.
 * Receipts are attached through the web app (multipart upload).
 */
export const POST = api(async (user, req) => {
  const b = await jsonBody(req);
  const { expense, balance } = await saveExpense(
    user,
    null,
    {
      allocationId: s(b.allocationId),
      categoryId: s(b.categoryId),
      projectId: os(b.projectId),
      expenseDate: s(b.expenseDate),
      amount: apiMoney(b.amount),
      description: s(b.description),
      vendor: os(b.vendor),
      paymentMethod: os(b.paymentMethod),
      paymentReference: os(b.reference),
      notes: os(b.notes),
    },
    { receipts: [], supporting: [] },
    { submit: b.submit === true, confirmDuplicate: b.confirmDuplicate === true, confirmOverBudget: b.confirmOverBudget === true },
  );
  return Response.json(
    {
      id: expense.id,
      reference: expense.reference,
      status: expense.status,
      balance: { available: nairaString(balance.available), pending: nairaString(balance.pending), approved: nairaString(balance.approved), overBudget: balance.overBudget },
    },
    { status: 201 },
  );
}, "funds.own");
