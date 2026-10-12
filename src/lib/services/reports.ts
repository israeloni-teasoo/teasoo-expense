import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { allocationAdjustments, allocations, departments, documents, expenseCategories, expenses, fundReturns, memberships, projects, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { APPROVED_STATUSES, PENDING_STATUSES, personalSpendOwed, type BalanceSummary } from "@/lib/balance";
import { addDays, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listAllocations, type AllocationListItem } from "./allocations";
import { getSettings } from "./org";
import { categoryLabelSql } from "@/lib/category-label";

const SPEND_STATUSES = [...APPROVED_STATUSES, ...PENDING_STATUSES];

export type Range = { from: string | null; to: string | null };

function dateRange(col: typeof expenses.expenseDate | typeof allocations.dateReceived, r: Range): SQL[] {
  const c: SQL[] = [];
  if (r.from) c.push(gte(col, r.from));
  if (r.to) c.push(lte(col, r.to));
  return c;
}

/**
 * Totals across allocations. Personal-spend records are the staff member's own money, so they are
 * kept out of received / spent / remaining and reported separately as what is owed to staff.
 */
function totalsOf(list: AllocationListItem[]) {
  const t = { received: 0, spent: 0, approved: 0, pending: 0, remaining: 0, returned: 0, outstanding: 0, overspend: 0, personalOwed: 0, personalPending: 0, personalSpent: 0 };
  for (const a of list) {
    if (a.kind === "REIMBURSEMENT") {
      t.personalOwed += personalSpendOwed(a.balance);
      t.personalPending += a.balance.pending;
      t.personalSpent += a.balance.spent;
      continue;
    }
    t.received += a.balance.totalFunded;
    t.spent += a.balance.spent;
    t.approved += a.balance.approved;
    t.pending += a.balance.pending;
    t.remaining += a.balance.available;
    t.returned += a.balance.returned;
    t.outstanding += Math.max(a.balance.outstanding, 0);
    t.overspend += a.balance.overspend;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Staff dashboard                                                     */
/* ------------------------------------------------------------------ */

export async function staffDashboard(actor: CurrentUser) {
  const all = await listAllocations(actor, { scope: "mine", status: "all" });
  const active = all.filter((a) => a.status === "ACTIVE");
  const totals = totalsOf(active);

  const attention = await db
    .select({
      id: expenses.id,
      reference: expenses.reference,
      description: expenses.description,
      amount: expenses.amount,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      updatedAt: expenses.updatedAt,
    })
    .from(expenses)
    .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
    .where(
      and(
        eq(allocations.organisationId, actor.organisationId),
        eq(expenses.staffId, actor.id),
        inArray(expenses.status, ["REJECTED", "NEEDS_CLARIFICATION", "DRAFT"]),
      ),
    )
    .orderBy(desc(expenses.updatedAt))
    .limit(10);

  const recent = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      categoryName: categoryLabelSql,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(eq(expenseCategories.organisationId, actor.organisationId), eq(expenses.staffId, actor.id), ne(expenses.status, "VOIDED")))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(6);

  return { totals, active, attention, recent, reconciledCount: all.filter((a) => a.status === "RECONCILED").length };
}

/* ------------------------------------------------------------------ */
/* Finance dashboard                                                   */
/* ------------------------------------------------------------------ */

export async function financeDashboard(actor: CurrentUser) {
  const org = actor.organisationId;
  const today = todayISO();
  const allocs = await listAllocations(actor, { status: "all" });
  const live = allocs.filter((a) => a.status === "ACTIVE" || a.status === "RECONCILED" || a.status === "ARCHIVED");
  const active = allocs.filter((a) => a.status === "ACTIVE");
  const t = totalsOf(live);
  const activeTotals = totalsOf(active);

  const [pendingRow, rejectedRow, noReceiptRow, byCategory, byStaff, byProject, weekly, queue] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${expenses.amount}),0)` })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .where(and(eq(allocations.organisationId, org), inArray(expenses.status, ["SUBMITTED", "UNDER_REVIEW"]))),
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${expenses.amount}),0)` })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .where(and(eq(allocations.organisationId, org), eq(expenses.status, "REJECTED"))),
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${expenses.amount}),0)` })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .where(
        and(
          eq(allocations.organisationId, org),
          inArray(expenses.status, SPEND_STATUSES),
          sql`not exists (select 1 from ${documents} d where d.expense_id = ${expenses.id} and d.deleted_at is null)`,
        ),
      ),
    spendBy(org, "category", { from: null, to: null }),
    spendBy(org, "staff", { from: null, to: null }),
    spendBy(org, "project", { from: null, to: null }),
    weeklySpend(org, 8),
    db
      .select({
        id: expenses.id,
        reference: expenses.reference,
        description: expenses.description,
        amount: expenses.amount,
        status: expenses.status,
        submittedAt: expenses.submittedAt,
        overBudget: expenses.overBudget,
        staffFirst: users.firstName,
        staffLast: users.lastName,
      })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .innerJoin(users, eq(users.id, expenses.staffId))
      .where(and(eq(allocations.organisationId, org), inArray(expenses.status, ["SUBMITTED", "UNDER_REVIEW"])))
      .orderBy(asc(expenses.submittedAt))
      .limit(6),
  ]);

  const staffWithOutstanding = new Set(active.filter((a) => a.balance.outstanding > 0).map((a) => a.staffId));
  const overdue = active.filter((a) => a.overdue);
  const dueSoon = active.filter((a) => a.expectedCompletionDate && a.expectedCompletionDate >= today && a.expectedCompletionDate <= addDays(today, 7));
  const overBudget = active.filter((a) => a.balance.overBudget && a.kind === "ADVANCE");
  const ready = active.filter((a) => a.readyToReconcile);
  const reconciledPct = live.length ? Math.round((allocs.filter((a) => a.status === "RECONCILED" || a.status === "ARCHIVED").length / live.length) * 100) : 0;

  const insights = await buildInsights(actor, {
    noReceipt: { count: Number(noReceiptRow[0].count), total: Number(noReceiptRow[0].total) },
    activeOutstanding: activeTotals.outstanding,
    activeWithOutstanding: active.filter((a) => a.balance.outstanding > 0).length,
    dueSoon: dueSoon.length,
    overdue: overdue.length,
    overBudget,
  });

  return {
    metrics: {
      disbursed: t.received,
      // All spending, including staff's own money (personal spend) awaiting or after refund.
      expenses: t.spent + t.personalSpent,
      owedToStaff: activeTotals.personalOwed,
      owedToStaffPending: activeTotals.personalPending,
      pendingReview: Number(pendingRow[0].total),
      pendingCount: Number(pendingRow[0].count),
      outstanding: activeTotals.outstanding,
      activeAllocations: active.length,
      overdueCount: overdue.length,
      rejectedCount: Number(rejectedRow[0].count),
      noReceiptCount: Number(noReceiptRow[0].count),
      noReceiptTotal: Number(noReceiptRow[0].total),
      staffWithOutstanding: staffWithOutstanding.size,
      readyToReconcile: ready.length,
      reconciledPct,
    },
    charts: { byCategory, byStaff, byProject, weekly },
    queue: queue.map((q) => ({ ...q, staffName: `${q.staffFirst} ${q.staffLast}` })),
    overdue,
    ready,
    overBudget,
    insights,
  };
}

async function buildInsights(
  actor: CurrentUser,
  data: {
    noReceipt: { count: number; total: number };
    activeOutstanding: number;
    activeWithOutstanding: number;
    dueSoon: number;
    overdue: number;
    overBudget: AllocationListItem[];
  },
) {
  const settings = await getSettings(actor.organisationId);
  const insights: { tone: "amber" | "red" | "blue" | "green"; title: string; body: string; href?: string }[] = [];

  // Unusual spending: recent expenses far above their category's 90-day average.
  const recentFrom = addDays(todayISO(), -30);
  const unusual = await db.execute<{ id: string; description: string; amount: string; category: string; avg: string }>(sql`
    select e.id, e.description, e.amount, c.name as category, stats.avg
    from ${expenses} e
    join ${allocations} a on a.id = e.allocation_id
    join ${expenseCategories} c on c.id = e.category_id
    join lateral (
      select avg(x.amount) as avg, count(*) as n from ${expenses} x
      where x.category_id = e.category_id and x.id <> e.id
        and x.status in ('APPROVED','RECONCILED','SUBMITTED','UNDER_REVIEW')
        and x.expense_date between e.expense_date - 90 and e.expense_date
    ) stats on true
    where a.organisation_id = ${actor.organisationId}
      and e.status in ('SUBMITTED','UNDER_REVIEW','APPROVED')
      and e.expense_date >= ${recentFrom}
      and stats.n >= 3 and e.amount >= stats.avg * ${settings.unusualMultiplier}
    order by e.amount desc limit 3
  `);
  for (const u of unusual.rows) {
    insights.push({
      tone: "amber",
      title: "Unusual expense",
      body: `${formatMoney(Number(u.amount))} ${u.category.toLowerCase()} expense (“${u.description}”) is significantly higher than similar expenses recorded in the last 90 days (avg ${formatMoney(Math.round(Number(u.avg)))}).`,
      href: `/expenses/${u.id}`,
    });
  }
  if (data.noReceipt.count) {
    insights.push({
      tone: "amber",
      title: "Missing evidence",
      body: `${data.noReceipt.count} expense${data.noReceipt.count === 1 ? "" : "s"} worth ${formatMoney(data.noReceipt.total)} do not have receipts attached.`,
      href: `/expenses?receipt=no`,
    });
  }
  if (data.activeOutstanding > 0) {
    insights.push({
      tone: "blue",
      title: "Unused funds",
      body: `${formatMoney(data.activeOutstanding)} remains outstanding across ${data.activeWithOutstanding} staff allocation${data.activeWithOutstanding === 1 ? "" : "s"}.`,
      href: `/allocations?status=ACTIVE`,
    });
  }
  if (data.dueSoon) {
    insights.push({
      tone: "blue",
      title: "Approaching deadline",
      body: `${data.dueSoon} allocation${data.dueSoon === 1 ? " is" : "s are"} due for reconciliation within the next 7 days.`,
      href: `/reconciliation`,
    });
  }
  if (data.overdue) {
    insights.push({
      tone: "red",
      title: "Overdue allocations",
      body: `${data.overdue} allocation${data.overdue === 1 ? " is" : "s are"} past the expected completion date and not yet reconciled.`,
      href: `/allocations?overdue=1`,
    });
  }
  for (const a of data.overBudget.slice(0, 2)) {
    insights.push({
      tone: "red",
      title: "Over budget",
      body: `${a.staffName} has spent ${formatMoney(a.balance.overspend)} more than allocated on “${a.purpose}”.`,
      href: `/allocations/${a.id}`,
    });
  }
  return insights;
}

/* ------------------------------------------------------------------ */
/* Aggregations                                                        */
/* ------------------------------------------------------------------ */

export async function spendBy(orgId: string, by: "category" | "staff" | "project" | "department", range: Range, statuses = SPEND_STATUSES) {
  const where = and(eq(allocations.organisationId, orgId), inArray(expenses.status, statuses), ...dateRange(expenses.expenseDate, range));
  const total = sql<string>`coalesce(sum(${expenses.amount}),0)`;
  const count = sql<number>`count(*)::int`;
  let rows: { id: string | null; name: string | null; total: string; count: number }[];
  if (by === "category") {
    rows = await db
      .select({ id: expenseCategories.id, name: expenseCategories.name, total, count })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(where)
      .groupBy(expenseCategories.id, expenseCategories.name);
  } else if (by === "staff") {
    rows = await db
      .select({ id: users.id, name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`, total, count })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .innerJoin(users, eq(users.id, expenses.staffId))
      .where(where)
      .groupBy(users.id, users.firstName, users.lastName);
  } else if (by === "project") {
    rows = await db
      .select({ id: projects.id, name: projects.name, total, count })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .where(where)
      .groupBy(projects.id, projects.name);
  } else {
    rows = await db
      .select({ id: departments.id, name: departments.name, total, count })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .leftJoin(departments, eq(departments.id, expenses.departmentId))
      .where(where)
      .groupBy(departments.id, departments.name);
  }
  const fallback = by === "project" ? "No project" : by === "department" ? "No department" : "—";
  return rows
    .map((r) => ({ id: r.id, name: r.name ?? fallback, total: Number(r.total), count: Number(r.count) }))
    .sort((a, b) => b.total - a.total);
}

export async function weeklySpend(orgId: string, weeks: number) {
  const today = todayISO();
  const dow = new Date(today + "T00:00:00Z").getUTCDay();
  const thisMonday = addDays(today, -((dow + 6) % 7));
  const start = addDays(thisMonday, -7 * (weeks - 1));
  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${expenses.expenseDate}::timestamp), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${expenses.amount}),0)`,
    })
    .from(expenses)
    .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
    .where(and(eq(allocations.organisationId, orgId), inArray(expenses.status, SPEND_STATUSES), gte(expenses.expenseDate, start)))
    .groupBy(sql`1`);
  const map = new Map(rows.map((r) => [r.week, Number(r.total)]));
  return Array.from({ length: weeks }, (_, i) => {
    const wk = addDays(start, i * 7);
    return { week: wk, total: map.get(wk) ?? 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export type ReportKind = "expenses" | "staff" | "allocations" | "categories" | "projects" | "departments";

export const REPORT_LABELS: Record<ReportKind, string> = {
  expenses: "Expense report",
  staff: "Staff accountability",
  allocations: "Allocation report",
  categories: "Category report",
  projects: "Project report",
  departments: "Department report",
};

export async function allocationReport(actor: CurrentUser, range: Range, filters: { staffId?: string; projectId?: string; departmentId?: string; status?: string } = {}) {
  const list = await listAllocations(actor, { ...filters, status: filters.status ?? "all" });
  return list.filter(
    (a) => a.status !== "VOIDED" && (!range.from || a.dateReceived >= range.from) && (!range.to || a.dateReceived <= range.to),
  );
}

export async function staffAccountabilityReport(actor: CurrentUser, range: Range) {
  const list = await allocationReport(actor, range);
  const byStaff = new Map<string, { staffId: string; staffName: string; allocations: number; received: number; spent: number; approved: number; pending: number; returned: number; outstanding: number; overspend: number }>();
  for (const a of list) {
    const row = byStaff.get(a.staffId) ?? { staffId: a.staffId, staffName: a.staffName, allocations: 0, received: 0, spent: 0, approved: 0, pending: 0, returned: 0, outstanding: 0, overspend: 0 };
    row.allocations++;
    row.received += a.balance.totalFunded;
    row.spent += a.balance.spent;
    row.approved += a.balance.approved;
    row.pending += a.balance.pending;
    row.returned += a.balance.returned;
    row.outstanding += a.status === "ACTIVE" ? a.balance.outstanding : 0;
    row.overspend += a.balance.overspend;
    byStaff.set(a.staffId, row);
  }
  return [...byStaff.values()].sort((a, b) => b.received - a.received);
}

export async function categoryReport(actor: CurrentUser, range: Range) {
  const rows = await spendBy(actor.organisationId, "category", range);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({ ...r, share: grand ? Math.round((r.total / grand) * 1000) / 10 : 0 }));
}

export async function projectReport(actor: CurrentUser, range: Range) {
  const [projs, spend, funded] = await Promise.all([
    db.select().from(projects).where(eq(projects.organisationId, actor.organisationId)).orderBy(asc(projects.name)),
    spendBy(actor.organisationId, "project", range),
    db
      .select({
        projectId: allocations.projectId,
        initial: sql<string>`coalesce(sum(${allocations.initialAmount}),0)`,
        adjustments: sql<string>`coalesce(sum((select coalesce(sum(${allocationAdjustments.amount}),0) from ${allocationAdjustments} where ${allocationAdjustments.allocationId} = ${allocations.id})),0)`,
        returned: sql<string>`coalesce(sum((select coalesce(sum(${fundReturns.amount}),0) from ${fundReturns} where ${fundReturns.allocationId} = ${allocations.id})),0)`,
      })
      .from(allocations)
      .where(and(eq(allocations.organisationId, actor.organisationId), ne(allocations.status, "VOIDED"), ...dateRange(allocations.dateReceived, range)))
      .groupBy(allocations.projectId),
  ]);
  const spendMap = new Map(spend.map((s) => [s.id, s]));
  const fundMap = new Map(funded.map((f) => [f.projectId, Number(f.initial) + Number(f.adjustments)]));
  const returnMap = new Map(funded.map((f) => [f.projectId, Number(f.returned)]));
  const rows = projs.map((p) => {
    const expensesTotal = spendMap.get(p.id)?.total ?? 0;
    const received = fundMap.get(p.id) ?? 0;
    const budget = p.budget ?? 0;
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      budget,
      received,
      returned: returnMap.get(p.id) ?? 0,
      expenses: expensesTotal,
      transactions: spendMap.get(p.id)?.count ?? 0,
      remaining: received - expensesTotal - (returnMap.get(p.id) ?? 0),
      variance: budget ? budget - expensesTotal : 0,
      archived: p.archived,
    };
  });
  const unassigned = spendMap.get(null);
  if (unassigned || fundMap.get(null)) {
    rows.push({
      id: "none",
      name: "No project",
      code: null,
      budget: 0,
      received: fundMap.get(null) ?? 0,
      returned: returnMap.get(null) ?? 0,
      expenses: unassigned?.total ?? 0,
      transactions: unassigned?.count ?? 0,
      remaining: (fundMap.get(null) ?? 0) - (unassigned?.total ?? 0) - (returnMap.get(null) ?? 0),
      variance: 0,
      archived: false,
    });
  }
  return rows;
}

export async function departmentReport(actor: CurrentUser, range: Range) {
  const rows = await spendBy(actor.organisationId, "department", range);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({ ...r, share: grand ? Math.round((r.total / grand) * 1000) / 10 : 0 }));
}

/* ------------------------------------------------------------------ */
/* Staff directory                                                     */
/* ------------------------------------------------------------------ */

export async function staffDirectory(actor: CurrentUser) {
  const [people, allocs] = await Promise.all([
    db
      .select({ user: users, role: memberships.role, departmentId: memberships.departmentId, memberStatus: memberships.status, departmentName: departments.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(departments, eq(departments.id, memberships.departmentId))
      .where(eq(memberships.organisationId, actor.organisationId))
      .orderBy(asc(users.firstName)),
    listAllocations(actor, { status: "all" }),
  ]);
  return people.map(({ user: person, role, departmentId, memberStatus, departmentName }) => {
    // Role, department and status are per organisation.
    const user = { ...person, role, departmentId, status: memberStatus === "ACTIVE" && person.status === "ACTIVE" ? ("ACTIVE" as const) : ("SUSPENDED" as const) };
    const all = allocs.filter((a) => a.staffId === user.id && a.status !== "VOIDED");
    // Allocated funds only; personal spend (the staff member's own money) is reported as owed.
    const mine = all.filter((a) => a.kind !== "REIMBURSEMENT");
    const active = mine.filter((a) => a.status === "ACTIVE");
    const personalActive = all.filter((a) => a.kind === "REIMBURSEMENT" && a.status === "ACTIVE");
    const sum = (f: (b: BalanceSummary) => number, list = mine) => list.reduce((s, a) => s + f(a.balance), 0);
    return {
      id: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      jobTitle: user.jobTitle,
      role: user.role,
      status: user.status,
      departmentName,
      allocations: mine.length,
      activeAllocations: active.length,
      received: sum((b) => b.totalFunded),
      spent: sum((b) => b.spent),
      remaining: sum((b) => b.available, active),
      outstanding: sum((b) => Math.max(b.outstanding, 0), active),
      pending: sum((b) => b.pending, active),
      overdue: active.filter((a) => a.overdue).length,
      owedToStaff: personalActive.reduce((s, a) => s + personalSpendOwed(a.balance), 0),
      lastActivity: all.reduce<Date | null>((m, a) => (!m || a.lastActivity > m ? a.lastActivity : m), null),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export async function listDocuments(actor: CurrentUser, filters: { q?: string; kind?: string; staffId?: string; page?: number }) {
  const pageSize = 30;
  const page = Math.max(1, filters.page ?? 1);
  const conditions: SQL[] = [eq(documents.organisationId, actor.organisationId), isNull(documents.deletedAt)];
  if (!can(actor.role, "documents.viewAll")) {
    conditions.push(sql`(${expenses.staffId} = ${actor.id} or ${allocations.staffId} = ${actor.id})`);
  }
  if (filters.kind) conditions.push(sql`${documents.kind} = ${filters.kind}`);
  if (filters.staffId) conditions.push(sql`coalesce(${expenses.staffId}, ${allocations.staffId}) = ${filters.staffId}`);
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(sql`(${documents.fileName} ilike ${like} or ${expenses.description} ilike ${like} or ${expenses.reference} ilike ${like} or ${allocations.reference} ilike ${like} or ${expenses.vendor} ilike ${like})`);
  }
  const where = and(...conditions);
  const allocJoin = sql`${allocations.id} = coalesce(${expenses.allocationId}, ${documents.allocationId})`;
  const [rows, count] = await Promise.all([
    db
      .select({
        doc: documents,
        expenseRef: expenses.reference,
        expenseDescription: expenses.description,
        expenseAmount: expenses.amount,
        allocationRef: allocations.reference,
        allocationPurpose: allocations.purpose,
        allocationId: allocations.id,
        uploaderFirst: users.firstName,
        uploaderLast: users.lastName,
      })
      .from(documents)
      .leftJoin(expenses, eq(expenses.id, documents.expenseId))
      .leftJoin(allocations, allocJoin)
      .innerJoin(users, eq(users.id, documents.uploadedBy))
      .where(where)
      .orderBy(desc(documents.uploadedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .leftJoin(expenses, eq(expenses.id, documents.expenseId))
      .leftJoin(allocations, allocJoin)
      .where(where),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r.doc,
      expenseRef: r.expenseRef,
      expenseDescription: r.expenseDescription,
      expenseAmount: r.expenseAmount,
      allocationRef: r.allocationRef,
      allocationPurpose: r.allocationPurpose,
      linkedAllocationId: r.allocationId,
      uploaderName: `${r.uploaderFirst} ${r.uploaderLast}`,
    })),
    count: Number(count[0].count),
    page,
    pages: Math.max(1, Math.ceil(Number(count[0].count) / pageSize)),
  };
}
