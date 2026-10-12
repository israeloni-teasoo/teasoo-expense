import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { allocations, organisations } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { FINANCE_ROLES, notifyRoles, notifyUsers } from "@/lib/notify";

/**
 * Time-based notifications (overdue allocations). Runs lazily when someone loads the app,
 * at most once an hour per organisation. Swap for a cron job in production if preferred.
 */
export async function runSweep(orgId: string) {
  const claimed = await db
    .update(organisations)
    .set({ lastSweepAt: new Date() })
    .where(and(eq(organisations.id, orgId), or(isNull(organisations.lastSweepAt), lt(organisations.lastSweepAt, sql`now() - interval '1 hour'`))))
    .returning({ id: organisations.id });
  if (!claimed.length) return;

  const today = todayISO();
  const overdue = await db
    .select()
    .from(allocations)
    .where(and(eq(allocations.organisationId, orgId), eq(allocations.status, "ACTIVE"), lt(allocations.expectedCompletionDate, today)));
  for (const a of overdue) {
    await notifyUsers(db, [a.staffId], {
      organisationId: orgId,
      type: "ALLOCATION_OVERDUE",
      title: `${a.purpose} is overdue`,
      body: `Expected completion was ${a.expectedCompletionDate}. Log any remaining expenses and arrange to return unspent funds.`,
      link: `/allocations/${a.id}`,
      dedupeKey: `overdue:${a.id}`,
    });
    await notifyRoles(db, orgId, FINANCE_ROLES, {
      type: "ALLOCATION_OVERDUE",
      title: `${a.reference} is overdue for reconciliation`,
      body: a.purpose,
      link: `/allocations/${a.id}`,
      dedupeKey: `overdue:${a.id}`,
    });
  }
}
