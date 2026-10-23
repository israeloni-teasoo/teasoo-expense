import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Executor } from "@/db";
import {
  allocations,
  documents,
  expenseCategories,
  memberships,
  organisations,
  requisitionEvents,
  requisitionItems,
  requisitions,
  users,
  vendors,
  type Requisition,
  type RequisitionEventType,
  type RequisitionStatus,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { categoryLabel } from "@/lib/category-label";
import { isISODate, todayISO } from "@/lib/dates";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import type { Table } from "@/lib/export";
import { REQUISITION_STATUS } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { FINANCE_ROLES, notifyRoles, notifyUsers } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { nextReference, nextRequisitionReference, peekRequisitionNumber, requisitionCounterKey } from "@/lib/refs";
import { approversFor, defaultRequisitionPrefix, executorsFor, lineAmount, type ApprovalSettings } from "@/lib/requisition-rules";
import { storeUpload, type StoredFile } from "@/lib/storage";
import { getSettings } from "./org";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type RequisitionItemInput = {
  itemName: string;
  categoryId: string;
  categoryOther?: string | null;
  description?: string | null;
  vendorId?: string | null;
  /** Hundredths: 1.5 → 150. */
  quantity: number | null;
  /** Kobo. */
  rate: number | null;
  /** Kobo, for the whole line. */
  discount?: number | null;
};

export type RequisitionInput = {
  title: string;
  expectedDate: string;
  deliveryAddress?: string | null;
  externalReference?: string | null;
  notesToApprover?: string | null;
  projectId?: string | null;
  items: RequisitionItemInput[];
};

const EDITABLE: RequisitionStatus[] = ["DRAFT", "ON_HOLD"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function requisitionPrefix(settings: { requisitionPrefix?: string | null }, orgName: string) {
  return settings.requisitionPrefix || defaultRequisitionPrefix(orgName);
}

/** Current numbering for Settings: the prefix and the number the next requisition will get. */
export async function requisitionNumbering(orgId: string, orgName: string) {
  const prefix = requisitionPrefix(await getSettings(orgId), orgName);
  return { prefix, nextNumber: await peekRequisitionNumber(db, prefix) };
}

async function approvalSettings(orgId: string): Promise<ApprovalSettings & { requisitionPrefix?: string | null }> {
  return getSettings(orgId);
}

/** Active members of the organisation among the given ids (approvers who left don't count). */
async function activeMembers(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organisationId, orgId), inArray(users.id, ids), eq(memberships.status, "ACTIVE"), eq(users.status, "ACTIVE")));
  const ok = new Set(rows.map((r) => r.id));
  return ids.filter((id) => ok.has(id));
}

/** Who can act on a requisition right now: approvers while it awaits approval, executors once approved. */
export function actorsFor(settings: ApprovalSettings, r: Pick<Requisition, "status" | "requesterId">) {
  if (r.status === "AWAITING_APPROVAL") return approversFor(settings, r.requesterId);
  if (r.status === "APPROVED") return executorsFor(settings, r.requesterId);
  return [];
}

function isInvolved(settings: ApprovalSettings, userId: string) {
  return [settings.requisitionApproverId, settings.requisitionApproverBackupId, settings.requisitionExecutorId, settings.requisitionExecutorBackupId].includes(userId);
}

function canView(actor: CurrentUser, settings: ApprovalSettings, r: Requisition) {
  return r.requesterId === actor.id || can(actor.role, "requisitions.viewAll") || isInvolved(settings, actor.id);
}

async function event(exec: Executor, requisitionId: string, actorId: string, type: RequisitionEventType, comment?: string | null, targetUserId?: string | null) {
  // Wall-clock time (not the transaction's start time) keeps events in the order they happened.
  await exec.insert(requisitionEvents).values({ requisitionId, actorId, type, comment: comment?.trim() || null, targetUserId: targetUserId ?? null, createdAt: new Date() });
}

async function loadForUpdate(exec: Executor, actor: CurrentUser, id: string) {
  const rows = await exec.select().from(requisitions).where(and(eq(requisitions.id, id), eq(requisitions.organisationId, actor.organisationId))).for("update");
  if (!rows[0]) throw notFound("Requisition not found.");
  return rows[0];
}

async function validateInput(actor: CurrentUser, input: RequisitionInput) {
  const e: Record<string, string> = {};
  if (!input.title?.trim()) e.title = "Say what the money is for.";
  if (!isISODate(input.expectedDate ?? "")) e.expectedDate = "Enter the date you need it by.";
  if (!input.items?.length) throw new DomainError("Add at least one item.", "VALIDATION", { items: "Add at least one item." });

  const catIds = [...new Set(input.items.map((i) => i.categoryId).filter(Boolean))];
  const vendorIds = [...new Set(input.items.map((i) => i.vendorId).filter((v): v is string => !!v))];
  const [cats, vends] = await Promise.all([
    catIds.length
      ? db.select().from(expenseCategories).where(and(eq(expenseCategories.organisationId, actor.organisationId), inArray(expenseCategories.id, catIds)))
      : [],
    vendorIds.length ? db.select().from(vendors).where(and(eq(vendors.organisationId, actor.organisationId), inArray(vendors.id, vendorIds))) : [],
  ]);

  const items = input.items.map((item, i) => {
    const n = i + 1;
    const cat = cats.find((c) => c.id === item.categoryId);
    if (!item.itemName?.trim()) e[`items.${i}.itemName`] = `Item ${n}: enter the item name.`;
    if (!cat) e[`items.${i}.categoryId`] = `Item ${n}: choose a category.`;
    else if (cat.isOther && !item.categoryOther?.trim()) e[`items.${i}.categoryOther`] = `Item ${n}: type the category.`;
    if (item.vendorId && !vends.some((v) => v.id === item.vendorId)) e[`items.${i}.vendorId`] = `Item ${n}: choose a saved vendor.`;
    if (!item.quantity || item.quantity <= 0) e[`items.${i}.quantity`] = `Item ${n}: quantity must be more than zero.`;
    if (!item.rate || item.rate <= 0) e[`items.${i}.rate`] = `Item ${n}: enter the estimated price.`;
    const discount = Math.max(item.discount ?? 0, 0);
    const gross = Math.round(((item.quantity ?? 0) * (item.rate ?? 0)) / 100);
    if (discount > gross) e[`items.${i}.discount`] = `Item ${n}: the discount is more than the line total.`;
    return {
      position: i,
      itemName: item.itemName?.trim() ?? "",
      categoryId: cat?.id ?? null,
      categoryOther: cat?.isOther ? item.categoryOther?.trim() || null : null,
      description: item.description?.trim() || null,
      vendorId: item.vendorId || null,
      quantity: item.quantity ?? 0,
      rate: item.rate ?? 0,
      discount,
      amount: lineAmount(item.quantity ?? 0, item.rate ?? 0, discount),
    };
  });
  if (Object.keys(e).length) {
    const first = Object.values(e)[0];
    throw new DomainError(Object.keys(e).length === 1 ? first : `Please correct the highlighted fields. ${first}`, "VALIDATION", e);
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total <= 0) throw new DomainError("The requisition total must be more than zero.", "VALIDATION");
  return { items, total };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type RequisitionScope = "mine" | "pending" | "all";

export async function listRequisitions(actor: CurrentUser, opts: { scope: RequisitionScope; status?: RequisitionStatus | "open" | "all"; q?: string }) {
  const settings = await approvalSettings(actor.organisationId);
  const requester = alias(users, "requester");
  const approver = alias(users, "approver");
  const c: SQL[] = [eq(requisitions.organisationId, actor.organisationId)];
  const seeAll = can(actor.role, "requisitions.viewAll") || isInvolved(settings, actor.id);
  if (opts.scope === "mine" || !seeAll) c.push(eq(requisitions.requesterId, actor.id));
  if (opts.scope === "pending") c.push(inArray(requisitions.status, ["AWAITING_APPROVAL", "APPROVED"]));
  if (opts.status === "open") c.push(inArray(requisitions.status, ["DRAFT", "AWAITING_APPROVAL", "ON_HOLD", "APPROVED"]));
  else if (opts.status && opts.status !== "all") c.push(eq(requisitions.status, opts.status));
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    c.push(sql`(${requisitions.reference} ilike ${like} or ${requisitions.title} ilike ${like} or ${requester.firstName} || ' ' || ${requester.lastName} ilike ${like})`);
  }
  const rows = await db
    .select({
      r: requisitions,
      requesterFirst: requester.firstName,
      requesterLast: requester.lastName,
      approverFirst: approver.firstName,
      approverLast: approver.lastName,
      itemCount: sql<number>`(select count(*)::int from ${requisitionItems} i where i.requisition_id = ${requisitions.id})`,
    })
    .from(requisitions)
    .innerJoin(requester, eq(requester.id, requisitions.requesterId))
    .leftJoin(approver, eq(approver.id, requisitions.currentApproverId))
    .where(and(...c))
    .orderBy(desc(sql`coalesce(${requisitions.submittedAt}, ${requisitions.createdAt})`))
    .limit(300);
  const list = rows.map((x) => ({
    ...x.r,
    requesterName: `${x.requesterFirst} ${x.requesterLast}`,
    approverName: x.approverFirst ? `${x.approverFirst} ${x.approverLast}` : null,
    itemCount: Number(x.itemCount),
    canAct: actorsFor(settings, x.r).includes(actor.id),
  }));
  return opts.scope === "pending" ? list.filter((r) => r.canAct) : list;
}

/** Requisitions waiting on this person (for the navigation badge). */
export async function pendingRequisitionCount(actor: CurrentUser) {
  const settings = await approvalSettings(actor.organisationId);
  if (!isInvolved(settings, actor.id)) return 0;
  const rows = await db
    .select({ status: requisitions.status, requesterId: requisitions.requesterId })
    .from(requisitions)
    .where(and(eq(requisitions.organisationId, actor.organisationId), inArray(requisitions.status, ["AWAITING_APPROVAL", "APPROVED"])));
  return rows.filter((r) => actorsFor(settings, r).includes(actor.id)).length;
}

export async function getRequisition(actor: CurrentUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Requisition not found.");
  const r = await db.query.requisitions.findFirst({ where: and(eq(requisitions.id, id), eq(requisitions.organisationId, actor.organisationId)) });
  if (!r) throw notFound("Requisition not found.");
  const settings = await approvalSettings(actor.organisationId);
  if (!canView(actor, settings, r)) throw notFound("Requisition not found.");

  const eventActor = alias(users, "event_actor");
  const target = alias(users, "event_target");
  const uploader = alias(users, "uploader");
  const [requester, items, events, docs, nameRows] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, r.requesterId) }),
    db
      .select({ item: requisitionItems, categoryName: expenseCategories.name, vendor: vendors })
      .from(requisitionItems)
      .leftJoin(expenseCategories, eq(expenseCategories.id, requisitionItems.categoryId))
      .leftJoin(vendors, eq(vendors.id, requisitionItems.vendorId))
      .where(eq(requisitionItems.requisitionId, id))
      .orderBy(asc(requisitionItems.position)),
    db
      .select({ e: requisitionEvents, first: eventActor.firstName, last: eventActor.lastName, targetFirst: target.firstName, targetLast: target.lastName })
      .from(requisitionEvents)
      .innerJoin(eventActor, eq(eventActor.id, requisitionEvents.actorId))
      .leftJoin(target, eq(target.id, requisitionEvents.targetUserId))
      .where(eq(requisitionEvents.requisitionId, id))
      .orderBy(asc(requisitionEvents.createdAt)),
    db
      .select({ doc: documents, first: uploader.firstName, last: uploader.lastName })
      .from(documents)
      .innerJoin(uploader, eq(uploader.id, documents.uploadedBy))
      .where(and(eq(documents.requisitionId, id), isNull(documents.deletedAt)))
      .orderBy(asc(documents.uploadedAt)),
    db.select({ id: users.id, first: users.firstName, last: users.lastName, email: users.email }).from(users).where(
      inArray(users.id, [
        ...new Set(
          [
            r.currentApproverId,
            r.approvedBy,
            r.processedBy,
            ...approversFor(settings, r.requesterId),
            ...executorsFor(settings, r.requesterId),
          ].filter((x): x is string => !!x),
        ),
        "00000000-0000-0000-0000-000000000000",
      ]),
    ),
  ]);
  const name = (uid: string | null | undefined) => {
    const u = nameRows.find((n) => n.id === uid);
    return u ? `${u.first} ${u.last}` : null;
  };
  const actors = actorsFor(settings, r);
  const isRequester = r.requesterId === actor.id;
  return {
    requisition: r,
    requester: requester ? { id: requester.id, name: `${requester.firstName} ${requester.lastName}`, email: requester.email, jobTitle: requester.jobTitle } : null,
    items: items.map((x) => ({ ...x.item, categoryLabel: categoryLabel(x.categoryName, x.item.categoryOther), vendor: x.vendor })),
    events: events.map((x) => ({
      ...x.e,
      actorName: `${x.first} ${x.last}`,
      targetName: x.targetFirst ? `${x.targetFirst} ${x.targetLast}` : null,
    })),
    documents: docs.map((d) => ({ ...d.doc, uploaderName: `${d.first} ${d.last}` })),
    names: {
      currentApprover: name(r.currentApproverId),
      approvedBy: name(r.approvedBy),
      processedBy: name(r.processedBy),
      approvers: approversFor(settings, r.requesterId).map(name).filter(Boolean) as string[],
      executors: executorsFor(settings, r.requesterId).map(name).filter(Boolean) as string[],
    },
    can: {
      edit: isRequester && EDITABLE.includes(r.status),
      submit: isRequester && EDITABLE.includes(r.status),
      recall: isRequester && r.status === "AWAITING_APPROVAL",
      cancel: isRequester && ["DRAFT", "AWAITING_APPROVAL", "ON_HOLD"].includes(r.status),
      approve: r.status === "AWAITING_APPROVAL" && actors.includes(actor.id),
      process: r.status === "APPROVED" && actors.includes(actor.id),
      comment: !["CANCELLED"].includes(r.status),
    },
  };
}

/** The Requisitions list as an export table (respects what the person can see). */
export async function requisitionTable(actor: CurrentUser, sp: Record<string, string>): Promise<Table<Awaited<ReturnType<typeof listRequisitions>>[number]>> {
  const scope = (["mine", "pending", "all"].includes(sp.view) ? sp.view : "all") as RequisitionScope;
  const status = (sp.status && (sp.status === "open" || sp.status in REQUISITION_STATUS) ? sp.status : "all") as RequisitionStatus | "open" | "all";
  const rows = await listRequisitions(actor, { scope, status, q: sp.q });
  return {
    title: "Requisitions",
    subtitle: status === "all" ? "All statuses" : status === "open" ? "Open" : REQUISITION_STATUS[status].label,
    columns: [
      { header: "Reference", key: "reference", value: (r) => r.reference, width: 16 },
      { header: "Title", key: "title", value: (r) => r.title, width: 36 },
      { header: "Requested by", key: "requester", value: (r) => r.requesterName },
      { header: "Submitted", key: "submitted", type: "date", value: (r) => (r.submittedAt ? r.submittedAt.toISOString().slice(0, 10) : "") },
      { header: "Needed by", key: "expected", type: "date", value: (r) => r.expectedDate },
      { header: "Status", key: "status", value: (r) => REQUISITION_STATUS[r.status].label },
      { header: "With", key: "with", value: (r) => r.approverName ?? "" },
      { header: "Paid on", key: "paid", type: "date", value: (r) => r.paymentDate ?? "" },
      { header: "Payment ref", key: "payref", value: (r) => r.paymentReference ?? "" },
      { header: "Items", key: "items", type: "number", value: (r) => r.itemCount },
      { header: "Total", key: "total", type: "money", value: (r) => r.total },
    ],
    rows,
    totals: { total: rows.reduce((s, r) => s + r.total, 0), reference: `TOTAL (${rows.length})` },
  };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

async function storeFiles(orgId: string, files: File[]) {
  const settings = await getSettings(orgId);
  const out: StoredFile[] = [];
  for (const f of files) out.push(await storeUpload(f, settings.maxUploadMb));
  return out;
}

/** Notifies whoever must approve next. */
async function routeForApproval(exec: Executor, actor: CurrentUser, r: Requisition, approverIds: string[], resubmitted: boolean) {
  await notifyUsers(exec, approverIds, {
    organisationId: actor.organisationId,
    type: "REQUISITION_SUBMITTED",
    title: `${resubmitted ? "Updated requisition" : "Requisition"} from ${actor.fullName}: ${formatMoney(r.total)}`,
    body: `${r.reference} — ${r.title}. Needed by ${r.expectedDate}.`,
    link: `/requisitions/${r.id}`,
  });
}

/**
 * Creates or edits a requisition (drafts, or ones sent back for more information) and optionally
 * submits it for approval.
 */
export async function saveRequisition(actor: CurrentUser, id: string | null, input: RequisitionInput, files: File[], opts: { submit: boolean; comment?: string | null }) {
  if (!can(actor.role, "requisitions.create")) throw forbidden();
  const { items, total } = await validateInput(actor, input);
  const settings = await approvalSettings(actor.organisationId);
  let approvers: string[] = [];
  if (opts.submit) {
    approvers = await activeMembers(actor.organisationId, approversFor(settings, actor.id));
    if (!approvers.length)
      throw new DomainError("Requisition approvals aren't set up yet. Ask an administrator to choose the approver and the person who pays in Settings → Requisitions. You can save this as a draft meanwhile.");
  }
  const stored = await storeFiles(actor.organisationId, files);

  return db.transaction(async (tx) => {
    const values = {
      title: input.title.trim(),
      expectedDate: input.expectedDate,
      deliveryAddress: input.deliveryAddress?.trim() || null,
      externalReference: input.externalReference?.trim() || null,
      notesToApprover: input.notesToApprover?.trim() || null,
      projectId: input.projectId || null,
      total,
      updatedAt: new Date(),
    };
    let row: Requisition;
    let wasOnHold = false;
    if (id) {
      const current = await loadForUpdate(tx, actor, id);
      if (current.requesterId !== actor.id) throw forbidden("You can only edit your own requisitions.");
      if (!EDITABLE.includes(current.status)) throw new DomainError("This requisition can no longer be edited. Recall it first if it's awaiting approval.");
      wasOnHold = current.status === "ON_HOLD";
      [row] = await tx.update(requisitions).set(values).where(eq(requisitions.id, id)).returning();
      await tx.delete(requisitionItems).where(eq(requisitionItems.requisitionId, id));
    } else {
      const reference = await nextRequisitionReference(tx, requisitionPrefix(settings, actor.organisation.name));
      [row] = await tx
        .insert(requisitions)
        .values({ ...values, organisationId: actor.organisationId, reference, requesterId: actor.id, departmentId: actor.departmentId ?? null })
        .returning();
      await event(tx, row.id, actor.id, "CREATED");
    }
    await tx.insert(requisitionItems).values(items.map((i) => ({ ...i, requisitionId: row.id })));
    for (const f of stored) {
      await tx.insert(documents).values({ organisationId: actor.organisationId, kind: "QUOTE", requisitionId: row.id, uploadedBy: actor.id, ...f });
    }
    if (opts.submit) {
      [row] = await tx
        .update(requisitions)
        .set({ status: "AWAITING_APPROVAL", submittedAt: new Date(), currentApproverId: approvers[0], decidedAt: null, decisionReason: null })
        .where(eq(requisitions.id, row.id))
        .returning();
      await event(tx, row.id, actor.id, wasOnHold ? "RESUBMITTED" : "SUBMITTED", opts.comment, approvers[0]);
      await routeForApproval(tx, actor, row, approvers, wasOnHold);
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "REQUISITION",
      entityId: row.id,
      entityRef: row.reference,
      action: opts.submit ? (wasOnHold ? "RESUBMITTED" : "SUBMITTED") : id ? "UPDATED" : "CREATED",
      summary: `${actor.fullName} ${opts.submit ? (wasOnHold ? "resubmitted" : "submitted") : id ? "updated" : "drafted"} requisition ${row.reference} for ${formatMoney(total)} — ${row.title}`,
      newValues: { total, items: items.length, title: row.title },
    });
    return row;
  });
}

/** Requester takes back a requisition that hasn't been decided yet, to change it. */
export async function recallRequisition(actor: CurrentUser, id: string) {
  await db.transaction(async (tx) => {
    const r = await loadForUpdate(tx, actor, id);
    if (r.requesterId !== actor.id) throw forbidden();
    if (r.status !== "AWAITING_APPROVAL") throw new DomainError("Only requisitions awaiting approval can be recalled.");
    await tx.update(requisitions).set({ status: "DRAFT", currentApproverId: null, updatedAt: new Date() }).where(eq(requisitions.id, id));
    await event(tx, id, actor.id, "RECALLED");
    await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "REQUISITION", entityId: id, entityRef: r.reference, action: "RECALLED", summary: `${actor.fullName} recalled ${r.reference} for changes` });
  });
}

export async function cancelRequisition(actor: CurrentUser, id: string, reason?: string | null) {
  await db.transaction(async (tx) => {
    const r = await loadForUpdate(tx, actor, id);
    if (r.requesterId !== actor.id) throw forbidden();
    if (!["DRAFT", "AWAITING_APPROVAL", "ON_HOLD"].includes(r.status)) throw new DomainError("This requisition can no longer be cancelled.");
    await tx.update(requisitions).set({ status: "CANCELLED", currentApproverId: null, updatedAt: new Date() }).where(eq(requisitions.id, id));
    await event(tx, id, actor.id, "CANCELLED", reason);
    await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "REQUISITION", entityId: id, entityRef: r.reference, action: "CANCELLED", summary: `${actor.fullName} cancelled ${r.reference}` });
  });
}

/**
 * The approver's decision: approve (it moves on to whoever pays), decline (with a reason) or put
 * on hold asking for more information. Whoever pays can also decline an approved requisition.
 */
export async function decideRequisition(actor: CurrentUser, id: string, decision: "APPROVE" | "REJECT" | "HOLD", comment?: string | null) {
  if ((decision === "REJECT" || decision === "HOLD") && !comment?.trim())
    throw new DomainError(decision === "REJECT" ? "Give a reason for declining." : "Say what information you need.", "VALIDATION", { comment: "Required." });
  const settings = await approvalSettings(actor.organisationId);
  return db.transaction(async (tx) => {
    const r = await loadForUpdate(tx, actor, id);
    const actors = actorsFor(settings, r);
    if (!actors.includes(actor.id)) throw forbidden("This requisition isn't waiting for you.");
    if (r.status === "APPROVED" && decision !== "REJECT") throw new DomainError("It's already approved — record the payment or decline it.");
    if (r.status !== "AWAITING_APPROVAL" && r.status !== "APPROVED") throw new DomainError("This requisition isn't awaiting a decision.");

    const now = new Date();
    if (decision === "APPROVE") {
      const executors = await activeMembers(actor.organisationId, executorsFor(settings, r.requesterId));
      if (!executors.length) throw new DomainError("Nobody is set up to pay approved requisitions. Ask an administrator to choose them in Settings → Requisitions.");
      await tx.update(requisitions).set({ status: "APPROVED", approvedAt: now, approvedBy: actor.id, currentApproverId: executors[0], updatedAt: now }).where(eq(requisitions.id, id));
      await event(tx, id, actor.id, "APPROVED", comment, executors[0]);
      await notifyUsers(tx, [r.requesterId], {
        organisationId: actor.organisationId,
        type: "REQUISITION_APPROVED",
        title: `${r.reference} approved by ${actor.fullName}`,
        body: `${formatMoney(r.total)} — ${r.title}. It's now with the person who pays.${comment?.trim() ? ` Note: ${comment.trim()}` : ""}`,
        link: `/requisitions/${id}`,
      });
      await notifyUsers(tx, executors, {
        organisationId: actor.organisationId,
        type: "REQUISITION_TO_PAY",
        title: `Approved requisition to pay: ${formatMoney(r.total)}`,
        body: `${r.reference} — ${r.title}. Approved by ${actor.fullName}.`,
        link: `/requisitions/${id}`,
      });
    } else if (decision === "REJECT") {
      await tx.update(requisitions).set({ status: "REJECTED", decidedAt: now, decisionReason: comment!.trim(), currentApproverId: null, updatedAt: now }).where(eq(requisitions.id, id));
      await event(tx, id, actor.id, "REJECTED", comment);
      await notifyUsers(tx, [r.requesterId], {
        organisationId: actor.organisationId,
        type: "REQUISITION_REJECTED",
        title: `${r.reference} was declined`,
        body: `${actor.fullName}: ${comment!.trim()}`,
        link: `/requisitions/${id}`,
      });
    } else {
      await tx.update(requisitions).set({ status: "ON_HOLD", decisionReason: comment!.trim(), currentApproverId: null, updatedAt: now }).where(eq(requisitions.id, id));
      await event(tx, id, actor.id, "INFO_REQUESTED", comment);
      await notifyUsers(tx, [r.requesterId], {
        organisationId: actor.organisationId,
        type: "REQUISITION_ON_HOLD",
        title: `More information needed on ${r.reference}`,
        body: `${actor.fullName}: ${comment!.trim()}`,
        link: `/requisitions/${id}`,
      });
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "REQUISITION",
      entityId: id,
      entityRef: r.reference,
      action: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "INFO_REQUESTED",
      summary: `${actor.fullName} ${decision === "APPROVE" ? "approved" : decision === "REJECT" ? "declined" : "asked for more information on"} ${r.reference} (${formatMoney(r.total)})${comment?.trim() ? ` — "${comment.trim()}"` : ""}`,
    });
  });
}

export type PaymentInput = {
  paymentDate: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  /** VENDOR: paid straight to the supplier(s). REQUESTER: money given to the requester as an allocation to account for. */
  payTo: "VENDOR" | "REQUESTER";
};

/** The executor (e.g. Managing Partner) records that an approved requisition has been paid. */
export async function processRequisition(actor: CurrentUser, id: string, input: PaymentInput, proof: File[]) {
  const e: Record<string, string> = {};
  if (!isISODate(input.paymentDate ?? "")) e.paymentDate = "Enter the payment date.";
  else if (input.paymentDate > todayISO()) e.paymentDate = "The payment date can't be in the future.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
  const settings = await approvalSettings(actor.organisationId);
  const pre = await db.query.requisitions.findFirst({ where: and(eq(requisitions.id, id), eq(requisitions.organisationId, actor.organisationId)) });
  if (!pre) throw notFound("Requisition not found.");
  if (!actorsFor(settings, pre).includes(actor.id)) throw forbidden("This requisition isn't waiting for you.");
  const stored = await storeFiles(actor.organisationId, proof);

  return db.transaction(async (tx) => {
    const r = await loadForUpdate(tx, actor, id);
    if (r.status !== "APPROVED") throw new DomainError("Only approved requisitions can be paid.");
    const now = new Date();
    let allocationId: string | null = null;
    if (input.payTo === "REQUESTER") {
      const requester = await tx.query.users.findFirst({ where: eq(users.id, r.requesterId) });
      const allocRef = await nextReference(tx, "AL", Number(input.paymentDate.slice(0, 4)));
      const [alloc] = await tx
        .insert(allocations)
        .values({
          organisationId: actor.organisationId,
          reference: allocRef,
          kind: "ADVANCE",
          staffId: r.requesterId,
          departmentId: r.departmentId,
          projectId: r.projectId,
          purpose: r.title,
          initialAmount: r.total,
          dateReceived: input.paymentDate,
          expectedCompletionDate: r.expectedDate >= input.paymentDate ? r.expectedDate : null,
          transferReference: input.paymentReference?.trim() || null,
          fundingSource: `Requisition ${r.reference}`,
          approvingOfficer: actor.fullName,
          notes: input.notes?.trim() || null,
          createdBy: actor.id,
        })
        .returning();
      allocationId = alloc.id;
      await audit(tx, {
        organisationId: actor.organisationId,
        userId: actor.id,
        entityType: "ALLOCATION",
        entityId: alloc.id,
        entityRef: allocRef,
        allocationId: alloc.id,
        action: "CREATED",
        summary: `${actor.fullName} created allocation ${allocRef} of ${formatMoney(r.total)} for ${requester?.firstName} ${requester?.lastName} from requisition ${r.reference}`,
      });
    }
    await tx
      .update(requisitions)
      .set({
        status: "PROCESSED",
        processedAt: now,
        processedBy: actor.id,
        currentApproverId: null,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod || null,
        paymentReference: input.paymentReference?.trim() || null,
        paymentNotes: input.notes?.trim() || null,
        allocationId,
        updatedAt: now,
      })
      .where(eq(requisitions.id, id));
    for (const f of stored) {
      await tx.insert(documents).values({ organisationId: actor.organisationId, kind: "PAYMENT_PROOF", requisitionId: id, allocationId, uploadedBy: actor.id, ...f });
    }
    await event(tx, id, actor.id, "PROCESSED", input.notes);
    await notifyUsers(tx, [r.requesterId], {
      organisationId: actor.organisationId,
      type: "REQUISITION_PAID",
      title: `${r.reference} has been paid`,
      body:
        input.payTo === "REQUESTER"
          ? `${formatMoney(r.total)} was sent to you for ${r.title}. Log your expenses and receipts against it.`
          : `${formatMoney(r.total)} — ${r.title}. Paid on ${input.paymentDate}${input.paymentReference?.trim() ? ` (ref ${input.paymentReference.trim()})` : ""}.`,
      link: allocationId ? `/allocations/${allocationId}` : `/requisitions/${id}`,
    });
    await notifyRoles(
      tx,
      actor.organisationId,
      FINANCE_ROLES,
      { type: "REQUISITION_PAID", title: `${r.reference} paid by ${actor.fullName}: ${formatMoney(r.total)}`, body: r.title, link: `/requisitions/${id}` },
      actor.id,
    );
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "REQUISITION",
      entityId: id,
      entityRef: r.reference,
      allocationId,
      action: "PROCESSED",
      summary: `${actor.fullName} paid ${r.reference} (${formatMoney(r.total)})${input.payTo === "REQUESTER" ? " to the requester as an allocation" : ""}${input.paymentReference?.trim() ? `, ref ${input.paymentReference.trim()}` : ""}`,
      newValues: { paymentDate: input.paymentDate, paymentMethod: input.paymentMethod, paymentReference: input.paymentReference, payTo: input.payTo },
    });
    return { allocationId };
  });
}

/** A note on the requisition's history; tells the other side (requester ↔ approver/payer). */
export async function commentOnRequisition(actor: CurrentUser, id: string, comment: string, files: File[] = []) {
  if (!comment?.trim() && !files.length) throw new DomainError("Write a message or attach a file.", "VALIDATION", { comment: "Required." });
  const settings = await approvalSettings(actor.organisationId);
  const pre = await db.query.requisitions.findFirst({ where: and(eq(requisitions.id, id), eq(requisitions.organisationId, actor.organisationId)) });
  if (!pre || !canView(actor, settings, pre)) throw notFound("Requisition not found.");
  if (pre.status === "CANCELLED") throw new DomainError("This requisition was cancelled.");
  const stored = await storeFiles(actor.organisationId, files);
  await db.transaction(async (tx) => {
    const text = comment?.trim() || `Added ${stored.length} file${stored.length === 1 ? "" : "s"}`;
    await event(tx, id, actor.id, "COMMENT", text);
    for (const f of stored) {
      await tx.insert(documents).values({ organisationId: actor.organisationId, kind: "QUOTE", requisitionId: id, uploadedBy: actor.id, ...f });
    }
    const others =
      pre.requesterId === actor.id
        ? actorsFor(settings, pre).length
          ? actorsFor(settings, pre)
          : [pre.approvedBy, pre.currentApproverId].filter((x): x is string => !!x)
        : [pre.requesterId];
    await notifyUsers(tx, others.filter((u) => u !== actor.id), {
      organisationId: actor.organisationId,
      type: "REQUISITION_COMMENT",
      title: `${actor.fullName} commented on ${pre.reference}`,
      body: text,
      link: `/requisitions/${id}`,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Approval settings                                                   */
/* ------------------------------------------------------------------ */

export async function saveRequisitionApprovers(
  actor: CurrentUser,
  input: {
    approverId?: string | null;
    approverBackupId?: string | null;
    executorId?: string | null;
    executorBackupId?: string | null;
    prefix?: string | null;
    nextNumber?: number | null;
  },
) {
  if (!can(actor.role, "admin.config")) throw forbidden();
  const prefix = input.prefix?.trim().toUpperCase() || null;
  if (prefix && !/^[A-Z0-9]{1,6}$/.test(prefix)) throw new DomainError("Use up to 6 letters or digits for the prefix.", "VALIDATION", { prefix: "Letters and digits only." });
  if (input.nextNumber != null && (!Number.isInteger(input.nextNumber) || input.nextNumber < 1 || input.nextNumber > 9_999_999))
    throw new DomainError("Enter a whole number for the next requisition number.", "VALIDATION", { nextNumber: "Whole number." });
  const ids = [input.approverId, input.approverBackupId, input.executorId, input.executorBackupId].filter((x): x is string => !!x);
  const ok = await activeMembers(actor.organisationId, [...new Set(ids)]);
  if (ok.length !== new Set(ids).size) throw new DomainError("Choose active members of this organisation.", "VALIDATION");
  if (!input.approverId) throw new DomainError("Choose who approves requisitions.", "VALIDATION", { approverId: "Required." });
  if (!input.executorId) throw new DomainError("Choose who pays approved requisitions.", "VALIDATION", { executorId: "Required." });
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, actor.organisationId) });
  if (!org) throw notFound();
  const next = {
    ...org.settings,
    requisitionApproverId: input.approverId || null,
    requisitionApproverBackupId: input.approverBackupId || null,
    requisitionExecutorId: input.executorId || null,
    requisitionExecutorBackupId: input.executorBackupId || null,
    // Stored explicitly so renaming the organisation doesn't change its requisition numbers.
    requisitionPrefix: prefix || org.settings.requisitionPrefix || defaultRequisitionPrefix(org.name),
  };
  const effectivePrefix = requisitionPrefix(next, org.name);
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ settings: next }).where(eq(organisations.id, actor.organisationId));
    if (input.nextNumber != null) {
      // Numbers already used can't be handed out again (references are unique).
      const upcoming = await peekRequisitionNumber(tx, effectivePrefix);
      if (input.nextNumber < upcoming)
        throw new DomainError(`${effectivePrefix}-PR numbers up to ${upcoming - 1} are already used. The next number must be ${upcoming} or higher.`, "VALIDATION", {
          nextNumber: `At least ${upcoming}.`,
        });
      if (input.nextNumber > upcoming) {
        await tx.execute(sql`
          INSERT INTO counters (key, value) VALUES (${requisitionCounterKey(effectivePrefix)}, ${input.nextNumber - 1})
          ON CONFLICT (key) DO UPDATE SET value = ${input.nextNumber - 1}
        `);
      }
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "SETTINGS",
      entityId: actor.organisationId,
      action: "REQUISITION_APPROVERS",
      summary: `${actor.fullName} updated who approves and pays requisitions`,
      oldValues: {
        approver: org.settings.requisitionApproverId ?? null,
        approverBackup: org.settings.requisitionApproverBackupId ?? null,
        executor: org.settings.requisitionExecutorId ?? null,
        executorBackup: org.settings.requisitionExecutorBackupId ?? null,
      },
      newValues: { approver: next.requisitionApproverId, approverBackup: next.requisitionApproverBackupId, executor: next.requisitionExecutorId, executorBackup: next.requisitionExecutorBackupId },
    });
  });
}

/** Document access for requisition files: anyone who can see the requisition. */
export async function canAccessRequisitionDocument(actor: CurrentUser, requisitionId: string) {
  const r = await db.query.requisitions.findFirst({ where: eq(requisitions.id, requisitionId) });
  if (!r || r.organisationId !== actor.organisationId) return false;
  return canView(actor, await approvalSettings(actor.organisationId), r);
}

/* ------------------------------------------------------------------ */
/* Vendors                                                             */
/* ------------------------------------------------------------------ */

export type VendorInput = {
  name: string;
  accountName?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  archived?: boolean;
};

export async function listVendors(orgId: string, opts: { includeArchived?: boolean } = {}) {
  const c: SQL[] = [eq(vendors.organisationId, orgId)];
  if (!opts.includeArchived) c.push(eq(vendors.archived, false));
  return db.select().from(vendors).where(and(...c)).orderBy(asc(vendors.name));
}

/** Anyone raising requisitions can add a vendor; editing and archiving is for finance. */
export async function saveVendor(actor: CurrentUser, id: string | null, input: VendorInput) {
  if (id ? !can(actor.role, "vendors.manage") : !can(actor.role, "requisitions.create")) throw forbidden();
  const e: Record<string, string> = {};
  if (!input.name?.trim()) e.name = "Required.";
  if (input.accountNumber && !/^\d{6,20}$/.test(input.accountNumber.replace(/\s/g, ""))) e.accountNumber = "Use digits only.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) e.email = "Enter a valid email.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
  const values = {
    name: input.name.trim(),
    accountName: input.accountName?.trim() || null,
    accountNumber: input.accountNumber?.replace(/\s/g, "") || null,
    bankName: input.bankName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    archived: id ? (input.archived ?? false) : false,
  };
  return db.transaction(async (tx) => {
    const dupe = await tx.query.vendors.findFirst({
      where: and(eq(vendors.organisationId, actor.organisationId), sql`lower(${vendors.name}) = ${values.name.toLowerCase()}`, id ? sql`${vendors.id} <> ${id}` : undefined),
    });
    if (dupe) throw new DomainError("A vendor with that name already exists.", "VALIDATION", { name: "Already exists." });
    if (id) {
      const current = await tx.query.vendors.findFirst({ where: and(eq(vendors.id, id), eq(vendors.organisationId, actor.organisationId)) });
      if (!current) throw notFound();
      const [row] = await tx.update(vendors).set({ ...values, updatedAt: new Date() }).where(eq(vendors.id, id)).returning();
      await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "VENDOR", entityId: id, entityRef: values.name, action: "UPDATED", summary: `${actor.fullName} updated vendor ${values.name}` });
      return row;
    }
    const [row] = await tx.insert(vendors).values({ ...values, organisationId: actor.organisationId, createdBy: actor.id }).returning();
    await audit(tx, { organisationId: actor.organisationId, userId: actor.id, entityType: "VENDOR", entityId: row.id, entityRef: values.name, action: "CREATED", summary: `${actor.fullName} added vendor ${values.name}` });
    return row;
  });
}
