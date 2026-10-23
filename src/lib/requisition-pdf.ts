import "server-only";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RequisitionEventType, RequisitionStatus } from "@/db/schema";
import { REQUISITION_STATUS } from "@/lib/format";
import { formatQuantity } from "@/lib/requisition-rules";

/** "NGN35,000.00" — the ₦ sign isn't in the built-in PDF fonts. */
function ngn(kobo: number) {
  return `NGN${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TZ = "Africa/Lagos";
const dateLong = (d: Date | string) =>
  new Date(typeof d === "string" && d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
const dateTime = (d: Date) =>
  `${dateLong(d)} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ })}`;

export type RequisitionPdfInput = {
  organisation: {
    name: string;
    logo?: { data: Uint8Array; type: string } | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  requisition: {
    reference: string;
    title: string;
    status: RequisitionStatus;
    total: number;
    expectedDate: string;
    submittedAt: Date | null;
    deliveryAddress: string | null;
    externalReference: string | null;
    notesToApprover: string | null;
    decisionReason: string | null;
    paymentDate: string | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNotes: string | null;
  };
  requester: { name: string; email: string } | null;
  submittedTo: { name: string; email: string } | null;
  department: string | null;
  processedBy: string | null;
  paidAllocation: { reference: string; staffName: string } | null;
  items: {
    itemName: string;
    categoryLabel: string;
    description: string | null;
    quantity: number;
    rate: number;
    discount: number;
    amount: number;
    vendor: { name: string; accountName: string | null; accountNumber: string | null; bankName: string | null } | null;
  }[];
  events: { type: RequisitionEventType; actorName: string; targetName: string | null; comment: string | null; createdAt: Date }[];
};

function historyLine(e: RequisitionPdfInput["events"][number]) {
  const note = e.comment ? ` ${e.comment}` : "";
  switch (e.type) {
    case "CREATED":
      return "Purchase Request created.";
    case "SUBMITTED":
      return `Purchase Request submitted to ${e.targetName ?? "the approver"}.${note}`;
    case "RESUBMITTED":
      return `Purchase Request resubmitted to ${e.targetName ?? "the approver"}.${note}`;
    case "RECALLED":
      return "Purchase Request recalled for modification.";
    case "APPROVED":
      return `Purchase Request approved${e.targetName ? ` and sent to ${e.targetName} for payment` : ""}.${note}`;
    case "REJECTED":
      return `Purchase Request declined.${e.comment ? ` Reason: ${e.comment}` : ""}`;
    case "INFO_REQUESTED":
      return `More information requested.${note}`;
    case "PROCESSED":
      return `Payment recorded.${note}`;
    case "CANCELLED":
      return `Purchase Request cancelled.${note}`;
    case "COMMENT":
      return `Comment:${note}`;
  }
}

/** A purchase request laid out like the Zoho export: branding, parties, items with bank details, approval history. */
export function requisitionPdf(input: RequisitionPdfInput): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const right = W - M;
  const dark: [number, number, number] = [55, 65, 81];
  const muted: [number, number, number] = [107, 114, 128];
  const { organisation: org, requisition: r } = input;

  // ---- Branding -------------------------------------------------------
  let y = 44;
  let logoBottom = y;
  if (org.logo && /image\/(png|jpe?g)/.test(org.logo.type)) {
    try {
      const format = org.logo.type === "image/png" ? "PNG" : "JPEG";
      const props = doc.getImageProperties(org.logo.data);
      const scale = Math.min(150 / props.width, 48 / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(org.logo.data, format, M, y, w, h);
      logoBottom = y + h + 14;
    } catch {
      // An unreadable logo shouldn't stop the document.
    }
  }
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...dark).text("Purchase Request", right, y + 14, { align: "right" });
  doc.setFontSize(10).setTextColor(...muted).text(r.reference, right, y + 30, { align: "right" });

  y = Math.max(logoBottom, y + 10) + 6;
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...dark).text(org.name, M, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted);
  for (const line of [...(org.address?.split(/\r?\n/) ?? []), org.phone, org.email, org.website].filter((l): l is string => !!l?.trim())) {
    doc.text(line.trim(), M, y);
    y += 11;
  }

  // ---- Status chip and divider ----------------------------------------
  y = Math.max(y + 18, 150);
  const status = REQUISITION_STATUS[r.status].label;
  doc.setFont("helvetica", "normal").setFontSize(8);
  const chipW = doc.getTextWidth(status) + 18;
  doc.setFillColor(...dark).roundedRect(right - chipW, y - 14, chipW, 18, 2, 2, "F");
  doc.setTextColor(255).text(status, right - chipW / 2, y - 2, { align: "center" });
  doc.setDrawColor(...dark).setLineWidth(0.8).line(M, y + 4, right, y + 4);
  y += 20;

  // ---- Parties and amount box ------------------------------------------
  const col2 = M + 160;
  const boxX = W / 2 + 40;
  const label = (t: string, x: number, yy: number) => doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted).text(t, x, yy);
  const strong = (t: string, x: number, yy: number) => doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...dark).text(t, x, yy);
  const small = (t: string, x: number, yy: number, maxW = 150) => {
    const lines = doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...muted).splitTextToSize(t, maxW);
    doc.text(lines, x, yy);
    return lines.length * 9;
  };
  label("Submitted By", M, y);
  strong(input.requester?.name ?? "—", M, y + 12);
  let left = y + 22;
  if (input.requester?.email) left += small(input.requester.email, M, left);
  if (r.submittedAt) small(`Submitted On : ${dateLong(r.submittedAt)}`, M, left);
  label("Submitted To", col2, y);
  strong(input.submittedTo?.name ?? "—", col2, y + 12);
  if (input.submittedTo?.email) small(input.submittedTo.email, col2, y + 22, boxX - col2 - 10);

  const boxY = y - 10;
  doc.setDrawColor(209, 213, 219).setLineWidth(0.6).roundedRect(boxX, boxY, right - boxX, 72, 4, 4, "S");
  doc.line(boxX, boxY + 36, right, boxY + 36);
  label("Total Amount", boxX + 12, boxY + 22);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...dark).text(ngn(r.total), right - 12, boxY + 22, { align: "right" });
  label("Expected Date", boxX + 12, boxY + 58);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...dark).text(dateLong(r.expectedDate), right - 12, boxY + 58, { align: "right" });

  y = boxY + 90;
  doc.setDrawColor(...dark).setLineWidth(0.8).line(M, y, right, y);
  y += 16;

  // ---- Location / delivery ---------------------------------------------
  const startY = y;
  label("Location :", M, y);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...dark).text(input.department ?? "Head Office", M, y + 13);
  let leftEnd = y + 13;
  if (r.externalReference) {
    label("Reference :", M, y + 30);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...dark).text(r.externalReference, M, y + 43);
    leftEnd = y + 43;
  }
  let rightEnd = y;
  if (r.deliveryAddress) {
    label("Delivery Address :", W / 2 - 40, y);
    const lines = doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...dark).splitTextToSize(r.deliveryAddress, right - (W / 2 - 40));
    doc.text(lines, W / 2 - 40, y + 13);
    rightEnd = y + 13 + (lines.length - 1) * 11;
  }
  y = Math.max(leftEnd, rightEnd, startY) + 14;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...dark).text("Purpose :", M, y);
  const purpose = doc.setFont("helvetica", "normal").splitTextToSize(r.title, right - M - 50);
  doc.text(purpose, M + 46, y);
  y += purpose.length * 11;
  if (r.notesToApprover) {
    const notes = doc.setFontSize(8).setTextColor(...muted).splitTextToSize(`Notes to approver: ${r.notesToApprover}`, right - M);
    doc.text(notes, M, y + 2);
    y += notes.length * 10 + 2;
  }
  y += 10;

  // ---- Items -----------------------------------------------------------
  // Item details: the name in bold, then category, description and the vendor's bank details.
  const details = input.items.map((i) => {
    const lines = [i.categoryLabel];
    if (i.description) lines.push(`Description : ${i.description}`);
    if (i.vendor) {
      lines.push(`Vendor : ${i.vendor.name}`);
      if (i.vendor.accountName) lines.push(`Account Name : ${i.vendor.accountName}`);
      if (i.vendor.accountNumber) lines.push(`Account Number : ${i.vendor.accountNumber}`);
      if (i.vendor.bankName) lines.push(`Bank Name : ${i.vendor.bankName}`);
    }
    return { title: i.itemName.toUpperCase(), lines };
  });
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    head: [["#", "Item Details", "Quantity", "Rate", "Discount", "Amount"]],
    body: input.items.map((i, idx) => [
      `${idx + 1}.`,
      [details[idx].title, ...details[idx].lines].join("\n"),
      formatQuantity(i.quantity),
      ngn(i.rate),
      ngn(i.discount),
      ngn(i.amount),
    ]),
    styles: { fontSize: 8.5, cellPadding: { top: 8, bottom: 8, left: 4, right: 4 }, textColor: dark, valign: "top", lineColor: [229, 231, 235] },
    headStyles: { fontStyle: "bold", textColor: dark, lineWidth: { top: 0.6, bottom: 0.6 } },
    bodyStyles: { lineWidth: { bottom: 0.6 } },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 230 },
      2: { halign: "right", cellWidth: 52 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    willDrawCell: (data) => {
      // Draw item details ourselves so the name can be bold.
      if (data.section === "body" && data.column.index === 1) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const d = details[data.row.index];
      const x = data.cell.x + 4;
      let yy = data.cell.y + 8 + 8;
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...dark).text(d.title, x, yy);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(75, 85, 99);
      for (const line of d.lines) {
        const wrapped = doc.splitTextToSize(line, data.cell.width - 8);
        yy += 11;
        doc.text(wrapped, x, yy);
        yy += (wrapped.length - 1) * 10;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 22;
  if (y > H - 80) {
    doc.addPage();
    y = 60;
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...dark).text("Total Amount", right - 120, y, { align: "right" });
  doc.setFontSize(14).text(ngn(r.total), right, y + 2, { align: "right" });
  doc.setDrawColor(229, 231, 235).setLineWidth(0.6).line(M, y + 16, right, y + 16);
  y += 38;

  // ---- Payment / decision ----------------------------------------------
  const block = (title: string, lines: string[], fill: [number, number, number]) => {
    const wrapped = lines.flatMap((l) => doc.setFont("helvetica", "normal").setFontSize(8.5).splitTextToSize(l, right - M - 24));
    const h = 22 + wrapped.length * 11 + 6;
    if (y + h > H - 50) {
      doc.addPage();
      y = 60;
    }
    doc.setFillColor(...fill).roundedRect(M, y, right - M, h, 4, 4, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...dark).text(title, M + 12, y + 16);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...dark).text(wrapped, M + 12, y + 30);
    y += h + 16;
  };
  if (r.status === "PROCESSED") {
    const lines = [
      `Paid on ${r.paymentDate ? dateLong(r.paymentDate) : "—"}${input.processedBy ? ` by ${input.processedBy}` : ""}${r.paymentMethod ? ` · ${r.paymentMethod}` : ""}${r.paymentReference ? ` · Ref ${r.paymentReference}` : ""}`,
    ];
    if (input.paidAllocation) lines.push(`Paid to ${input.paidAllocation.staffName} as part of allocation ${input.paidAllocation.reference}.`);
    if (r.paymentNotes) lines.push(r.paymentNotes);
    block("Payment", lines, [236, 253, 245]);
  } else if ((r.status === "REJECTED" || r.status === "ON_HOLD") && r.decisionReason) {
    block(r.status === "REJECTED" ? "Declined" : "More information needed", [r.decisionReason], [254, 242, 242]);
  }

  // ---- Approval history (newest first, like Zoho) ------------------------
  if (y > H - 120) {
    doc.addPage();
    y = 60;
  }
  y += 6;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...dark).text("Approval History", M, y);
  autoTable(doc, {
    startY: y + 8,
    margin: { left: M, right: M },
    theme: "plain",
    body: [...input.events].reverse().map((e) => [dateTime(e.createdAt), `${historyLine(e)} - ${e.actorName}`]),
    styles: { fontSize: 8, textColor: dark, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 } },
    columnStyles: { 0: { cellWidth: 120, textColor: muted } },
  });

  // ---- Footer on every page -------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(156, 163, 175);
    doc.text(`${org.name} · ${r.reference}`, M, H - 20);
    doc.text(`Page ${p} of ${pages}`, right, H - 20, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/** Download name, matching Zoho: Purchase_Request_TC-PR-00101.pdf */
export function requisitionPdfFileName(reference: string) {
  return `Purchase_Request_${reference.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
}
