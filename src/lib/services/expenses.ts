import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "@/db";
import {
  allocations,
  claims,
  departments,
  documents,
  expenseCategories,
  expenseReviews,
  expenses,
  projects,
  users,
  type DocumentKind,
  type Expense,
  type ExpenseStatus,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit, diff } from "@/lib/audit";
import { EDITABLE_STATUSES, PENDING_STATUSES } from "@/lib/balance";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { ConfirmationRequired, DomainError, forbidden, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { FINANCE_ROLES, notifyRoles, notifyUsers } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { nextReference } from "@/lib/refs";
import { storeUpload, type StoredFile } from "@/lib/storage";
import { canViewAllocation, lockAllocation, maybeNotifyReadyToReconcile } from "./allocations";
import { loadBalance } from "./balances";
import { getSettings } from "./org";

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type ExpenseFilters = {
  q?: string;
  staffId?: string;
  departmentId?: string;
  categoryId?: string;
  projectId?: string;
  allocationId?: string;
  status?: string; // a status, comma list, or the alias "pending" / "attention"
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  receipt?: "yes" | "no";
  reconciled?: "yes" | "no";
  overBudget?: boolean;
  scope?: "mine" | "all";
  ids?: string[];
  includeVoided?: boolean;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "submitted";
  page?: number;
  pageSize?: number;
};

const hasReceiptSql = sql<boolean>`exists (select 1 from ${documents} d where d.expense_id = ${expenses.id} and d.deleted_at is null)`;

export function parseExpenseFilters(sp: Record<string, string | string[] | undefined>): ExpenseFilters {
  const get = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const num = (k: string) => {
    const v = get(k);
    if (!v) return undefined;
    const n = Number(v.replace(/[,₦\s]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : undefined;
  };
  return {
    q: get("q"),
    staffId: get("staff"),
    departmentId: get("department"),
    categoryId: get("category"),
    projectId: get("project"),
    allocationId: get("allocation"),
    status: get("status"),
    from: get("from"),
    to: get("to"),
    min: num("min"),
    max: num("max"),
    receipt: get("receipt") as ExpenseFilters["receipt"],
    reconciled: get("reconciled") as ExpenseFilters["reconciled"],
    overBudget: get("over") === "1",
    scope: get("scope") === "mine" ? "mine" : undefined,
    sort: get("sort") as ExpenseFilters["sort"],
    page: Number(get("page") ?? 1) || 1,
  };
}

function expenseConditions(actor: CurrentUser, f: ExpenseFilters): SQL[] {
  const c: SQL[] = [eq(allocations.organisationId, actor.organisationId)];
  if (f.scope === "mine" || !can(actor.role, "expenses.viewAll")) c.push(eq(expenses.staffId, actor.id));
  if (f.staffId) c.push(eq(expenses.staffId, f.staffId));
  if (f.departmentId) c.push(eq(expenses.departmentId, f.departmentId));
  if (f.categoryId) c.push(eq(expenses.categoryId, f.categoryId));
  if (f.projectId) c.push(eq(expenses.projectId, f.projectId));
  if (f.allocationId) c.push(eq(expenses.allocationId, f.allocationId));
  if (f.ids?.length) c.push(inArray(expenses.id, f.ids));
  if (f.status) {
    if (f.status === "pending") c.push(inArray(expenses.status, PENDING_STATUSES));
    else if (f.status === "review") c.push(inArray(expenses.status, ["SUBMITTED", "UNDER_REVIEW"]));
    else if (f.status === "attention") c.push(inArray(expenses.status, ["REJECTED", "NEEDS_CLARIFICATION", "DRAFT"]));
    else {
      const list = f.status.split(",").filter(Boolean) as ExpenseStatus[];
      c.push(inArray(expenses.status, list));
    }
  } else if (!f.includeVoided) c.push(ne(expenses.status, "VOIDED"));
  if (f.from && isISODate(f.from)) c.push(gte(expenses.expenseDate, f.from));
  if (f.to && isISODate(f.to)) c.push(lte(expenses.expenseDate, f.to));
  if (f.min != null) c.push(gte(expenses.amount, f.min));
  if (f.max != null) c.push(lte(expenses.amount, f.max));
  if (f.receipt === "yes") c.push(hasReceiptSql);
  if (f.receipt === "no") c.push(sql`not ${hasReceiptSql}`);
  if (f.reconciled === "yes") c.push(eq(expenses.status, "RECONCILED"));
  if (f.reconciled === "no") c.push(ne(expenses.status, "RECONCILED"));
  if (f.overBudget) c.push(eq(expenses.overBudget, true));
  if (f.q) {
    const like = `%${f.q}%`;
    c.push(
      or(
        ilike(expenses.description, like),
        ilike(expenses.vendor, like),
        ilike(expenses.reference, like),
        ilike(expenses.paymentReference, like),
        ilike(allocations.purpose, like),
        ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, like),
      )!,
    );
  }
  return c;
}

export async function listExpenses(actor: CurrentUser, f: ExpenseFilters) {
  const pageSize = Math.min(f.pageSize ?? 25, 5000);
  const page = Math.max(1, f.page ?? 1);
  const where = and(...expenseConditions(actor, f));
  const order =
    f.sort === "date_asc"
      ? [asc(expenses.expenseDate), asc(expenses.createdAt)]
      : f.sort === "amount_desc"
        ? [desc(expenses.amount)]
        : f.sort === "amount_asc"
          ? [asc(expenses.amount)]
          : f.sort === "submitted"
            ? [asc(expenses.submittedAt)]
            : [desc(expenses.expenseDate), desc(expenses.createdAt)];

  const [rows, totals] = await Promise.all([
    db
      .select({
        expense: expenses,
        staffFirst: users.firstName,
        staffLast: users.lastName,
        categoryName: expenseCategories.name,
        allocationRef: allocations.reference,
        allocationPurpose: allocations.purpose,
        projectName: projects.name,
        departmentName: departments.name,
        hasReceipt: hasReceiptSql,
        docCount: sql<number>`(select count(*)::int from ${documents} d where d.expense_id = ${expenses.id} and d.deleted_at is null)`,
      })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .innerJoin(users, eq(users.id, expenses.staffId))
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(departments, eq(departments.id, expenses.departmentId))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .innerJoin(users, eq(users.id, expenses.staffId))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r.expense,
      staffName: `${r.staffFirst} ${r.staffLast}`,
      categoryName: r.categoryName,
      allocationRef: r.allocationRef,
      allocationPurpose: r.allocationPurpose,
      projectName: r.projectName,
      departmentName: r.departmentName,
      hasReceipt: Boolean(r.hasReceipt),
      docCount: Number(r.docCount),
    })),
    count: Number(totals[0].count),
    total: Number(totals[0].total),
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(Number(totals[0].count) / pageSize)),
  };
}
export type ExpenseListRow = Awaited<ReturnType<typeof listExpenses>>["rows"][number];

export async function getExpenseDetail(actor: CurrentUser, id: string) {
  const row = await db
    .select({ expense: expenses, allocation: allocations })
    .from(expenses)
    .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
    .where(and(eq(expenses.id, id), eq(allocations.organisationId, actor.organisationId)))
    .limit(1);
  if (!row[0]) throw notFound("Expense not found.");
  const { expense, allocation } = row[0];
  if (expense.staffId !== actor.id && !can(actor.role, "expenses.viewAll")) throw forbidden("You can only view your own expenses.");

  const uploader = aliasedTable(users, "uploader");
  const [staff, category, project, department, docs, reviews, balance, similar, unusual] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, expense.staffId) }),
    db.query.expenseCategories.findFirst({ where: eq(expenseCategories.id, expense.categoryId) }),
    expense.projectId ? db.query.projects.findFirst({ where: eq(projects.id, expense.projectId) }) : null,
    expense.departmentId ? db.query.departments.findFirst({ where: eq(departments.id, expense.departmentId) }) : null,
    db
      .select({ doc: documents, first: uploader.firstName, last: uploader.lastName })
      .from(documents)
      .innerJoin(uploader, eq(uploader.id, documents.uploadedBy))
      .where(and(eq(documents.expenseId, id), isNull(documents.deletedAt)))
      .orderBy(asc(documents.uploadedAt)),
    db
      .select({ review: expenseReviews, first: users.firstName, last: users.lastName, role: users.role })
      .from(expenseReviews)
      .innerJoin(users, eq(users.id, expenseReviews.reviewerId))
      .where(eq(expenseReviews.expenseId, id))
      .orderBy(asc(expenseReviews.createdAt)),
    loadBalance(allocation.id),
    findSimilarExpenses(db, { staffId: expense.staffId, amount: expense.amount, expenseDate: expense.expenseDate, description: expense.description, vendor: expense.vendor, excludeId: id }),
    unusualCheck(db, actor.organisationId, expense),
  ]);

  return {
    expense,
    allocation,
    staff: staff ? { id: staff.id, fullName: `${staff.firstName} ${staff.lastName}`, email: staff.email } : null,
    category,
    project,
    department,
    documents: docs.map((d) => ({ ...d.doc, uploaderName: `${d.first} ${d.last}` })),
    reviews: reviews.map((r) => ({ ...r.review, reviewerName: `${r.first} ${r.last}`, reviewerRole: r.role })),
    balance,
    similar,
    unusual,
    canEdit: expense.staffId === actor.id && EDITABLE_STATUSES.includes(expense.status) && allocation.status === "ACTIVE",
    canReview:
      can(actor.role, "expenses.review") && expense.staffId !== actor.id && ["SUBMITTED", "UNDER_REVIEW"].includes(expense.status),
    canVoid:
      expense.status !== "VOIDED" &&
      expense.status !== "RECONCILED" &&
      allocation.status === "ACTIVE" &&
      ((expense.staffId === actor.id && EDITABLE_STATUSES.includes(expense.status)) || can(actor.role, "expenses.void")),
    isOwner: expense.staffId === actor.id,
  };
}
export type ExpenseDetail = Awaited<ReturnType<typeof getExpenseDetail>>;

/* ------------------------------------------------------------------ */
/* Smart validation helpers                                            */
/* ------------------------------------------------------------------ */

function normalise(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function similarText(a: string, b: string) {
  const ta = new Set(normalise(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalise(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}

/** Same staff member, same amount, within three days, and a similar description or vendor. */
export async function findSimilarExpenses(
  exec: Executor,
  input: { staffId: string; amount: number; expenseDate: string; description: string; vendor?: string | null; excludeId?: string },
) {
  const conditions = [
    eq(expenses.staffId, input.staffId),
    eq(expenses.amount, input.amount),
    ne(expenses.status, "VOIDED"),
    gte(expenses.expenseDate, addDays(input.expenseDate, -3)),
    lte(expenses.expenseDate, addDays(input.expenseDate, 3)),
  ];
  if (input.excludeId) conditions.push(ne(expenses.id, input.excludeId));
  const candidates = await exec
    .select({ id: expenses.id, reference: expenses.reference, description: expenses.description, vendor: expenses.vendor, amount: expenses.amount, expenseDate: expenses.expenseDate, status: expenses.status })
    .from(expenses)
    .where(and(...conditions))
    .limit(10);
  return candidates.filter(
    (c) =>
      c.expenseDate === input.expenseDate ||
      similarText(c.description, input.description) ||
      (input.vendor && c.vendor && normalise(c.vendor) === normalise(input.vendor)),
  );
}

/** Flags expenses far above the 90-day average for their category. */
async function unusualCheck(exec: Executor, orgId: string, expense: Pick<Expense, "id" | "categoryId" | "amount" | "expenseDate">) {
  const settings = await getSettings(orgId, exec);
  const rows = await exec
    .select({ avg: sql<string | null>`avg(${expenses.amount})`, count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      and(
        eq(expenses.categoryId, expense.categoryId),
        ne(expenses.id, expense.id),
        inArray(expenses.status, ["APPROVED", "RECONCILED", "SUBMITTED", "UNDER_REVIEW"]),
        gte(expenses.expenseDate, addDays(expense.expenseDate, -90)),
        lte(expenses.expenseDate, expense.expenseDate),
      ),
    );
  const avg = rows[0].avg ? Number(rows[0].avg) : 0;
  const count = Number(rows[0].count);
  if (count < 3 || !avg) return null;
  const ratio = expense.amount / avg;
  return ratio >= settings.unusualMultiplier ? { average: Math.round(avg), ratio: Math.round(ratio * 10) / 10, sample: count } : null;
}

export { suggestCategory } from "@/lib/suggest";

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export type ExpenseInput = {
  allocationId: string;
  categoryId: string;
  projectId?: string | null;
  expenseDate: string;
  amount: number | null;
  description: string;
  vendor?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
};

export type SaveOptions = {
  submit: boolean;
  confirmDuplicate?: boolean;
  confirmOverBudget?: boolean;
  comment?: string | null;
};

export type UploadSet = { receipts: File[]; supporting: File[] };

async function storeUploads(orgId: string, files: UploadSet) {
  const settings = await getSettings(orgId);
  const out: { kind: DocumentKind; file: StoredFile }[] = [];
  for (const f of files.receipts) out.push({ kind: "RECEIPT", file: await storeUpload(f, settings.maxUploadMb) });
  for (const f of files.supporting) out.push({ kind: "SUPPORTING", file: await storeUpload(f, settings.maxUploadMb) });
  return out;
}

function validateFields(input: ExpenseInput, blockFuture: boolean) {
  const e: Record<string, string> = {};
  if (!input.allocationId) e.allocationId = "Choose which fund this expense is for.";
  if (!input.categoryId) e.categoryId = "Choose a category.";
  if (input.amount == null || !(input.amount > 0)) e.amount = "Enter an amount greater than zero.";
  if (!input.description?.trim()) e.description = "Describe what the money was spent on.";
  if (!isISODate(input.expenseDate)) e.expenseDate = "Enter a valid date.";
  else if (blockFuture && input.expenseDate > todayISO()) e.expenseDate = "Expense date cannot be in the future.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
}

/**
 * Creates or updates an expense, running the backend checks from the spec:
 * authenticate → verify the allocation belongs to the user → check allocation status →
 * validate amount/date → calculate available balance → check duplicates/receipts →
 * persist → audit → return the updated balance.
 */
export async function saveExpense(actor: CurrentUser, expenseId: string | null, input: ExpenseInput, files: UploadSet, opts: SaveOptions) {
  if (!can(actor.role, "funds.own")) throw forbidden();
  const settings = await getSettings(actor.organisationId);
  validateFields(input, settings.blockFutureDates);
  const amount = input.amount!;

  const category = await db.query.expenseCategories.findFirst({
    where: and(eq(expenseCategories.id, input.categoryId), eq(expenseCategories.organisationId, actor.organisationId)),
  });
  if (!category || category.archived) throw new DomainError("Choose an active category.", "VALIDATION", { categoryId: "Invalid category." });

  // Validate the request against the current state before writing any files.
  const preAllocation = await db.query.allocations.findFirst({ where: eq(allocations.id, input.allocationId) });
  if (!preAllocation || preAllocation.organisationId !== actor.organisationId) throw notFound("Allocation not found.");
  if (preAllocation.staffId !== actor.id)
    throw forbidden("You can only log expenses against funds assigned to you."); // Rule 1

  const stored = await storeUploads(actor.organisationId, files);

  return db.transaction(async (tx) => {
    const allocation = await lockAllocation(tx, input.allocationId);
    if (allocation.status !== "ACTIVE") throw new DomainError("This allocation is closed. Choose an active fund.");

    let existing: Expense | null = null;
    if (expenseId) {
      const rows = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).for("update");
      existing = rows[0] ?? null;
      if (!existing) throw notFound("Expense not found.");
      if (existing.staffId !== actor.id) throw forbidden("You can only edit your own expenses.");
      // Rule 2: approved expenses cannot be silently edited.
      if (!EDITABLE_STATUSES.includes(existing.status))
        throw new DomainError(`This expense is ${existing.status.toLowerCase().replace("_", " ")} and can no longer be edited.`);
      if (existing.allocationId !== input.allocationId) {
        const prev = await lockAllocation(tx, existing.allocationId);
        if (prev.staffId !== actor.id) throw forbidden();
      }
    }

    // Balance check: what's available excluding this expense's previous reservation.
    const balance = await loadBalance(allocation.id, tx);
    const reservedBefore =
      existing && existing.allocationId === allocation.id && PENDING_STATUSES.includes(existing.status) ? existing.amount : 0;
    const availableBefore = balance.available + reservedBefore;
    const remainingAfter = availableBefore - amount;
    const overBudget = remainingAfter < 0;

    if (opts.submit && overBudget) {
      if (allocation.kind === "ADVANCE" && settings.blockOverspend) {
        throw new DomainError(
          `This expense exceeds your available balance by ${formatMoney(-remainingAfter)}. Request additional funds before submitting.`,
          "VALIDATION",
          { amount: `Available: ${formatMoney(Math.max(availableBefore, 0))}` },
        );
      }
      if (!opts.confirmOverBudget && allocation.kind === "ADVANCE") {
        throw new ConfirmationRequired(
          `This expense exceeds your available balance by ${formatMoney(-remainingAfter)}. It will be flagged as over budget and you'll need to log a claim with evidence of approval to be reimbursed.`,
          "OVER_BUDGET",
        );
      }
    }

    if (settings.duplicateDetection && !opts.confirmDuplicate) {
      const similar = await findSimilarExpenses(tx, {
        staffId: actor.id,
        amount,
        expenseDate: input.expenseDate,
        description: input.description,
        vendor: input.vendor,
        excludeId: expenseId ?? undefined,
      });
      if (similar.length) {
        const s = similar[0];
        throw new ConfirmationRequired(
          `This looks similar to an expense you already logged: ${formatMoney(s.amount)} · ${s.description} · ${s.expenseDate} (${s.reference}). Are you sure you want to continue?`,
          "DUPLICATE",
        );
      }
    }

    if (opts.submit && (settings.requireReceipt || category.receiptRequired)) {
      // Rule 6: a required receipt must exist before submission.
      let existingDocs = 0;
      if (expenseId) {
        const r = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(and(eq(documents.expenseId, expenseId), isNull(documents.deletedAt)));
        existingDocs = Number(r[0].count);
      }
      if (existingDocs + stored.length === 0) {
        throw new DomainError(`A receipt is required for ${category.name} expenses. Upload a receipt or save as a draft.`, "VALIDATION", {
          receipts: "Upload at least one receipt (JPG, PNG, WebP or PDF).",
        });
      }
    }

    const nextStatus: ExpenseStatus = opts.submit ? "SUBMITTED" : existing?.status === "DRAFT" || !existing ? "DRAFT" : existing.status;
    const values = {
      allocationId: allocation.id,
      categoryId: category.id,
      projectId: input.projectId || allocation.projectId || null,
      departmentId: allocation.departmentId ?? actor.departmentId ?? null,
      expenseDate: input.expenseDate,
      amount,
      description: input.description.trim(),
      vendor: input.vendor?.trim() || null,
      paymentMethod: input.paymentMethod || null,
      paymentReference: input.paymentReference?.trim() || null,
      notes: input.notes?.trim() || null,
      status: nextStatus,
      overBudget: opts.submit ? overBudget && allocation.kind === "ADVANCE" : (existing?.overBudget ?? false),
      submittedAt: opts.submit ? new Date() : (existing?.submittedAt ?? null),
    };

    let saved: Expense;
    if (existing) {
      [saved] = await tx.update(expenses).set(values).where(eq(expenses.id, existing.id)).returning();
      const d = diff(existing as unknown as Record<string, unknown>, values);
      const wasReturned = existing.status === "REJECTED" || existing.status === "NEEDS_CLARIFICATION";
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "EXPENSE",
        entityId: saved.id,
        entityRef: saved.reference,
        allocationId: allocation.id,
        action: opts.submit ? (wasReturned ? "RESUBMITTED" : "SUBMITTED") : "UPDATED",
        summary: opts.submit
          ? `${actor.fullName} ${wasReturned ? "corrected and resubmitted" : "submitted"} ${formatMoney(amount)} expense — ${values.description}`
          : `${actor.fullName} updated draft expense — ${values.description}`,
        oldValues: d.oldValues,
        newValues: d.newValues,
      });
      if (opts.submit) {
        await tx.insert(expenseReviews).values({
          expenseId: saved.id,
          reviewerId: actor.id,
          action: wasReturned ? "RESUBMITTED" : "SUBMITTED",
          comment: opts.comment?.trim() || null,
        });
      }
    } else {
      const reference = await nextReference(tx, "EXP", Number(input.expenseDate.slice(0, 4)));
      [saved] = await tx
        .insert(expenses)
        .values({ ...values, reference, staffId: actor.id, currency: allocation.currency })
        .returning();
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "EXPENSE",
        entityId: saved.id,
        entityRef: reference,
        allocationId: allocation.id,
        action: opts.submit ? "SUBMITTED" : "CREATED",
        summary: `${actor.fullName} ${opts.submit ? "submitted" : "drafted"} ${formatMoney(amount)} expense — ${values.description}`,
        newValues: { amount, description: values.description, category: category.name, expenseDate: values.expenseDate, vendor: values.vendor },
      });
      if (opts.submit) {
        await tx.insert(expenseReviews).values({ expenseId: saved.id, reviewerId: actor.id, action: "SUBMITTED", comment: opts.comment?.trim() || null });
      }
    }

    for (const s of stored) {
      const [doc] = await tx
        .insert(documents)
        .values({ organisationId: actor.organisationId, kind: s.kind, expenseId: saved.id, uploadedBy: actor.id, ...s.file })
        .returning();
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "DOCUMENT",
        entityId: doc.id,
        entityRef: saved.reference,
        allocationId: allocation.id,
        action: "UPLOADED",
        summary: `${actor.fullName} attached ${doc.fileName} to ${saved.reference}`,
      });
    }

    if (opts.submit) await afterSubmit(tx, actor, allocation, saved, stored.length > 0 || !!expenseId);

    const after = await loadBalance(allocation.id, tx);
    return { expense: saved, balance: after };
  });
}

async function afterSubmit(
  tx: Executor,
  actor: CurrentUser,
  allocation: { id: string; purpose: string; reference: string; kind: string },
  expense: Expense,
  hadDocs: boolean,
) {
  const settings = await getSettings(actor.organisationId, tx);
  await notifyRoles(
    tx,
    actor.organisationId,
    FINANCE_ROLES,
    {
      type: "EXPENSE_SUBMITTED",
      title: `${actor.fullName} submitted ${formatMoney(expense.amount)}`,
      body: `${expense.description} — ${allocation.purpose}`,
      link: `/expenses/${expense.id}`,
    },
    actor.id,
  );
  if (!hadDocs) {
    const r = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(and(eq(documents.expenseId, expense.id), isNull(documents.deletedAt)));
    if (Number(r[0].count) === 0) {
      await notifyRoles(tx, actor.organisationId, FINANCE_ROLES, {
        type: "RECEIPT_MISSING",
        title: `Receipt missing on ${expense.reference}`,
        body: `${actor.fullName} submitted ${formatMoney(expense.amount)} without a receipt.`,
        link: `/expenses/${expense.id}`,
      }, actor.id);
    }
  }
  const balance = await loadBalance(allocation.id, tx);
  if (balance.overBudget && allocation.kind === "ADVANCE") {
    await notifyRoles(tx, actor.organisationId, FINANCE_ROLES, {
      type: "OVER_BUDGET",
      title: `${actor.fullName} has exceeded ${allocation.reference}`,
      body: `${allocation.purpose} is over budget by ${formatMoney(balance.overspend)}.`,
      link: `/allocations/${allocation.id}`,
      dedupeKey: `over:${allocation.id}:${balance.overspend}`,
    }, actor.id);
  } else if (balance.totalFunded > 0 && balance.utilisation >= settings.nearDepletionPercent) {
    await notifyUsers(tx, [actor.id], {
      type: "NEAR_DEPLETION",
      title: `${allocation.purpose} is ${balance.utilisation}% used`,
      body: `${formatMoney(balance.available)} remaining.`,
      link: `/allocations/${allocation.id}`,
      dedupeKey: `depletion:${allocation.id}`,
    });
  }
}

/** Submit an existing draft without changing its fields. */
export async function submitDraft(actor: CurrentUser, id: string, opts: Omit<SaveOptions, "submit">) {
  const current = await db.query.expenses.findFirst({ where: eq(expenses.id, id) });
  if (!current) throw notFound("Expense not found.");
  return saveExpense(
    actor,
    id,
    {
      allocationId: current.allocationId,
      categoryId: current.categoryId,
      projectId: current.projectId,
      expenseDate: current.expenseDate,
      amount: current.amount,
      description: current.description,
      vendor: current.vendor,
      paymentMethod: current.paymentMethod,
      paymentReference: current.paymentReference,
      notes: current.notes,
    },
    { receipts: [], supporting: [] },
    { ...opts, submit: true },
  );
}

export async function voidExpense(actor: CurrentUser, id: string, reason: string) {
  if (!reason?.trim()) throw new DomainError("Give a reason for voiding this expense.", "VALIDATION", { reason: "Required." });
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
    const expense = rows[0];
    if (!expense) throw notFound("Expense not found.");
    const allocation = await lockAllocation(tx, expense.allocationId);
    if (allocation.organisationId !== actor.organisationId) throw notFound();
    const isOwner = expense.staffId === actor.id;
    const allowed = (isOwner && EDITABLE_STATUSES.includes(expense.status)) || can(actor.role, "expenses.void");
    if (!allowed) throw forbidden("You can't void this expense.");
    if (expense.status === "VOIDED") throw new DomainError("This expense is already voided.");
    if (expense.status === "RECONCILED" || allocation.status !== "ACTIVE")
      throw new DomainError("Reconciled expenses are locked and cannot be voided.");
    await tx.update(expenses).set({ status: "VOIDED", voidReason: reason.trim() }).where(eq(expenses.id, id));
    await tx.insert(expenseReviews).values({ expenseId: id, reviewerId: actor.id, action: "VOIDED", comment: reason.trim() });
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "EXPENSE",
      entityId: id,
      entityRef: expense.reference,
      allocationId: expense.allocationId,
      action: "VOIDED",
      summary: `${actor.fullName} voided ${formatMoney(expense.amount)} expense (${expense.description}) — ${reason.trim()}`,
      oldValues: { status: expense.status },
      newValues: { status: "VOIDED", reason: reason.trim() },
    });
    if (!isOwner) {
      await notifyUsers(tx, [expense.staffId], {
        type: "EXPENSE_VOIDED",
        title: `Expense voided: ${formatMoney(expense.amount)}`,
        body: `${expense.description} — ${reason.trim()}`,
        link: `/expenses/${id}`,
      });
    }
    await maybeNotifyReadyToReconcile(tx, actor, expense.allocationId);
  });
}

/* ------------------------------------------------------------------ */
/* Review workflow                                                     */
/* ------------------------------------------------------------------ */

type ReviewDecision = "START" | "APPROVE" | "REJECT" | "CLARIFY";

export async function reviewExpense(actor: CurrentUser, id: string, decision: ReviewDecision, comment?: string | null) {
  if (!can(actor.role, "expenses.review")) throw forbidden();
  if ((decision === "REJECT" || decision === "CLARIFY") && !comment?.trim()) {
    throw new DomainError(
      decision === "REJECT" ? "Explain why the expense is being rejected." : "Write the question you need answered.",
      "VALIDATION",
      { comment: "Required." },
    );
  }
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update");
    const expense = rows[0];
    if (!expense) throw notFound("Expense not found.");
    const allocation = await lockAllocation(tx, expense.allocationId);
    if (allocation.organisationId !== actor.organisationId) throw notFound();
    if (expense.staffId === actor.id) throw forbidden("You cannot review your own expense.");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(expense.status))
      throw new DomainError(`This expense is ${expense.status.toLowerCase().replace("_", " ")} and is not awaiting review.`);

    const map = {
      START: { status: "UNDER_REVIEW", action: "UNDER_REVIEW", verb: "started reviewing" },
      APPROVE: { status: "APPROVED", action: "APPROVED", verb: "approved" },
      REJECT: { status: "REJECTED", action: "REJECTED", verb: "rejected" },
      CLARIFY: { status: "NEEDS_CLARIFICATION", action: "REQUEST_CLARIFICATION", verb: "requested clarification on" },
    } as const;
    const m = map[decision];
    if (decision === "START" && expense.status === "UNDER_REVIEW") return;

    await tx
      .update(expenses)
      .set({
        status: m.status,
        reviewedAt: decision === "START" ? expense.reviewedAt : new Date(),
        reviewedBy: actor.id,
      })
      .where(eq(expenses.id, id));
    await tx.insert(expenseReviews).values({ expenseId: id, reviewerId: actor.id, action: m.action, comment: comment?.trim() || null });
    // Rule 7: every approval / rejection has an audit record.
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "EXPENSE",
      entityId: id,
      entityRef: expense.reference,
      allocationId: expense.allocationId,
      action: m.action,
      summary: `${actor.fullName} ${m.verb} ${formatMoney(expense.amount)} expense — ${expense.description}${comment?.trim() ? ` ("${comment.trim()}")` : ""}`,
      oldValues: { status: expense.status },
      newValues: { status: m.status, comment: comment?.trim() || null },
    });

    if (decision !== "START") {
      const titles = {
        APPROVE: `Expense approved: ${formatMoney(expense.amount)}`,
        REJECT: `Expense needs correction: ${formatMoney(expense.amount)}`,
        CLARIFY: `Question about your ${formatMoney(expense.amount)} expense`,
      } as const;
      await notifyUsers(tx, [expense.staffId], {
        type: `EXPENSE_${decision}`,
        title: titles[decision],
        body: comment?.trim() ? `${expense.description} — "${comment.trim()}"` : expense.description,
        link: `/expenses/${id}`,
      });
    }
    if (decision === "APPROVE") await maybeNotifyReadyToReconcile(tx, actor, expense.allocationId);
  });
}

export async function bulkApprove(actor: CurrentUser, ids: string[]) {
  let approved = 0;
  const skipped: string[] = [];
  for (const id of ids.slice(0, 200)) {
    try {
      await reviewExpense(actor, id, "APPROVE", null);
      approved++;
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { approved, skipped };
}

export async function addExpenseComment(actor: CurrentUser, id: string, comment: string) {
  if (!comment?.trim()) throw new DomainError("Write a comment.", "VALIDATION", { comment: "Required." });
  const { expense } = await getExpenseDetail(actor, id);
  await db.transaction(async (tx) => {
    await tx.insert(expenseReviews).values({ expenseId: id, reviewerId: actor.id, action: "COMMENT", comment: comment.trim() });
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "EXPENSE",
      entityId: id,
      entityRef: expense.reference,
      allocationId: expense.allocationId,
      action: "COMMENTED",
      summary: `${actor.fullName} commented on ${expense.reference}: "${comment.trim()}"`,
    });
    const recipient = expense.staffId === actor.id ? (expense.reviewedBy ? [expense.reviewedBy] : []) : [expense.staffId];
    await notifyUsers(tx, recipient, {
      type: "EXPENSE_COMMENT",
      title: `${actor.fullName} commented on ${expense.reference}`,
      body: comment.trim(),
      link: `/expenses/${id}`,
    });
    if (expense.staffId === actor.id && !expense.reviewedBy) {
      await notifyRoles(tx, actor.organisationId, FINANCE_ROLES, {
        type: "EXPENSE_COMMENT",
        title: `${actor.fullName} commented on ${expense.reference}`,
        body: comment.trim(),
        link: `/expenses/${id}`,
      }, actor.id);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export async function addExpenseDocuments(actor: CurrentUser, expenseId: string, files: UploadSet) {
  const expense = await db.query.expenses.findFirst({ where: eq(expenses.id, expenseId) });
  if (!expense) throw notFound("Expense not found.");
  const allocation = await db.query.allocations.findFirst({ where: eq(allocations.id, expense.allocationId) });
  if (!allocation || allocation.organisationId !== actor.organisationId) throw notFound();
  const isOwner = expense.staffId === actor.id;
  const ownerCanAdd = isOwner && expense.status !== "VOIDED" && expense.status !== "RECONCILED";
  const financeCanAdd = can(actor.role, "expenses.review") && expense.status !== "RECONCILED";
  if (!ownerCanAdd && !financeCanAdd) throw forbidden("You can't add documents to this expense.");
  if (!files.receipts.length && !files.supporting.length) throw new DomainError("Choose a file to upload.", "VALIDATION");
  const stored = await storeUploads(actor.organisationId, files);
  await db.transaction(async (tx) => {
    for (const s of stored) {
      const [doc] = await tx
        .insert(documents)
        .values({ organisationId: actor.organisationId, kind: s.kind, expenseId, uploadedBy: actor.id, ...s.file })
        .returning();
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "DOCUMENT",
        entityId: doc.id,
        entityRef: expense.reference,
        allocationId: expense.allocationId,
        action: "UPLOADED",
        summary: `${actor.fullName} attached ${doc.fileName} to ${expense.reference}`,
      });
    }
  });
}

/** Soft-delete a document. The file and metadata are retained for audit. */
export async function removeDocument(actor: CurrentUser, documentId: string) {
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, documentId), eq(documents.organisationId, actor.organisationId)) });
  if (!doc || doc.deletedAt) throw notFound("Document not found.");
  let allowed = actor.role === "ADMIN";
  let allocationId = doc.allocationId;
  let ref: string | null = null;
  if (doc.expenseId) {
    const expense = await db.query.expenses.findFirst({ where: eq(expenses.id, doc.expenseId) });
    if (expense) {
      allocationId = expense.allocationId;
      ref = expense.reference;
      if (expense.staffId === actor.id && doc.uploadedBy === actor.id && EDITABLE_STATUSES.includes(expense.status)) allowed = true;
      if (expense.status === "RECONCILED") allowed = false;
    }
  }
  if (!allowed) throw forbidden("This document is locked. Documents can only be removed from draft or returned expenses.");
  await db.transaction(async (tx) => {
    await tx.update(documents).set({ deletedAt: new Date(), deletedBy: actor.id }).where(eq(documents.id, documentId));
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "DOCUMENT",
      entityId: documentId,
      entityRef: ref,
      allocationId,
      action: "REMOVED",
      summary: `${actor.fullName} removed ${doc.fileName}${ref ? ` from ${ref}` : ""}`,
    });
  });
}

/** Access check used by the document download route. */
export async function canAccessDocument(actor: CurrentUser, doc: { organisationId: string; expenseId: string | null; allocationId: string | null; claimId: string | null }) {
  if (doc.organisationId !== actor.organisationId) return false;
  if (can(actor.role, "documents.viewAll")) return true;
  if (doc.expenseId) {
    const e = await db.query.expenses.findFirst({ where: eq(expenses.id, doc.expenseId) });
    return !!e && e.staffId === actor.id;
  }
  if (doc.allocationId) {
    const a = await db.query.allocations.findFirst({ where: eq(allocations.id, doc.allocationId) });
    return !!a && canViewAllocation(actor, a);
  }
  if (doc.claimId) {
    const c = await db.query.claims.findFirst({ where: eq(claims.id, doc.claimId) });
    return !!c && c.staffId === actor.id;
  }
  return false;
}
