import "server-only";
import { aliasedTable, and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { allocations, claims, documents, users, type ClaimStatus, type ClaimType } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { notifyRoles, notifyUsers } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { nextReference } from "@/lib/refs";
import { storeUpload } from "@/lib/storage";
import { addAdjustment, lockAllocation } from "./allocations";
import { loadBalance } from "./balances";
import { getSettings } from "./org";

/**
 * Claims cover the over-spending workflow from the spec:
 *   staff requests additional funds / reimbursement (with evidence of approval)
 *     → accountant reviews (recommends or rejects)
 *     → admin approves
 *     → the amount is added to the allocation as an adjustment.
 */
export async function createClaim(
  actor: CurrentUser,
  input: { allocationId: string; type: ClaimType; amount: number; reason: string; authorizedBy?: string | null },
  evidence: File[],
) {
  if (!can(actor.role, "funds.own")) throw forbidden();
  const fieldErrors: Record<string, string> = {};
  if (!(input.amount > 0)) fieldErrors.amount = "Enter an amount greater than zero.";
  if (!input.reason?.trim()) fieldErrors.reason = "Explain why the extra money is needed.";
  if (input.type === "REIMBURSEMENT" && !evidence.length)
    fieldErrors.evidence = "Attach evidence of approval / authorization for the extra spending.";
  if (Object.keys(fieldErrors).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", fieldErrors);

  const pre = await db.query.allocations.findFirst({ where: eq(allocations.id, input.allocationId) });
  if (!pre || pre.organisationId !== actor.organisationId) throw notFound("Allocation not found.");
  if (pre.staffId !== actor.id) throw forbidden("You can only raise claims on your own allocations.");

  const settings = await getSettings(actor.organisationId);
  const stored: Awaited<ReturnType<typeof storeUpload>>[] = [];
  for (const f of evidence) stored.push(await storeUpload(f, settings.maxUploadMb));

  return db.transaction(async (tx) => {
    const allocation = await lockAllocation(tx, input.allocationId);
    if (allocation.status !== "ACTIVE") throw new DomainError("Claims can only be raised on an active allocation.");
    const open = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(and(eq(claims.allocationId, allocation.id), inArray(claims.status, ["SUBMITTED", "RECOMMENDED"])));
    if (open.length) throw new DomainError("There is already an open claim on this allocation. Wait for it to be decided.");

    const reference = await nextReference(tx, "CLM");
    const [claim] = await tx
      .insert(claims)
      .values({
        reference,
        allocationId: allocation.id,
        staffId: actor.id,
        type: input.type,
        amount: input.amount,
        reason: input.reason.trim(),
        authorizedBy: input.authorizedBy?.trim() || null,
      })
      .returning();
    for (const s of stored) {
      await tx.insert(documents).values({
        organisationId: actor.organisationId,
        kind: "AUTHORIZATION",
        claimId: claim.id,
        allocationId: allocation.id,
        uploadedBy: actor.id,
        ...s,
      });
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "CLAIM",
      entityId: claim.id,
      entityRef: reference,
      allocationId: allocation.id,
      action: "SUBMITTED",
      summary: `${actor.fullName} requested ${formatMoney(input.amount)} ${input.type === "REIMBURSEMENT" ? "reimbursement" : "additional funds"} — ${claim.reason}`,
      newValues: { amount: input.amount, type: input.type },
    });
    await notifyRoles(tx, actor.organisationId, ["ACCOUNTANT", "ADMIN"], {
      type: "CLAIM_SUBMITTED",
      title: `${actor.fullName} raised a ${formatMoney(input.amount)} claim`,
      body: `${allocation.purpose} — ${claim.reason}`,
      link: `/claims`,
    }, actor.id);
    return claim;
  });
}

export async function listClaims(actor: CurrentUser, status?: string) {
  const staff = aliasedTable(users, "staff");
  const conditions: SQL[] = [eq(allocations.organisationId, actor.organisationId)];
  if (!can(actor.role, "claims.review") && !can(actor.role, "allocations.viewAll")) conditions.push(eq(claims.staffId, actor.id));
  if (status === "open") conditions.push(inArray(claims.status, ["SUBMITTED", "RECOMMENDED"]));
  else if (status && status !== "all") conditions.push(eq(claims.status, status as ClaimStatus));
  const rows = await db
    .select({ claim: claims, allocation: allocations, staffFirst: staff.firstName, staffLast: staff.lastName })
    .from(claims)
    .innerJoin(allocations, eq(allocations.id, claims.allocationId))
    .innerJoin(staff, eq(staff.id, claims.staffId))
    .where(and(...conditions))
    .orderBy(desc(claims.createdAt))
    .limit(300);
  const docs = rows.length
    ? await db
        .select()
        .from(documents)
        .where(and(inArray(documents.claimId, rows.map((r) => r.claim.id)), isNull(documents.deletedAt)))
    : [];
  const balances = new Map<string, Awaited<ReturnType<typeof loadBalance>>>();
  for (const r of rows) if (!balances.has(r.allocation.id)) balances.set(r.allocation.id, await loadBalance(r.allocation.id));
  return rows.map((r) => ({
    ...r.claim,
    staffName: `${r.staffFirst} ${r.staffLast}`,
    allocationRef: r.allocation.reference,
    allocationPurpose: r.allocation.purpose,
    allocationStatus: r.allocation.status,
    balance: balances.get(r.allocation.id)!,
    documents: docs.filter((d) => d.claimId === r.claim.id),
  }));
}

export async function decideClaim(
  actor: CurrentUser,
  claimId: string,
  decision: "RECOMMEND" | "APPROVE" | "REJECT" | "CANCEL",
  comment?: string | null,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(claims).where(eq(claims.id, claimId)).for("update");
    const claim = rows[0];
    if (!claim) throw notFound("Claim not found.");
    const allocation = await lockAllocation(tx, claim.allocationId);
    if (allocation.organisationId !== actor.organisationId) throw notFound();
    if (!["SUBMITTED", "RECOMMENDED"].includes(claim.status)) throw new DomainError("This claim has already been decided.");

    if (decision === "CANCEL") {
      if (claim.staffId !== actor.id) throw forbidden();
    } else {
      if (claim.staffId === actor.id) throw forbidden("You cannot decide your own claim.");
      if (decision === "RECOMMEND" && !can(actor.role, "claims.review")) throw forbidden();
      if (decision === "APPROVE" && !can(actor.role, "claims.approve"))
        throw forbidden("Final approval of claims is reserved for administrators.");
      if (decision === "REJECT" && !can(actor.role, "claims.review")) throw forbidden();
      if (decision === "REJECT" && !comment?.trim()) throw new DomainError("Explain why the claim is rejected.", "VALIDATION", { comment: "Required." });
      if (decision === "RECOMMEND" && claim.status !== "SUBMITTED") throw new DomainError("This claim has already been reviewed.");
    }

    const now = new Date();
    const status: ClaimStatus =
      decision === "RECOMMEND" ? "RECOMMENDED" : decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CANCELLED";
    const isFinal = decision === "APPROVE" || (decision === "REJECT" && claim.status === "RECOMMENDED" && can(actor.role, "claims.approve"));
    await tx
      .update(claims)
      .set(
        decision === "RECOMMEND" || (decision === "REJECT" && !isFinal)
          ? { status, reviewedBy: actor.id, reviewedAt: now, reviewComment: comment?.trim() || null }
          : decision === "CANCEL"
            ? { status }
            : {
                status,
                decidedBy: actor.id,
                decidedAt: now,
                decisionComment: comment?.trim() || null,
                ...(claim.status === "SUBMITTED" ? { reviewedBy: actor.id, reviewedAt: now } : {}),
              },
      )
      .where(eq(claims.id, claimId));

    const verb = { RECOMMEND: "recommended", APPROVE: "approved", REJECT: "rejected", CANCEL: "cancelled" }[decision];
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "CLAIM",
      entityId: claimId,
      entityRef: claim.reference,
      allocationId: claim.allocationId,
      action: status,
      summary: `${actor.fullName} ${verb} claim ${claim.reference} for ${formatMoney(claim.amount)}${comment?.trim() ? ` ("${comment.trim()}")` : ""}`,
      oldValues: { status: claim.status },
      newValues: { status },
    });

    if (decision === "APPROVE") {
      await addAdjustment(
        actor,
        claim.allocationId,
        {
          type: claim.type === "REIMBURSEMENT" ? "REIMBURSEMENT" : "ADDITIONAL_FUNDING",
          amount: claim.amount,
          reason: `Claim ${claim.reference} approved — ${claim.reason}`,
          reference: claim.reference,
          claimId: claim.id,
        },
        tx,
      );
    }
    if (decision === "RECOMMEND") {
      await notifyRoles(tx, actor.organisationId, ["ADMIN"], {
        type: "CLAIM_RECOMMENDED",
        title: `Claim ${claim.reference} needs final approval`,
        body: `${formatMoney(claim.amount)} — ${claim.reason}`,
        link: `/claims`,
      }, actor.id);
    }
    if (decision !== "CANCEL") {
      await notifyUsers(tx, [claim.staffId], {
        type: `CLAIM_${status}`,
        title: `Your ${formatMoney(claim.amount)} claim was ${verb}`,
        body: comment?.trim() || claim.reason,
        link: `/allocations/${claim.allocationId}`,
      });
    }
  });
}

/** Suggested claim amount: whatever is needed to bring the available balance back to zero. */
export async function suggestedClaimAmount(allocationId: string) {
  const b = await loadBalance(allocationId);
  return b.overspend;
}
