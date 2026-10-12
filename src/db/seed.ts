/* Demo data. Run with `npm run db:seed` (or `npm run db:reset` for a clean database). */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { jsPDF } from "jspdf";
import { Pool } from "pg";
import { poolConfig } from "./pool-config";
import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from "./defaults";
import * as s from "./schema";

const pool = new Pool(poolConfig(process.env.DIRECT_URL || process.env.DATABASE_URL, 2));
const db = drizzle(pool, { schema: s });

const N = (naira: number) => Math.round(naira * 100);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const day = (offset: number) => {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const at = (offset: number, hour = 10) => new Date(`${day(offset)}T${String(hour).padStart(2, "0")}:15:00+01:00`);

const counters = new Map<string, number>();
function ref(prefix: string, date: string) {
  const key = `${prefix}-${date.slice(0, 4)}`;
  const n = (counters.get(key) ?? (prefix === "AL" ? 120 : prefix === "EXP" ? 970 : 10)) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(5, "0")}`;
}

async function receiptFile(vendor: string, amount: number, date: string, description: string) {
  const doc = new jsPDF({ unit: "pt", format: [300, 420] });
  doc.setFont("helvetica", "bold").setFontSize(14).text(vendor, 20, 40);
  doc.setFont("helvetica", "normal").setFontSize(9).text("RECEIPT", 20, 58);
  doc.text(`Date: ${date}`, 20, 80);
  doc.text(`Receipt no: INV-${Math.floor(10000 + Math.random() * 89999)}`, 20, 94);
  doc.line(20, 110, 280, 110);
  doc.text(doc.splitTextToSize(description, 180), 20, 130);
  doc.text(`NGN ${(amount / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, 200, 130);
  doc.line(20, 300, 280, 300);
  doc.setFont("helvetica", "bold").text("TOTAL", 20, 320);
  doc.text(`NGN ${(amount / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, 200, 320);
  doc.setFont("helvetica", "normal").setFontSize(8).text("Thank you for your business.", 20, 390);
  const buf = Buffer.from(doc.output("arraybuffer"));
  const key = `seed/${randomUUID()}.pdf`;
  const full = path.resolve(process.env.STORAGE_DIR ?? "./storage/uploads", key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { fileName: `${vendor.replace(/[^\w]+/g, "_")}_Receipt.pdf`, fileType: "application/pdf", fileSize: buf.length, storageKey: key };
}

async function main() {
  const existing = await db.select({ id: s.organisations.id }).from(s.organisations).limit(1);
  if (existing.length) {
    console.log("Database already seeded — run `npm run db:reset` to start over.");
    await pool.end();
    return;
  }

  const [org] = await db.insert(s.organisations).values({ name: "Teasoo Consulting", currency: "NGN" }).returning();
  const O = org.id;

  const deptNames = DEFAULT_DEPARTMENTS;
  const depts = await db
    .insert(s.departments)
    .values(deptNames.map((name) => ({ organisationId: O, name, code: name.slice(0, 3).toUpperCase() })))
    .returning();
  const dept = (name: string) => depts.find((d) => d.name === name)!.id;

  const cats = await db
    .insert(s.expenseCategories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ organisationId: O, name: c.name, keywords: c.keywords, receiptRequired: c.receiptRequired ?? true })))
    .returning();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  const projs = await db
    .insert(s.projects)
    .values([
      { organisationId: O, name: "Operations", code: "OPS", description: "Day-to-day running costs", departmentId: dept("Operations") },
      { organisationId: O, name: "2026 Annual Conference", code: "CONF26", description: "Annual stakeholder conference", budget: N(2_000_000), departmentId: dept("Marketing"), startDate: day(-60), endDate: day(20) },
      { organisationId: O, name: "Website Revamp", code: "WEB", description: "New company website", budget: N(1_200_000), departmentId: dept("IT") },
    ])
    .returning();
  const proj = (name: string) => projs.find((p) => p.name === name)!.id;

  const passwordHash = await bcrypt.hash("Password123", 12);
  const people = await db
    .insert(s.users)
    .values([
      { organisationId: O, firstName: "Tolu", lastName: "Adeyemi", email: "admin@teasoo.test", role: "ADMIN", departmentId: dept("Administration"), jobTitle: "Operations Director", passwordHash },
      { organisationId: O, firstName: "Ngozi", lastName: "Okafor", email: "accountant@teasoo.test", role: "ACCOUNTANT", departmentId: dept("Finance"), jobTitle: "Accountant", passwordHash },
      { organisationId: O, firstName: "Femi", lastName: "Balogun", email: "management@teasoo.test", role: "MANAGEMENT", departmentId: dept("Administration"), jobTitle: "Managing Director", passwordHash },
      { organisationId: O, firstName: "Israel", lastName: "Oni", email: "staff@teasoo.test", role: "STAFF", departmentId: dept("Operations"), jobTitle: "Operations Officer", passwordHash },
      { organisationId: O, firstName: "John", lastName: "Doe", email: "john@teasoo.test", role: "STAFF", departmentId: dept("Operations"), jobTitle: "Logistics Officer", passwordHash },
      { organisationId: O, firstName: "Jane", lastName: "Doe", email: "jane@teasoo.test", role: "STAFF", departmentId: dept("Marketing"), jobTitle: "Events Lead", passwordHash },
      { organisationId: O, firstName: "Amaka", lastName: "Obi", email: "amaka@teasoo.test", role: "STAFF", departmentId: dept("IT"), jobTitle: "IT Support", passwordHash },
    ])
    .returning();
  const u = (email: string) => people.find((p) => p.email === email)!;
  const admin = u("admin@teasoo.test");
  const accountant = u("accountant@teasoo.test");

  const logAudit = (v: Omit<typeof s.auditLogs.$inferInsert, "organisationId">) => db.insert(s.auditLogs).values({ organisationId: O, ...v });

  type Exp = {
    offset: number;
    cat: string;
    desc: string;
    vendor: string;
    amount: number;
    status: s.ExpenseStatus;
    method?: string;
    receipt?: boolean;
    comment?: string;
    project?: string;
  };

  async function allocation(opts: {
    staff: s.User;
    amount: number;
    purpose: string;
    received: number;
    due?: number;
    project?: string;
    status?: s.AllocationStatus;
    kind?: s.AllocationKind;
    expenses: Exp[];
    returns?: { amount: number; offset: number; method: string; reference: string }[];
    adjustments?: { type: s.AdjustmentType; amount: number; reason: string; offset: number }[];
    transferRef?: string;
  }) {
    const dateReceived = day(opts.received);
    const reference = ref("AL", dateReceived);
    const [a] = await db
      .insert(s.allocations)
      .values({
        organisationId: O,
        reference,
        kind: opts.kind ?? "ADVANCE",
        staffId: opts.staff.id,
        departmentId: opts.staff.departmentId,
        projectId: opts.project ? proj(opts.project) : null,
        purpose: opts.purpose,
        initialAmount: opts.amount,
        dateReceived,
        expectedCompletionDate: opts.due != null ? day(opts.due) : null,
        status: "ACTIVE",
        transferReference: opts.transferRef ?? `TRF${Math.floor(100000000 + Math.random() * 899999999)}`,
        fundingSource: opts.kind === "REIMBURSEMENT" ? "Personal funds" : "Operating account",
        approvingOfficer: opts.kind === "REIMBURSEMENT" ? null : "Tolu Adeyemi",
        createdBy: opts.kind === "REIMBURSEMENT" ? opts.staff.id : accountant.id,
        createdAt: at(opts.received, 9),
      })
      .returning();
    await logAudit({
      userId: opts.kind === "REIMBURSEMENT" ? opts.staff.id : accountant.id,
      entityType: "ALLOCATION",
      entityId: a.id,
      entityRef: reference,
      allocationId: a.id,
      action: "CREATED",
      summary:
        opts.kind === "REIMBURSEMENT"
          ? `${opts.staff.firstName} ${opts.staff.lastName} opened personal-spend record ${reference} — ${opts.purpose}`
          : `Ngozi Okafor created allocation ${reference} of ₦${(opts.amount / 100).toLocaleString("en-NG")} for ${opts.staff.firstName} ${opts.staff.lastName} — ${opts.purpose}`,
      createdAt: at(opts.received, 9),
    });
    await db.insert(s.notifications).values({
      userId: opts.staff.id,
      type: "FUNDS_ASSIGNED",
      title: `New funds assigned: ₦${(opts.amount / 100).toLocaleString("en-NG")}`,
      body: opts.purpose,
      link: `/allocations/${a.id}`,
      createdAt: at(opts.received, 9),
      readAt: opts.received < -3 ? at(opts.received, 12) : null,
    });

    for (const adj of opts.adjustments ?? []) {
      await db.insert(s.allocationAdjustments).values({ allocationId: a.id, type: adj.type, amount: adj.amount, reason: adj.reason, createdBy: admin.id, createdAt: at(adj.offset, 15) });
      await logAudit({ userId: admin.id, entityType: "ALLOCATION", entityId: a.id, entityRef: reference, allocationId: a.id, action: `ADJUSTMENT_${adj.type}`, summary: `Tolu Adeyemi added +₦${(adj.amount / 100).toLocaleString("en-NG")} additional funding — ${adj.reason}`, createdAt: at(adj.offset, 15) });
    }

    for (const e of opts.expenses) {
      const expenseDate = day(e.offset);
      const reference = ref("EXP", expenseDate);
      const submitted = e.status !== "DRAFT";
      const reviewed = ["APPROVED", "REJECTED", "NEEDS_CLARIFICATION", "RECONCILED"].includes(e.status);
      const [row] = await db
        .insert(s.expenses)
        .values({
          reference,
          allocationId: a.id,
          staffId: opts.staff.id,
          categoryId: cat(e.cat),
          projectId: e.project ? proj(e.project) : a.projectId,
          departmentId: opts.staff.departmentId,
          expenseDate,
          amount: e.amount,
          vendor: e.vendor,
          description: e.desc,
          paymentMethod: e.method ?? "Bank transfer",
          status: e.status,
          submittedAt: submitted ? at(e.offset, 11) : null,
          reviewedAt: reviewed ? at(e.offset + 1, 14) : null,
          reviewedBy: reviewed ? accountant.id : null,
          createdAt: at(e.offset, 10),
        })
        .returning();
      if (e.receipt !== false) {
        const file = await receiptFile(e.vendor, e.amount, expenseDate, e.desc);
        await db.insert(s.documents).values({ organisationId: O, kind: "RECEIPT", expenseId: row.id, uploadedBy: opts.staff.id, uploadedAt: at(e.offset, 10), ...file });
      }
      const name = `${opts.staff.firstName} ${opts.staff.lastName}`;
      const money = `₦${(e.amount / 100).toLocaleString("en-NG")}`;
      await logAudit({ userId: opts.staff.id, entityType: "EXPENSE", entityId: row.id, entityRef: reference, allocationId: a.id, action: submitted ? "SUBMITTED" : "CREATED", summary: `${name} ${submitted ? "submitted" : "drafted"} ${money} expense — ${e.desc}`, createdAt: at(e.offset, 11) });
      if (submitted) await db.insert(s.expenseReviews).values({ expenseId: row.id, reviewerId: opts.staff.id, action: "SUBMITTED", createdAt: at(e.offset, 11) });
      if (reviewed) {
        const action = e.status === "REJECTED" ? "REJECTED" : e.status === "NEEDS_CLARIFICATION" ? "REQUEST_CLARIFICATION" : "APPROVED";
        const verb = action === "REJECTED" ? "rejected" : action === "APPROVED" ? "approved" : "requested clarification on";
        await db.insert(s.expenseReviews).values({ expenseId: row.id, reviewerId: accountant.id, action, comment: e.comment ?? null, createdAt: at(e.offset + 1, 14) });
        await logAudit({ userId: accountant.id, entityType: "EXPENSE", entityId: row.id, entityRef: reference, allocationId: a.id, action, summary: `Ngozi Okafor ${verb} ${money} expense — ${e.desc}${e.comment ? ` ("${e.comment}")` : ""}`, createdAt: at(e.offset + 1, 14) });
        if (action !== "APPROVED" || e.offset > -3) {
          await db.insert(s.notifications).values({
            userId: opts.staff.id,
            type: `EXPENSE_${action === "REQUEST_CLARIFICATION" ? "CLARIFY" : action === "REJECTED" ? "REJECT" : "APPROVE"}`,
            title: action === "APPROVED" ? `Expense approved: ${money}` : action === "REJECTED" ? `Expense needs correction: ${money}` : `Question about your ${money} expense`,
            body: e.comment ? `${e.desc} — "${e.comment}"` : e.desc,
            link: `/expenses/${row.id}`,
            createdAt: at(e.offset + 1, 14),
          });
        }
      }
      if (e.status === "SUBMITTED") {
        for (const fin of [accountant, admin]) {
          await db.insert(s.notifications).values({ userId: fin.id, type: "EXPENSE_SUBMITTED", title: `${name} submitted ${money}`, body: `${e.desc} — ${opts.purpose}`, link: `/expenses/${row.id}`, createdAt: at(e.offset, 11) });
        }
      }
    }

    for (const r of opts.returns ?? []) {
      await db.insert(s.fundReturns).values({ allocationId: a.id, amount: r.amount, returnDate: day(r.offset), paymentMethod: r.method, reference: r.reference, recordedBy: accountant.id, createdAt: at(r.offset, 16) });
      await logAudit({ userId: accountant.id, entityType: "RETURN", entityRef: reference, allocationId: a.id, action: "RECORDED", summary: `Ngozi Okafor recorded a return of ₦${(r.amount / 100).toLocaleString("en-NG")} (ref ${r.reference})`, createdAt: at(r.offset, 16) });
    }

    if (opts.status === "RECONCILED") {
      const approved = opts.expenses.filter((e) => e.status === "RECONCILED").reduce((s2, e) => s2 + e.amount, 0);
      const returned = (opts.returns ?? []).reduce((s2, r) => s2 + r.amount, 0);
      const adjustments = (opts.adjustments ?? []).reduce((s2, r) => s2 + r.amount, 0);
      const when = at((opts.returns?.at(-1)?.offset ?? opts.received) + 1, 10);
      await db.insert(s.reconciliations).values({ allocationId: a.id, totalFunded: opts.amount + adjustments, approvedExpenses: approved, amountReturned: returned, adjustments, finalBalance: opts.amount + adjustments - approved - returned, reconciledBy: accountant.id, reconciledAt: when });
      await db.update(s.allocations).set({ status: "RECONCILED", reconciledAt: when }).where(sql`${s.allocations.id} = ${a.id}`);
      await logAudit({ userId: accountant.id, entityType: "RECONCILIATION", entityId: a.id, entityRef: reference, allocationId: a.id, action: "RECONCILED", summary: `Ngozi Okafor reconciled the allocation — ₦0 outstanding`, createdAt: when });
    }
    return a;
  }

  const israel = u("staff@teasoo.test");
  const john = u("john@teasoo.test");
  const jane = u("jane@teasoo.test");
  const amaka = u("amaka@teasoo.test");

  // §6 / §13 — Office Software & Internet Subscriptions
  await allocation({
    staff: israel,
    amount: N(500_000),
    purpose: "Office Software & Internet Subscriptions",
    received: -4,
    due: 19,
    project: "Operations",
    expenses: [
      { offset: -4, cat: "Software", desc: "Adobe Creative Cloud subscription", vendor: "Adobe", amount: N(85_000), status: "SUBMITTED", method: "Debit card" },
      { offset: -4, cat: "Software", desc: "Canva Pro team subscription", vendor: "Canva", amount: N(40_000), status: "APPROVED", method: "Debit card" },
      { offset: -3, cat: "Internet", desc: "Office internet — monthly plan", vendor: "Spectranet", amount: N(50_000), status: "APPROVED" },
      { offset: -2, cat: "Software", desc: "Domain renewal (teasoo.com)", vendor: "Whogohost", amount: N(35_000), status: "UNDER_REVIEW" },
      { offset: -1, cat: "Printing", desc: "Printing of client proposal documents", vendor: "Copy Express", amount: N(25_000), status: "NEEDS_CLARIFICATION", method: "Cash", comment: "Which client was this for? Please add the project name." },
      { offset: 0, cat: "Office Supplies", desc: "Toner cartridge for office printer", vendor: "Slot Systems", amount: N(40_000), status: "DRAFT", receipt: false },
    ],
  });

  // Over budget example (§21)
  await allocation({
    staff: john,
    amount: N(750_000),
    purpose: "Q4 Logistics & Deliveries",
    received: -30,
    due: -2,
    project: "Operations",
    expenses: [
      { offset: -28, cat: "Logistics", desc: "Haulage of office furniture to Lekki site", vendor: "GIG Logistics", amount: N(180_000), status: "APPROVED" },
      { offset: -21, cat: "Transportation", desc: "Fuel for delivery van (week 1)", vendor: "TotalEnergies", amount: N(65_000), status: "APPROVED", method: "Cash" },
      { offset: -14, cat: "Logistics", desc: "Courier of contract documents to Abuja", vendor: "DHL", amount: N(45_000), status: "APPROVED" },
      { offset: -10, cat: "Transportation", desc: "Fuel for delivery van (week 3)", vendor: "TotalEnergies", amount: N(70_000), status: "APPROVED", method: "Cash" },
      { offset: -7, cat: "Repairs", desc: "Delivery van engine overhaul and brake pads", vendor: "Coscharis Motors", amount: N(410_000), status: "APPROVED" },
      { offset: -3, cat: "Logistics", desc: "Dispatch rider — client deliveries", vendor: "Kwik Delivery", amount: N(95_000), status: "REJECTED", comment: "Receipt is unreadable. Please upload a clearer copy." },
      { offset: -2, cat: "Transportation", desc: "Inter-state transport for site visit", vendor: "GUO Transport", amount: N(85_000), status: "SUBMITTED", receipt: false },
    ],
  });

  // §18 — reconciled event
  await allocation({
    staff: jane,
    amount: N(1_000_000),
    purpose: "Client Appreciation Event",
    received: -45,
    due: -20,
    project: "2026 Annual Conference",
    expenses: [
      { offset: -40, cat: "Events", desc: "Venue hire — Eko Hotel hall", vendor: "Eko Hotels", amount: N(450_000), status: "RECONCILED" },
      { offset: -38, cat: "Meals", desc: "Catering for 60 guests", vendor: "Zest Catering", amount: N(320_000), status: "RECONCILED" },
      { offset: -37, cat: "Printing", desc: "Event banners and programmes", vendor: "Copy Express", amount: N(95_000), status: "RECONCILED" },
      { offset: -36, cat: "Events", desc: "Decoration and table settings", vendor: "Glam Decor", amount: N(135_000), status: "RECONCILED" },
    ],
  }).then(async (a) => {
    await db.update(s.allocations).set({ status: "RECONCILED", reconciledAt: at(-30) }).where(sql`${s.allocations.id} = ${a.id}`);
    await db.insert(s.reconciliations).values({ allocationId: a.id, totalFunded: N(1_000_000), approvedExpenses: N(1_000_000), amountReturned: 0, adjustments: 0, finalBalance: 0, reconciledBy: accountant.id, reconciledAt: at(-30) });
    await logAudit({ userId: accountant.id, entityType: "RECONCILIATION", entityId: a.id, entityRef: a.reference, allocationId: a.id, action: "RECONCILED", summary: "Ngozi Okafor reconciled the allocation — ₦1,000,000 funded, ₦1,000,000 approved, ₦0 outstanding", createdAt: at(-30) });
  });

  // §65 — Conference logistics, ready for a return
  await allocation({
    staff: jane,
    amount: N(1_000_000),
    purpose: "2026 Annual Conference Logistics",
    received: -12,
    due: 5,
    project: "2026 Annual Conference",
    expenses: [
      { offset: -11, cat: "Transportation", desc: "Venue transport for speakers", vendor: "Bolt Business", amount: N(100_000), status: "APPROVED" },
      { offset: -10, cat: "Printing", desc: "Conference brochures and badges", vendor: "Copy Express", amount: N(75_000), status: "APPROVED" },
      { offset: -9, cat: "Accommodation", desc: "Hotel rooms for 3 speakers", vendor: "Radisson Blu", amount: N(150_000), status: "APPROVED" },
      { offset: -8, cat: "Meals", desc: "Speakers' dinner", vendor: "Nok by Alara", amount: N(80_000), status: "APPROVED" },
      { offset: -8, cat: "Office Supplies", desc: "Conference materials and stationery", vendor: "Jumia", amount: N(45_000), status: "APPROVED" },
    ],
  });

  // Fully reconciled with return
  await allocation({
    staff: amaka,
    amount: N(600_000),
    purpose: "IT Equipment Refresh",
    received: -60,
    due: -40,
    project: "Website Revamp",
    expenses: [
      { offset: -58, cat: "Equipment", desc: "27-inch monitor for design team", vendor: "Slot Systems", amount: N(210_000), status: "RECONCILED" },
      { offset: -57, cat: "Equipment", desc: "Wireless keyboards and mice (x5)", vendor: "Pointek", amount: N(115_000), status: "RECONCILED" },
      { offset: -55, cat: "Repairs", desc: "Laptop screen replacement", vendor: "Computer Village", amount: N(100_000), status: "RECONCILED", method: "Cash" },
    ],
    returns: [{ amount: N(175_000), offset: -45, method: "Bank transfer", reference: "RET-55120" }],
    status: "RECONCILED",
  });

  // Overdue allocation with no activity
  await allocation({
    staff: amaka,
    amount: N(350_000),
    purpose: "Website hosting & tools",
    received: -25,
    due: -5,
    project: "Website Revamp",
    expenses: [
      { offset: -24, cat: "Software", desc: "Cloud hosting — 3 months", vendor: "DigitalOcean", amount: N(120_000), status: "APPROVED", method: "Debit card" },
      { offset: -6, cat: "Software", desc: "Figma professional seats", vendor: "Figma", amount: N(48_000), status: "SUBMITTED", method: "Debit card" },
    ],
  });

  // Additional funding example (§22)
  await allocation({
    staff: israel,
    amount: N(250_000),
    purpose: "Staff Training Logistics",
    received: -20,
    due: 10,
    project: "Operations",
    adjustments: [{ type: "ADDITIONAL_FUNDING", amount: N(100_000), reason: "Extra attendees confirmed for the training", offset: -15 }],
    expenses: [
      { offset: -18, cat: "Meals", desc: "Lunch for training attendees (day 1)", vendor: "Chicken Republic", amount: N(60_000), status: "APPROVED" },
      { offset: -17, cat: "Transportation", desc: "Facilitator transport", vendor: "Uber", amount: N(18_500), status: "APPROVED", method: "Debit card" },
      { offset: -16, cat: "Printing", desc: "Training handouts", vendor: "Copy Express", amount: N(22_000), status: "APPROVED", method: "Cash" },
      { offset: -14, cat: "Meals", desc: "Lunch for training attendees (day 2)", vendor: "Chicken Republic", amount: N(72_000), status: "APPROVED" },
    ],
  });

  // Personal spend (reimbursement) record
  await allocation({
    staff: john,
    amount: 0,
    kind: "REIMBURSEMENT",
    purpose: "Emergency generator repair (paid personally)",
    received: -5,
    project: "Operations",
    expenses: [{ offset: -5, cat: "Utilities", desc: "Generator repair and diesel top-up", vendor: "Mikano", amount: N(42_000), status: "SUBMITTED", method: "Cash" }],
  });

  // Make sure the counters table continues from the seeded references.
  for (const [key, value] of counters) {
    await db.insert(s.counters).values({ key, value }).onConflictDoUpdate({ target: s.counters.key, set: { value } });
  }

  console.log("Seeded demo organisation. Sign in with any of:");
  for (const p of people) console.log(`  ${p.role.padEnd(10)} ${p.email}  /  Password123`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
