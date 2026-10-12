import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { allocationAdjustments, allocations, expenses, fundReturns, type ExpenseStatus } from "@/db/schema";
import { computeBalance, type BalanceSummary } from "@/lib/balance";

/**
 * Compute balances for many allocations with three grouped queries.
 * All arithmetic happens server-side on integer kobo values.
 */
export async function loadBalances(allocationIds: string[], exec: Executor = db): Promise<Map<string, BalanceSummary>> {
  const result = new Map<string, BalanceSummary>();
  if (!allocationIds.length) return result;
  const ids = [...new Set(allocationIds)];

  const [allocs, expenseRows, adjustmentRows, returnRows] = await Promise.all([
    exec.select({ id: allocations.id, initialAmount: allocations.initialAmount }).from(allocations).where(inArray(allocations.id, ids)),
    exec
      .select({
        allocationId: expenses.allocationId,
        status: expenses.status,
        total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(inArray(expenses.allocationId, ids))
      .groupBy(expenses.allocationId, expenses.status),
    exec
      .select({ allocationId: allocationAdjustments.allocationId, total: sql<string>`coalesce(sum(${allocationAdjustments.amount}), 0)` })
      .from(allocationAdjustments)
      .where(inArray(allocationAdjustments.allocationId, ids))
      .groupBy(allocationAdjustments.allocationId),
    exec
      .select({ allocationId: fundReturns.allocationId, total: sql<string>`coalesce(sum(${fundReturns.amount}), 0)` })
      .from(fundReturns)
      .where(inArray(fundReturns.allocationId, ids))
      .groupBy(fundReturns.allocationId),
  ]);

  const expMap = new Map<string, { amount: number; status: ExpenseStatus; count: number }[]>();
  for (const r of expenseRows) {
    const list = expMap.get(r.allocationId) ?? [];
    list.push({ amount: Number(r.total), status: r.status, count: Number(r.count) });
    expMap.set(r.allocationId, list);
  }
  const adjMap = new Map(adjustmentRows.map((r) => [r.allocationId, Number(r.total)]));
  const retMap = new Map(returnRows.map((r) => [r.allocationId, Number(r.total)]));

  for (const a of allocs) {
    const grouped = expMap.get(a.id) ?? [];
    const summary = computeBalance({
      initialAmount: a.initialAmount,
      adjustments: [{ amount: adjMap.get(a.id) ?? 0 }],
      returns: [{ amount: retMap.get(a.id) ?? 0 }],
      expenses: grouped.map((g) => ({ amount: g.amount, status: g.status })),
    });
    // computeBalance counts groups; replace with real row counts.
    const counts = { total: 0, approved: 0, pending: 0, rejected: 0, draft: 0 };
    for (const g of grouped) {
      if (g.status === "VOIDED") continue;
      counts.total += g.count;
      if (g.status === "APPROVED" || g.status === "RECONCILED") counts.approved += g.count;
      else if (g.status === "REJECTED") counts.rejected += g.count;
      else if (g.status === "DRAFT") counts.draft += g.count;
      else counts.pending += g.count;
    }
    result.set(a.id, { ...summary, counts });
  }
  return result;
}

export async function loadBalance(allocationId: string, exec: Executor = db): Promise<BalanceSummary> {
  const map = await loadBalances([allocationId], exec);
  const b = map.get(allocationId);
  if (!b) throw new Error("Allocation not found");
  return b;
}
