import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { requisitionPdf, requisitionPdfFileName } from "@/lib/requisition-pdf";
import { getOrg } from "@/lib/services/org";
import { getRequisition } from "@/lib/services/requisitions";
import { storage } from "@/lib/storage";

/** GET /api/requisitions/[id]/pdf — the purchase request as a branded PDF (Purchase_Request_TC-PR-00101.pdf). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let d: Awaited<ReturnType<typeof getRequisition>>;
  try {
    d = await getRequisition(user, id);
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
  const r = d.requisition;
  const org = await getOrg(user.organisationId);
  let logo: { data: Uint8Array; type: string } | null = null;
  if (org.logoKey && org.logoType) {
    try {
      logo = { data: new Uint8Array(await storage().get(org.logoKey)), type: org.logoType };
    } catch {
      logo = null;
    }
  }
  // "Submitted to": whoever the latest submission went to.
  const lastSubmission = [...d.events].reverse().find((e) => e.type === "SUBMITTED" || e.type === "RESUBMITTED");
  const submittedToUser = lastSubmission?.targetUserId ? await db.query.users.findFirst({ where: eq(users.id, lastSubmission.targetUserId) }) : null;
  const dept = r.departmentId ? await db.query.departments.findFirst({ where: eq(departments.id, r.departmentId) }) : null;

  const pdf = requisitionPdf({
    organisation: {
      name: org.name,
      logo,
      address: org.settings.contactAddress,
      email: org.settings.contactEmail,
      phone: org.settings.contactPhone,
      website: org.settings.website,
    },
    requisition: r,
    requester: d.requester ? { name: d.requester.name, email: d.requester.email } : null,
    submittedTo: submittedToUser ? { name: `${submittedToUser.firstName} ${submittedToUser.lastName}`, email: submittedToUser.email } : null,
    department: dept?.name ?? null,
    processedBy: d.names.processedBy,
    paidAllocation: d.paidAllocation ? { reference: d.paidAllocation.reference, staffName: d.paidAllocation.staffName } : null,
    items: d.items.map((i) => ({
      itemName: i.itemName,
      categoryLabel: i.categoryLabel,
      description: i.description,
      quantity: i.quantity,
      rate: i.rate,
      discount: i.discount,
      amount: i.amount,
      vendor: i.vendor ? { name: i.vendor.name, accountName: i.vendor.accountName, accountNumber: i.vendor.accountNumber, bankName: i.vendor.bankName } : null,
    })),
    events: d.events.map((e) => ({ type: e.type, actorName: e.actorName, targetName: e.targetName, comment: e.comment, createdAt: e.createdAt })),
  });
  await audit(db, {
    organisationId: user.organisationId,
    userId: user.id,
    entityType: "EXPORT",
    entityId: r.id,
    entityRef: r.reference,
    action: "EXPORTED",
    summary: `${user.fullName} downloaded ${r.reference} as PDF`,
  });
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const filename = requisitionPdfFileName(r.reference);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
