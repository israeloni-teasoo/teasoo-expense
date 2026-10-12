import "server-only";
import { aliasedTable, and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/db";
import {
  allocationAdjustments,
  allocations,
  auditLogs,
  claims,
  departments,
  documents,
  expenseCategories,
  expenses,
  fundReturns,
  projects,
  reconciliations,
  users,
  type AdjustmentType,
  type Allocation,
  type AllocationStatus,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit, diff } from "@/lib/audit";
import { UNRESOLVED_STATUSES, type BalanceSummary } from "@/lib/balance";
import { todayISO, isISODate } from "@/lib/dates";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { FINANCE_ROLES, notifyRoles, notifyUsers } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { nextReference } from "@/lib/refs";
import { storeUpload } from "@/lib/storage";
import { loadBalance, loadBalances } from "./balances";
import { getSettings } from "./org";

export function canViewAllocation(actor: CurrentUser, allocation: Pick<Allocation, "staffId">) {
  return allocation.staffId === actor.id || can(actor.role, "allocations.viewAll");
}

/** Locks the allocation row for the rest of the transaction so balance checks cannot race. */
export async function lockAllocation(tx: Executor, id: string) {
  const rows = await tx.select().from(allocations).where(eq(allocations.id, id)).for("update");
  if (!rows[0]) throw notFound("Allocation not found.");
  return rows[0];
}

export type AllocationFilters = {
  q?: string;
  staffId?: string;
  departmentId?: string;
  projectId?: string;
  status?: string;
  overdue?: boolean;
  scope?: "mine" | "all";
};

export type AllocationListItem = Awaited<ReturnType<typeof listAllocations>>[number];

export async function listAllocations(actor: CurrentUser, filters: AllocationFilters = {}) {
  const conditions: SQL[] = [eq(allocations.organisationId, actor.organisationId)];
  if (filters.scope === "mine" || !can(actor.role, "allocations.viewAll")) conditions.push(eq(allocations.staffId, actor.id));
  if (filters.staffId) conditions.push(eq(allocations.staffId, filters.staffId));
  if (filters.departmentId) conditions.push(eq(allocations.departmentId, filters.departmentId));
  if (filters.projectId) conditions.push(eq(allocations.projectId, filters.projectId));
  if (filters.status && filters.status !== "all") conditions.push(eq(allocations.status, filters.status as AllocationStatus));
  else if (!filters.status) conditions.push(inArray(allocations.status, ["ACTIVE", "RECONCILED"]));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(allocations.purpose, like),
        ilike(allocations.reference, like),
        ilike(users.firstName, like),
        ilike(users.lastName, like),
        ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, like),
      )!,
    );
  }
  if (filters.overdue) {
    conditions.push(eq(allocations.status, "ACTIVE"));
    conditions.push(sql`${allocations.expectedCompletionDate} < ${todayISO()}`);
  }

  const rows = await db
    .select({
      allocation: allocations,
      staffFirstName: users.firstName,
      staffLastName: users.lastName,
      departmentName: departments.name,
      projectName: projects.name,
      lastExpenseAt: sql<Date | null>`(select max(${expenses.updatedAt}) from ${expenses} where ${expenses.allocationId} = ${allocations.id})`,
    })
    .from(allocations)
    .innerJoin(users, eq(users.id, allocations.staffId))
    .leftJoin(departments, eq(departments.id, allocations.departmentId))
    .leftJoin(projects, eq(projects.id, allocations.projectId))
    .where(and(...conditions))
    .orderBy(sql`case when ${allocations.status} = 'ACTIVE' then 0 else 1 end`, desc(allocations.dateReceived), desc(allocations.createdAt))
    .limit(500);

  const balances = await loadBalances(rows.map((r) => r.allocation.id));
  const today = todayISO();
  return rows.map((r) => {
    const balance = balances.get(r.allocation.id)!;
    const lastActivity = r.lastExpenseAt ? new Date(r.lastExpenseAt) : r.allocation.updatedAt;
    return {
      ...r.allocation,
      staffName: `${r.staffFirstName} ${r.staffLastName}`,
      departmentName: r.departmentName,
      projectName: r.projectName,
      balance,
      lastActivity,
      overdue: r.allocation.status === "ACTIVE" && !!r.allocation.expectedCompletionDate && r.allocation.expectedCompletionDate < today,
      readyToReconcile: isReadyToReconcile(r.allocation.status, balance),
    };
  });
}

export function isReadyToReconcile(status: AllocationStatus, b: BalanceSummary) {
  return status === "ACTIVE" && b.counts.total > 0 && b.counts.pending === 0 && b.counts.draft === 0 && b.counts.rejected === 0 && b.outstanding === 0;
}

export async function getAllocationDetail(actor: CurrentUser, id: string) {
  const allocation = await db.query.allocations.findFirst({
    where: and(eq(allocations.id, id), eq(allocations.organisationId, actor.organisationId)),
  });
  if (!allocation) throw notFound("Allocation not found.");
  if (!canViewAllocation(actor, allocation)) throw forbidden("You can only view your own allocations.");

  const reviewer = aliasedTable(users, "reviewer");
  const creator = aliasedTable(users, "creator");

  const [staff, department, project, createdBy, expenseRows, adjustments, returns, docs, claimRows, recon, activity, balance] =
    await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, allocation.staffId) }),
      allocation.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, allocation.departmentId) }) : null,
      allocation.projectId ? db.query.projects.findFirst({ where: eq(projects.id, allocation.projectId) }) : null,
      db.query.users.findFirst({ where: eq(users.id, allocation.createdBy) }),
      db
        .select({
          expense: expenses,
          categoryName: expenseCategories.name,
          reviewerFirst: reviewer.firstName,
          reviewerLast: reviewer.lastName,
          docCount: sql<number>`(select count(*)::int from ${documents} where ${documents.expenseId} = ${expenses.id} and ${documents.deletedAt} is null)`,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .leftJoin(reviewer, eq(reviewer.id, expenses.reviewedBy))
        .where(eq(expenses.allocationId, id))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
      db
        .select({ adj: allocationAdjustments, byFirst: creator.firstName, byLast: creator.lastName })
        .from(allocationAdjustments)
        .innerJoin(creator, eq(creator.id, allocationAdjustments.createdBy))
        .where(eq(allocationAdjustments.allocationId, id))
        .orderBy(asc(allocationAdjustments.createdAt)),
      db
        .select({ ret: fundReturns, byFirst: creator.firstName, byLast: creator.lastName })
        .from(fundReturns)
        .innerJoin(creator, eq(creator.id, fundReturns.recordedBy))
        .where(eq(fundReturns.allocationId, id))
        .orderBy(asc(fundReturns.returnDate)),
      db
        .select({
          doc: documents,
          expenseRef: expenses.reference,
          expenseDescription: expenses.description,
          uploaderFirst: creator.firstName,
          uploaderLast: creator.lastName,
        })
        .from(documents)
        .leftJoin(expenses, eq(expenses.id, documents.expenseId))
        .innerJoin(creator, eq(creator.id, documents.uploadedBy))
        .where(and(isNull(documents.deletedAt), or(eq(documents.allocationId, id), eq(expenses.allocationId, id))))
        .orderBy(desc(documents.uploadedAt)),
      db.select().from(claims).where(eq(claims.allocationId, id)).orderBy(desc(claims.createdAt)),
      db.query.reconciliations.findFirst({ where: eq(reconciliations.allocationId, id), orderBy: desc(reconciliations.reconciledAt) }),
      db
        .select({ log: auditLogs, firstName: users.firstName, lastName: users.lastName })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(eq(auditLogs.allocationId, id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(200),
      loadBalance(id),
    ]);

  const today = todayISO();
  return {
    allocation,
    staff: staff ? { id: staff.id, fullName: `${staff.firstName} ${staff.lastName}`, email: staff.email } : null,
    department,
    project,
    createdBy: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : "—",
    balance,
    overdue: allocation.status === "ACTIVE" && !!allocation.expectedCompletionDate && allocation.expectedCompletionDate < today,
    readyToReconcile: isReadyToReconcile(allocation.status, balance),
    expenses: expenseRows.map((r) => ({
      ...r.expense,
      categoryName: r.categoryName,
      reviewerName: r.reviewerFirst ? `${r.reviewerFirst} ${r.reviewerLast}` : null,
      docCount: Number(r.docCount),
    })),
    adjustments: adjustments.map((a) => ({ ...a.adj, byName: `${a.byFirst} ${a.byLast}` })),
    returns: returns.map((r) => ({ ...r.ret, byName: `${r.byFirst} ${r.byLast}` })),
    documents: docs.map((d) => ({
      ...d.doc,
      expenseRef: d.expenseRef,
      expenseDescription: d.expenseDescription,
      uploaderName: `${d.uploaderFirst} ${d.uploaderLast}`,
    })),
    claims: claimRows,
    reconciliation: recon,
    activity: activity.map((a) => ({ ...a.log, userName: a.firstName ? `${a.firstName} ${a.lastName}` : "System" })),
  };
}
export type AllocationDetail = Awaited<ReturnType<typeof getAllocationDetail>>;

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export type CreateAllocationInput = {
  staffId: string;
  amount: number;
  purpose: string;
  dateReceived: string;
  expectedCompletionDate?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  transferReference?: string | null;
  fundingSource?: string | null;
  approvingOfficer?: string | null;
  notes?: string | null;
};

export async function createAllocation(actor: CurrentUser, input: CreateAllocationInput, transferReceipt?: File | null) {
  if (!can(actor.role, "allocations.create")) throw forbidden();
  const fieldErrors: Record<string, string> = {};
  if (!input.staffId) fieldErrors.staffId = "Choose the staff member receiving the funds.";
  if (!(input.amount > 0)) fieldErrors.amount = "Enter an amount greater than zero.";
  if (!input.purpose?.trim()) fieldErrors.purpose = "Describe what the money is for.";
  if (!isISODate(input.dateReceived)) fieldErrors.dateReceived = "Enter the date the funds were sent.";
  if (input.expectedCompletionDate && input.expectedCompletionDate < input.dateReceived)
    fieldErrors.expectedCompletionDate = "Expected completion must be on or after the date received.";
  if (Object.keys(fieldErrors).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", fieldErrors);

  const staff = await db.query.users.findFirst({ where: and(eq(users.id, input.staffId), eq(users.organisationId, actor.organisationId)) });
  if (!staff || staff.status !== "ACTIVE") throw new DomainError("That staff member is not active.", "VALIDATION", { staffId: "Choose an active staff member." });
  if (staff.role === "MANAGEMENT") throw new DomainError("Management accounts are read-only and cannot hold allocations.", "VALIDATION");

  const settings = await getSettings(actor.organisationId);
  const stored = transferReceipt && transferReceipt.size > 0 ? await storeUpload(transferReceipt, settings.maxUploadMb) : null;

  return db.transaction(async (tx) => {
    const reference = await nextReference(tx, "AL", Number(input.dateReceived.slice(0, 4)));
    const [row] = await tx
      .insert(allocations)
      .values({
        organisationId: actor.organisationId,
        reference,
        kind: "ADVANCE",
        staffId: staff.id,
        departmentId: input.departmentId || staff.departmentId || null,
        projectId: input.projectId || null,
        purpose: input.purpose.trim(),
        initialAmount: input.amount,
        dateReceived: input.dateReceived,
        expectedCompletionDate: input.expectedCompletionDate || null,
        transferReference: input.transferReference?.trim() || null,
        fundingSource: input.fundingSource?.trim() || null,
        approvingOfficer: input.approvingOfficer?.trim() || null,
        notes: input.notes?.trim() || null,
        createdBy: actor.id,
      })
      .returning();
    if (stored) {
      await tx.insert(documents).values({
        organisationId: actor.organisationId,
        kind: "TRANSFER_RECEIPT",
        allocationId: row.id,
        uploadedBy: actor.id,
        ...stored,
      });
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "ALLOCATION",
      entityId: row.id,
      entityRef: reference,
      allocationId: row.id,
      action: "CREATED",
      summary: `${actor.fullName} created allocation ${reference} of ${formatMoney(input.amount)} for ${staff.firstName} ${staff.lastName} — ${row.purpose}`,
      newValues: { amount: input.amount, purpose: row.purpose, staffId: staff.id, dateReceived: row.dateReceived },
    });
    await notifyUsers(tx, [staff.id], {
      type: "FUNDS_ASSIGNED",
      title: `New funds assigned: ${formatMoney(input.amount)}`,
      body: `${row.purpose}. Log your expenses against ${reference} as you spend.`,
      link: `/allocations/${row.id}`,
    });
    return row;
  });
}

/** Staff can open a personal-spend record to claim back money they spent from their own pocket. */
export async function createPersonalSpendRecord(
  actor: CurrentUser,
  input: { purpose: string; projectId?: string | null; dateReceived?: string },
) {
  if (!can(actor.role, "funds.own")) throw forbidden();
  if (!input.purpose?.trim())
    throw new DomainError("Describe what you spent your own money on.", "VALIDATION", { purpose: "Required." });
  return db.transaction(async (tx) => {
    const date = input.dateReceived && isISODate(input.dateReceived) ? input.dateReceived : todayISO();
    const reference = await nextReference(tx, "AL", Number(date.slice(0, 4)));
    const [row] = await tx
      .insert(allocations)
      .values({
        organisationId: actor.organisationId,
        reference,
        kind: "REIMBURSEMENT",
        staffId: actor.id,
        departmentId: actor.departmentId,
        projectId: input.projectId || null,
        purpose: input.purpose.trim(),
        initialAmount: 0,
        dateReceived: date,
        fundingSource: "Personal funds",
        createdBy: actor.id,
      })
      .returning();
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "ALLOCATION",
      entityId: row.id,
      entityRef: reference,
      allocationId: row.id,
      action: "CREATED",
      summary: `${actor.fullName} opened personal-spend record ${reference} — ${row.purpose}`,
    });
    return row;
  });
}

export async function updateAllocationDetails(
  actor: CurrentUser,
  id: string,
  input: { purpose: string; expectedCompletionDate?: string | null; projectId?: string | null; departmentId?: string | null; notes?: string | null; transferReference?: string | null },
) {
  if (!can(actor.role, "allocations.create")) throw forbidden();
  return db.transaction(async (tx) => {
    const current = await lockAllocation(tx, id);
    if (current.status !== "ACTIVE") throw new DomainError("Only active allocations can be edited.");
    if (!input.purpose?.trim()) throw new DomainError("Purpose is required.", "VALIDATION", { purpose: "Required." });
    const next = {
      purpose: input.purpose.trim(),
      expectedCompletionDate: input.expectedCompletionDate || null,
      projectId: input.projectId || null,
      departmentId: input.departmentId || null,
      notes: input.notes?.trim() || null,
      transferReference: input.transferReference?.trim() || null,
    };
    await tx.update(allocations).set(next).where(eq(allocations.id, id));
    const d = diff(current as unknown as Record<string, unknown>, next);
    if (d.changed) {
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "ALLOCATION",
        entityId: id,
        entityRef: current.reference,
        allocationId: id,
        action: "UPDATED",
        summary: `${actor.fullName} updated allocation details`,
        oldValues: d.oldValues,
        newValues: d.newValues,
      });
    }
  });
}

export async function addAdjustment(
  actor: CurrentUser,
  id: string,
  input: { type: AdjustmentType; amount: number; reason: string; reference?: string | null; claimId?: string | null },
  exec?: Executor,
) {
  if (!can(actor.role, "allocations.create")) throw forbidden();
  if (!input.amount) throw new DomainError("Enter a non-zero amount.", "VALIDATION", { amount: "Required." });
  if (input.type !== "CORRECTION" && input.amount < 0)
    throw new DomainError("Only corrections can reduce an allocation.", "VALIDATION", { amount: "Must be positive." });
  if (input.type === "CORRECTION" && actor.role !== "ADMIN")
    throw forbidden("Only administrators can post corrections.");
  if (!input.reason?.trim()) throw new DomainError("Give a reason for this adjustment.", "VALIDATION", { reason: "Required." });

  const run = async (tx: Executor) => {
    const allocation = await lockAllocation(tx, id);
    if (allocation.status !== "ACTIVE") throw new DomainError("Funds can only be added to an active allocation.");
    if (input.amount < 0) {
      const balance = await loadBalance(id, tx);
      if (balance.available + input.amount < 0)
        throw new DomainError(`A correction of ${formatMoney(input.amount)} would leave the allocation with a negative available balance.`);
    }
    await tx.insert(allocationAdjustments).values({
      allocationId: id,
      type: input.type,
      amount: input.amount,
      reason: input.reason.trim(),
      reference: input.reference?.trim() || null,
      claimId: input.claimId ?? null,
      createdBy: actor.id,
    });
    const label = input.type === "ADDITIONAL_FUNDING" ? "additional funding" : input.type.toLowerCase();
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "ALLOCATION",
      entityId: id,
      entityRef: allocation.reference,
      allocationId: id,
      action: `ADJUSTMENT_${input.type}`,
      summary: `${actor.fullName} added ${formatMoney(input.amount, { sign: true })} ${label} — ${input.reason.trim()}`,
      newValues: { type: input.type, amount: input.amount, reason: input.reason.trim() },
    });
    if (allocation.staffId !== actor.id) {
      await notifyUsers(tx, [allocation.staffId], {
        type: "FUNDS_ADDED",
        title: `${formatMoney(input.amount, { sign: true })} ${label} on ${allocation.purpose}`,
        body: input.reason.trim(),
        link: `/allocations/${id}`,
      });
    }
  };
  return exec ? run(exec) : db.transaction(run);
}

export async function recordReturn(
  actor: CurrentUser,
  id: string,
  input: { amount: number; returnDate: string; paymentMethod?: string | null; reference?: string | null; notes?: string | null },
  evidence?: File | null,
) {
  if (!can(actor.role, "returns.record")) throw forbidden();
  const fieldErrors: Record<string, string> = {};
  if (!(input.amount > 0)) fieldErrors.amount = "Enter the amount returned.";
  if (!isISODate(input.returnDate)) fieldErrors.returnDate = "Enter the date the money was returned.";
  else if (input.returnDate > todayISO()) fieldErrors.returnDate = "Return date cannot be in the future.";
  if (Object.keys(fieldErrors).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", fieldErrors);

  const settings = await getSettings(actor.organisationId);
  const stored = evidence && evidence.size > 0 ? await storeUpload(evidence, settings.maxUploadMb) : null;

  return db.transaction(async (tx) => {
    const allocation = await lockAllocation(tx, id);
    if (allocation.status !== "ACTIVE") throw new DomainError("Returns can only be recorded on an active allocation.");
    const balance = await loadBalance(id, tx);
    // Rule 5: a returned amount cannot exceed the outstanding (unspent and unreserved) balance.
    if (input.amount > balance.available) {
      throw new DomainError(
        `The return of ${formatMoney(input.amount)} is more than the unspent balance of ${formatMoney(Math.max(balance.available, 0))}.`,
        "VALIDATION",
        { amount: `Maximum ${formatMoney(Math.max(balance.available, 0))}` },
      );
    }
    const [ret] = await tx
      .insert(fundReturns)
      .values({
        allocationId: id,
        amount: input.amount,
        returnDate: input.returnDate,
        paymentMethod: input.paymentMethod || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        recordedBy: actor.id,
      })
      .returning();
    if (stored) {
      await tx.insert(documents).values({
        organisationId: actor.organisationId,
        kind: "RETURN_EVIDENCE",
        allocationId: id,
        fundReturnId: ret.id,
        uploadedBy: actor.id,
        ...stored,
      });
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "RETURN",
      entityId: ret.id,
      entityRef: allocation.reference,
      allocationId: id,
      action: "RECORDED",
      summary: `${actor.fullName} recorded a return of ${formatMoney(input.amount)}${input.reference ? ` (ref ${input.reference})` : ""}`,
      newValues: { amount: input.amount, returnDate: input.returnDate, method: input.paymentMethod, reference: input.reference },
    });
    await notifyUsers(tx, [allocation.staffId], {
      type: "RETURN_RECORDED",
      title: `Return of ${formatMoney(input.amount)} recorded`,
      body: `Against ${allocation.purpose} (${allocation.reference}).`,
      link: `/allocations/${id}`,
    });
    return ret;
  });
}

export async function reconcileAllocation(actor: CurrentUser, id: string, notes?: string | null) {
  if (!can(actor.role, "allocations.reconcile")) throw forbidden();
  return db.transaction(async (tx) => {
    const allocation = await lockAllocation(tx, id);
    if (allocation.status !== "ACTIVE") throw new DomainError("This allocation is not active.");
    // Rule 4: cannot reconcile while unresolved expenses remain.
    const unresolved = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.allocationId, id), inArray(expenses.status, UNRESOLVED_STATUSES)));
    if (Number(unresolved[0].count) > 0) {
      throw new DomainError(
        `${unresolved[0].count} expense(s) are still draft, pending, rejected or awaiting clarification. Resolve or void them before reconciling.`,
      );
    }
    const openClaims = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(claims)
      .where(and(eq(claims.allocationId, id), inArray(claims.status, ["SUBMITTED", "RECOMMENDED"])));
    if (Number(openClaims[0].count) > 0) throw new DomainError("There is an open claim on this allocation. Decide it before reconciling.");

    const balance = await loadBalance(id, tx);
    if (balance.outstanding > 0) {
      throw new DomainError(`${formatMoney(balance.outstanding)} is still unaccounted for. Record the return of unspent funds first.`);
    }
    if (balance.outstanding < 0) {
      throw new DomainError(
        `Approved spending exceeds the funds by ${formatMoney(-balance.outstanding)}. Approve a reimbursement claim or add funding first.`,
      );
    }
    const now = new Date();
    await tx.insert(reconciliations).values({
      allocationId: id,
      totalFunded: balance.totalFunded,
      approvedExpenses: balance.approved,
      amountReturned: balance.returned,
      adjustments: balance.adjustments,
      finalBalance: balance.outstanding,
      notes: notes?.trim() || null,
      reconciledBy: actor.id,
      reconciledAt: now,
    });
    await tx
      .update(expenses)
      .set({ status: "RECONCILED" })
      .where(and(eq(expenses.allocationId, id), eq(expenses.status, "APPROVED")));
    await tx.update(allocations).set({ status: "RECONCILED", reconciledAt: now }).where(eq(allocations.id, id));
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "RECONCILIATION",
      entityId: id,
      entityRef: allocation.reference,
      allocationId: id,
      action: "RECONCILED",
      summary: `${actor.fullName} reconciled the allocation: ${formatMoney(balance.totalFunded)} funded, ${formatMoney(balance.approved)} approved, ${formatMoney(balance.returned)} returned, ${formatMoney(0)} outstanding`,
      oldValues: { status: "ACTIVE" },
      newValues: { status: "RECONCILED", ...balance },
    });
    await notifyUsers(tx, [allocation.staffId], {
      type: "RECONCILED",
      title: `${allocation.purpose} is fully reconciled`,
      body: `Thank you — every naira of ${allocation.reference} has been accounted for.`,
      link: `/allocations/${id}`,
    });
  });
}

export async function setAllocationStatus(actor: CurrentUser, id: string, status: "ARCHIVED" | "VOIDED" | "ACTIVE", reason: string) {
  if (!can(actor.role, "allocations.create")) throw forbidden();
  if (!reason?.trim()) throw new DomainError("Give a reason.", "VALIDATION", { reason: "Required." });
  return db.transaction(async (tx) => {
    const allocation = await lockAllocation(tx, id);
    if (status === "VOIDED") {
      if (allocation.status !== "ACTIVE") throw new DomainError("Only active allocations can be voided.");
      const live = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(expenses)
        .where(and(eq(expenses.allocationId, id), sql`${expenses.status} <> 'VOIDED'`));
      if (Number(live[0].count) > 0) throw new DomainError("Void or move all expenses before voiding the allocation.");
    }
    if (status === "ARCHIVED" && allocation.status !== "RECONCILED") throw new DomainError("Only reconciled allocations can be archived.");
    if (status === "ACTIVE" && allocation.status !== "ARCHIVED") throw new DomainError("Only archived allocations can be restored.");
    await tx
      .update(allocations)
      .set({ status: status === "ACTIVE" ? "RECONCILED" : status, voidReason: status === "VOIDED" ? reason.trim() : allocation.voidReason })
      .where(eq(allocations.id, id));
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "ALLOCATION",
      entityId: id,
      entityRef: allocation.reference,
      allocationId: id,
      action: status === "ACTIVE" ? "RESTORED" : status,
      summary: `${actor.fullName} ${status === "ACTIVE" ? "restored" : status.toLowerCase()} the allocation — ${reason.trim()}`,
      oldValues: { status: allocation.status },
      newValues: { status: status === "ACTIVE" ? "RECONCILED" : status },
    });
  });
}

/** Notify finance when an allocation becomes ready to reconcile. */
export async function maybeNotifyReadyToReconcile(tx: Executor, actor: CurrentUser, allocationId: string) {
  const allocation = await tx.query.allocations.findFirst({ where: eq(allocations.id, allocationId) });
  if (!allocation || allocation.status !== "ACTIVE") return;
  const balance = await loadBalance(allocationId, tx);
  if (balance.counts.pending === 0 && balance.counts.rejected === 0 && balance.counts.draft === 0 && balance.counts.total > 0 && balance.available === 0) {
    await notifyRoles(tx, actor.organisationId, FINANCE_ROLES, {
      type: "READY_TO_RECONCILE",
      title: `${allocation.reference} is ready for reconciliation`,
      body: `${allocation.purpose} — all expenses approved and the balance is fully accounted for.`,
      link: `/allocations/${allocationId}`,
      dedupeKey: `ready:${allocationId}:${balance.approved}:${balance.returned}`,
    });
  }
}
