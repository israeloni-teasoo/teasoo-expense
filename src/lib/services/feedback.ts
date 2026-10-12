import "server-only";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { documents, feedback, users, type FeedbackCategory, type FeedbackStatus } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { DomainError, forbidden, notFound } from "@/lib/errors";
import { notifyRoles, notifyUsers } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { storeUpload } from "@/lib/storage";
import { getSettings } from "./org";

export const FEEDBACK_CATEGORIES: Record<FeedbackCategory, string> = {
  BUG: "Something isn't working",
  IDEA: "Idea or suggestion",
  QUESTION: "Question",
  OTHER: "Other",
};

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; tone: "blue" | "purple" | "green" | "gray" }> = {
  OPEN: { label: "New", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "purple" },
  RESOLVED: { label: "Resolved", tone: "green" },
  CLOSED: { label: "Closed", tone: "gray" },
};

export async function createFeedback(
  actor: CurrentUser,
  input: { category: FeedbackCategory; subject: string; message: string; pageUrl?: string | null; userAgent?: string | null },
  screenshots: File[],
) {
  const e: Record<string, string> = {};
  if (!(input.category in FEEDBACK_CATEGORIES)) e.category = "Choose a type.";
  if (!input.message?.trim()) e.message = "Tell us what happened or what you'd like.";
  if (Object.keys(e).length) throw new DomainError("Please correct the highlighted fields.", "VALIDATION", e);
  const subject = (input.subject?.trim() || input.message.trim().split("\n")[0]).slice(0, 120);
  const settings = await getSettings(actor.organisationId);
  const stored: Awaited<ReturnType<typeof storeUpload>>[] = [];
  for (const f of screenshots.slice(0, 3)) stored.push(await storeUpload(f, settings.maxUploadMb));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(feedback)
      .values({
        organisationId: actor.organisationId,
        userId: actor.id,
        category: input.category,
        subject,
        message: input.message.trim().slice(0, 5000),
        pageUrl: input.pageUrl?.slice(0, 500) || null,
        userAgent: input.userAgent?.slice(0, 300) || null,
      })
      .returning();
    for (const s of stored) {
      await tx.insert(documents).values({ organisationId: actor.organisationId, kind: "SCREENSHOT", feedbackId: row.id, uploadedBy: actor.id, ...s });
    }
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "FEEDBACK",
      entityId: row.id,
      action: "SUBMITTED",
      summary: `${actor.fullName} sent feedback: ${subject}`,
    });
    await notifyRoles(tx, actor.organisationId, ["ADMIN"], {
      type: "FEEDBACK_NEW",
      title: `New feedback from ${actor.fullName}`,
      body: `${FEEDBACK_CATEGORIES[input.category]}: ${subject}`,
      link: `/admin/feedback?open=${row.id}`,
    }, actor.id);
    return row;
  });
}

export async function listFeedback(actor: CurrentUser, opts: { scope: "mine" | "all"; status?: string }) {
  if (opts.scope === "all" && !can(actor.role, "feedback.manage")) throw forbidden();
  const conditions: SQL[] = [eq(feedback.organisationId, actor.organisationId)];
  if (opts.scope === "mine") conditions.push(eq(feedback.userId, actor.id));
  if (opts.status === "open") conditions.push(inArray(feedback.status, ["OPEN", "IN_PROGRESS"]));
  else if (opts.status && opts.status !== "all") conditions.push(eq(feedback.status, opts.status as FeedbackStatus));
  const responder = sql<string | null>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${feedback.respondedBy})`;
  const rows = await db
    .select({ f: feedback, first: users.firstName, last: users.lastName, email: users.email, responderName: responder })
    .from(feedback)
    .innerJoin(users, eq(users.id, feedback.userId))
    .where(and(...conditions))
    .orderBy(sql`case when ${feedback.status} in ('OPEN','IN_PROGRESS') then 0 else 1 end`, desc(feedback.createdAt))
    .limit(300);
  const docs = rows.length
    ? await db
        .select({ id: documents.id, feedbackId: documents.feedbackId, fileName: documents.fileName, fileType: documents.fileType })
        .from(documents)
        .where(and(inArray(documents.feedbackId, rows.map((r) => r.f.id)), isNull(documents.deletedAt)))
    : [];
  return rows.map((r) => ({
    ...r.f,
    userName: `${r.first} ${r.last}`,
    userEmail: r.email,
    responderName: r.responderName,
    screenshots: docs.filter((d) => d.feedbackId === r.f.id),
  }));
}

export async function openFeedbackCount(orgId: string) {
  const r = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(eq(feedback.organisationId, orgId), eq(feedback.status, "OPEN")));
  return Number(r[0].n);
}

/** Admin reply and/or status change. The person who sent the feedback is notified. */
export async function respondToFeedback(actor: CurrentUser, id: string, input: { status: FeedbackStatus; response?: string | null }) {
  if (!can(actor.role, "feedback.manage")) throw forbidden();
  if (!(input.status in FEEDBACK_STATUS)) throw new DomainError("Choose a status.", "VALIDATION", { status: "Required." });
  await db.transaction(async (tx) => {
    const current = await tx.query.feedback.findFirst({ where: and(eq(feedback.id, id), eq(feedback.organisationId, actor.organisationId)) });
    if (!current) throw notFound("Feedback not found.");
    const response = input.response?.trim() || null;
    const now = new Date();
    await tx
      .update(feedback)
      .set({
        status: input.status,
        ...(response ? { response, respondedBy: actor.id, respondedAt: now } : {}),
        resolvedAt: input.status === "RESOLVED" || input.status === "CLOSED" ? (current.resolvedAt ?? now) : null,
      })
      .where(eq(feedback.id, id));
    await audit(tx, {
      organisationId: actor.organisationId,
      userId: actor.id,
      entityType: "FEEDBACK",
      entityId: id,
      action: "RESPONDED",
      summary: `${actor.fullName} marked feedback “${current.subject}” as ${FEEDBACK_STATUS[input.status].label.toLowerCase()}${response ? " and replied" : ""}`,
      oldValues: { status: current.status },
      newValues: { status: input.status, response },
    });
    if (current.userId !== actor.id && (response || input.status !== current.status)) {
      await notifyUsers(tx, [current.userId], {
        type: "FEEDBACK_REPLY",
        title: response ? `Reply to your feedback: ${current.subject}` : `Your feedback is now ${FEEDBACK_STATUS[input.status].label.toLowerCase()}`,
        body: response ?? current.subject,
        link: "/feedback",
      });
    }
  });
}
