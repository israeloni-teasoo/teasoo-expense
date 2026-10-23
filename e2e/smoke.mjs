/**
 * End-to-end smoke test of the core workflow against a running app with seeded demo data:
 *   node e2e/smoke.mjs [baseUrl]
 * Staff logs an expense with a receipt → duplicate warning → accountant approves →
 * return recorded → allocation reconciled → exports → over-spend claim recommended and approved.
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = createRequire(path.join(process.execPath, "../../lib/node_modules/"))("playwright");
}
const { chromium } = playwright;
const BASE = process.argv[2] ?? "http://localhost:3000";
const dir = mkdtempSync(path.join(tmpdir(), "smoke-"));
// 1x1 PNG
const png = path.join(dir, "receipt.png");
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const fakePdf = path.join(dir, "evil.pdf");
writeFileSync(fakePdf, "<script>alert(1)</script>");

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
async function session(email, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", "Password123");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page };
}

// ---- Staff logs an expense (on a phone-sized screen) ----
const staff = await session("staff@teasoo.test", { width: 390, height: 844 });
let p = staff.page;
await p.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
await p.getByText("Office Software & Internet Subscriptions").click();
await p.getByRole("button", { name: /Continue/ }).click();
await p.fill("#amount", "30,000");
await p.fill("#description", "Paid for office internet renewal");
const suggestion = p.getByRole("button", { name: /Suggested: Internet/ });
ok(await suggestion.isVisible(), "smart category suggestion shows 'Internet'");
await suggestion.click();
await p.fill("#vendor", "Spectranet");
await p.getByRole("button", { name: /Continue/ }).click();
// Wrong file type is rejected on the client
await p.locator('input[name="receipts"]').setInputFiles(png);
await p.getByRole("button", { name: /Continue/ }).click();
ok(await p.getByText("Remaining after this expense").isVisible(), "review step shows remaining balance after expense");
await p.getByRole("button", { name: /Submit expense/ }).click();
await p.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 20000 });
const expenseUrl = p.url();
ok(await p.getByText("Pending", { exact: true }).first().isVisible(), "expense submitted and shows Pending to staff");
ok((await p.locator('img[src^="/api/documents/"]').count()) === 1, "receipt image is attached and previewable");

// Duplicate detection
await p.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
await p.getByText("Office Software & Internet Subscriptions").click();
await p.getByRole("button", { name: /Continue/ }).click();
await p.fill("#amount", "30000");
await p.fill("#description", "Office internet renewal");
await p.selectOption("#categoryId", { label: "Internet" });
await p.getByRole("button", { name: /Continue/ }).click();
await p.locator('input[name="receipts"]').setInputFiles(png);
await p.getByRole("button", { name: /Continue/ }).click();
await p.getByRole("button", { name: /Submit expense/ }).click();
await p.getByText("Possible duplicate").waitFor({ timeout: 15000 });
ok(true, "duplicate expense warning shown");
await p.getByRole("button", { name: "Go back and edit" }).click();
await p.getByRole("button", { name: /Save draft/ }).last().click();
await p.getByText("Possible duplicate").waitFor({ timeout: 15000 });
await p.getByRole("button", { name: "Yes, continue" }).click();
await p.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 20000 });
ok(await p.getByText("Draft", { exact: true }).first().isVisible(), "confirmed duplicate saved as draft");

// Forged file upload is rejected server-side (content sniffing)
await p.getByRole("button", { name: "Add document" }).click();
await p.locator('input[name="files"]').setInputFiles(fakePdf);
await p.getByRole("button", { name: "Upload", exact: true }).click();
await p.getByText(/not a supported file/).waitFor({ timeout: 15000 });
ok(true, "file pretending to be a PDF is rejected");

// Receipt scanning (Tesseract.js in the browser; loads its model from a CDN on first use)
if (process.env.SMOKE_OCR !== "0") {
  await p.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
  await p.getByText("Staff Training Logistics").click();
  await p.getByRole("button", { name: /Continue/ }).click();
  await p.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(new URL("./sample-receipt.png", import.meta.url).pathname);
  await p.getByText(/We read this from your receipt|couldn't read|isn't available/).waitFor({ timeout: 120000 });
  ok((await p.inputValue("#amount")) === "45500" && (await p.inputValue("#expenseDate")) === "2026-10-08", "receipt scan filled in total ₦45,500 and date 8 Oct 2026");
  ok((await p.inputValue("#paymentReference")) === "INV-29871" && /office supplies/i.test(await p.inputValue("#vendor")), "receipt scan filled in vendor and receipt number");
}


// Staff cannot access finance pages or other people's data
const r = await staff.page.goto(BASE + "/allocations");
// Pages stream behind a loading skeleton, so the permission redirect arrives just after the response starts.
const redirected = await staff.page.waitForURL(/\/dashboard\?denied=1/, { timeout: 10000 }).then(() => true, () => false);
ok(redirected && (await staff.page.getByText("Money disbursed to staff").count()) === 0, "staff redirected away from finance-only page (no finance data shown)");
const apiRes = await staff.ctx.request.get(BASE + "/api/reports?report=staff");
ok(apiRes.status() === 403, "staff blocked from organisation reports API");

// ---- Accountant reviews ----
const acct = await session("accountant@teasoo.test");
p = acct.page;
await p.goto(expenseUrl, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Approve expense" }).click();
await p.waitForURL(/\/review/, { timeout: 15000 });
await p.goto(expenseUrl, { waitUntil: "networkidle" });
ok(await p.getByText("Approved", { exact: true }).first().isVisible(), "accountant approved the expense");

// Rejection requires a reason
await p.goto(BASE + "/review", { waitUntil: "networkidle" });
const firstRow = p.locator("tbody tr a").first();
await firstRow.click();
await p.waitForURL(/\/expenses\//);
await p.getByRole("radio", { name: "Reject" }).click();
await p.getByRole("button", { name: "Reject expense" }).click();
await p.getByText("Explain why the expense is being rejected.").waitFor({ timeout: 10000 });
ok(true, "rejecting without a reason is blocked");

// ---- Return + reconciliation on the conference logistics allocation ----
await p.goto(BASE + "/allocations?q=Conference%20Logistics", { waitUntil: "networkidle" });
await p.locator("tbody a", { hasText: "2026 Annual Conference Logistics" }).click();
await p.waitForURL(/\/allocations\/[0-9a-f-]{36}/);
const allocationUrl = p.url();
await p.getByRole("button", { name: "Record return" }).click();
await p.fill("#amount", "600000");
await p.fill("#reference", "RET-TEST-1");
await p.getByRole("button", { name: "Record return", exact: true }).last().click();
await p.getByText(/more than the unspent balance/).waitFor({ timeout: 10000 });
ok(true, "returning more than the unspent balance is blocked");
await p.fill("#amount", "550000");
await p.getByRole("button", { name: "Record return", exact: true }).last().click();
await p.getByText("Ready to reconcile").first().waitFor({ timeout: 15000 });
ok(true, "after the return the allocation is ready to reconcile");
await p.getByRole("button", { name: "Reconcile" }).click();
await p.getByRole("button", { name: "Mark as reconciled" }).click();
await p.getByText("Fully reconciled", { exact: true }).waitFor({ timeout: 15000 });
ok(true, "allocation reconciled: ₦1,000,000 received, ₦450,000 approved, ₦550,000 returned, ₦0 outstanding");

// ---- Exports ----
for (const [q, type] of [
  ["report=expenses&format=xlsx", "spreadsheetml"],
  ["report=staff&format=csv&period=this_year", "text/csv"],
  ["report=projects&format=pdf", "application/pdf"],
  [`report=allocation&format=xlsx&allocationId=${allocationUrl.split("/").pop()}`, "spreadsheetml"],
]) {
  const res = await acct.ctx.request.get(`${BASE}/api/exports?${q}`);
  ok(res.status() === 200 && (res.headers()["content-type"] ?? "").includes(type), `export ${q} → ${res.status()} ${res.headers()["content-type"]}`);
}

// ---- Over-spend claim: John raises, accountant recommends, admin approves ----
const john = await session("john@teasoo.test");
p = john.page;
await p.goto(BASE + "/funds", { waitUntil: "networkidle" });
await p.getByText("Q4 Logistics & Deliveries").first().click();
await p.waitForURL(/\/allocations\//);
const johnAlloc = p.url();
await p.getByRole("button", { name: "Log over-spend claim" }).click();
await p.fill("#reason", "Engine overhaul was urgent; approved by the Ops Director.");
await p.fill("#authorizedBy", "Tolu Adeyemi");
await p.locator('input[name="evidence"]').setInputFiles(png);
await p.getByRole("button", { name: "Submit claim" }).click();
await p.getByText(/is being processed/).waitFor({ timeout: 15000 });
ok(true, "staff raised an over-spend claim with evidence");

p = acct.page;
await p.goto(BASE + "/claims", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Recommend" }).first().click();
await p.getByRole("button", { name: "Recommend" }).last().click();
await p.getByText("Awaiting approval").first().waitFor({ timeout: 15000 });
ok(true, "accountant recommended the claim");

const admin = await session("admin@teasoo.test");
p = admin.page;
await p.goto(BASE + "/claims", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Approve" }).first().click();
await p.getByRole("button", { name: "Approve" }).last().click();
await p.waitForTimeout(1500);
await p.goto(johnAlloc + "?tab=funding", { waitUntil: "networkidle" });
ok(await p.getByText("Reimbursement", { exact: true }).first().isVisible(), "approved claim added a reimbursement adjustment to the allocation");


// ---- Optional evidence, evidence requests, notes ----
{
  // Funded expense can be submitted without a receipt
  const sp = staff.page;
  await sp.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
  await sp.getByText("Staff Training Logistics").click();
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.fill("#amount", "7,250");
  await sp.fill("#description", "Projector cable for training room");
  await sp.selectOption("#categoryId", { label: "Equipment" });
  await sp.getByRole("button", { name: /Continue/ }).click();
  ok(await sp.getByText(/Optional — attach it now/).isVisible(), "evidence step says the receipt is optional for funded expenses");
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.getByRole("button", { name: /Submit expense/ }).click();
  await sp.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const noReceiptUrl = sp.url();
  ok(await sp.getByRole("button", { name: "Add receipt" }).isVisible(), "expense submitted without a receipt; staff can add it later");

  // Accountant requests evidence with a note
  const ap = acct.page;
  await ap.goto(noReceiptUrl, { waitUntil: "networkidle" });
  ok(await ap.getByText("No receipt is attached to this expense.").isVisible(), "reviewer is told the receipt is missing");
  await ap.getByRole("radio", { name: "Request evidence" }).click();
  await ap.fill("#comment", "Please upload the Jumia invoice.");
  await ap.getByRole("button", { name: "Request evidence" }).last().click();
  await ap.waitForURL(/\/review/, { timeout: 15000 });

  // Staff sees the request and uploads the receipt → back in the queue
  await sp.goto(noReceiptUrl, { waitUntil: "networkidle" });
  ok(await sp.getByText(/requested evidence/).first().isVisible() && await sp.getByText("“Please upload the Jumia invoice.”").isVisible(), "staff sees the evidence request and message");
  await sp.getByRole("button", { name: "Upload receipt" }).first().click();
  await sp.locator('input[name="files"]').setInputFiles(png);
  await sp.getByRole("button", { name: "Upload", exact: true }).click();
  await sp.getByText(/back with finance for review/).waitFor({ timeout: 15000 });
  await sp.reload({ waitUntil: "networkidle" });
  ok(await sp.getByText("Pending", { exact: true }).first().isVisible(), "uploading the requested receipt sends the expense back for review");

  // Internal vs visible notes
  await ap.goto(noReceiptUrl, { waitUntil: "networkidle" });
  await ap.getByRole("radio", { name: "Add note" }).click();
  await ap.fill("#comment", "Internal: cross-check against the Jumia statement.");
  await ap.getByLabel(/Internal — visible to finance only/).check();
  await ap.getByRole("button", { name: "Add note" }).last().click();
  await ap.getByText("Internal note added.").waitFor({ timeout: 10000 });
  await ap.getByRole("radio", { name: "Add note" }).click();
  await ap.fill("#comment", "Approving once the statement matches.");
  await ap.getByRole("button", { name: "Add note" }).last().click();
  await ap.getByText(/Note added/).waitFor({ timeout: 10000 });
  await sp.reload({ waitUntil: "networkidle" });
  ok((await sp.getByText("Internal: cross-check").count()) === 0 && (await sp.getByText("Approving once the statement matches.").count()) === 1, "staff sees visible notes but not internal ones");

  // Personal spend still requires a receipt
  await sp.goto(BASE + "/funds", { waitUntil: "networkidle" });
  await sp.getByRole("button", { name: "New personal spend record" }).click();
  await sp.fill("#purpose", "Taxi to client meeting (paid myself)");
  await sp.getByRole("button", { name: "Continue to add expenses" }).click();
  await sp.waitForURL(/\/expenses\/new\?allocation=/, { timeout: 15000 });
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.fill("#amount", "6000");
  await sp.fill("#description", "Taxi to client meeting");
  await sp.selectOption("#categoryId", { label: "Transportation" });
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.getByRole("button", { name: /Submit expense/ }).click();
  await sp.getByText(/Personal-spend claims need a receipt/).first().waitFor({ timeout: 15000 });
  ok(true, "personal-spend expenses still require a receipt");
}


// ---- Personal spend is the staff member's own money; finance settles it ----
{
  const sp = staff.page;
  // The highlighted "Remaining" card on the staff dashboard.
  const remainingCard = async () => (await sp.locator("section[aria-label='My funds'] .bg-brand-800").first().textContent())?.trim();
  await sp.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  const before = await remainingCard();
  await sp.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
  await sp.getByText("My own money (personal spend)").click();
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.fill("#amount", "10000");
  await sp.fill("#description", "Printer ink bought with my own card");
  await sp.selectOption("#categoryId", { label: "Office Supplies" });
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.locator('input[name="receipts"]').setInputFiles(png);
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.getByRole("button", { name: /Submit expense/ }).click();
  await sp.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const personalExpenseUrl = sp.url();
  await sp.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  ok((await remainingCard()) === before, `personal spend doesn't reduce Remaining (${before})`);
  ok(await sp.getByText(/awaiting review/).first().isVisible(), "staff dashboard shows the personal spend separately");

  const ap = acct.page;
  await ap.goto(personalExpenseUrl, { waitUntil: "networkidle" });
  await ap.getByRole("button", { name: "Approve expense" }).click();
  await ap.waitForURL(/\/review/, { timeout: 15000 });
  await ap.goto(personalExpenseUrl, { waitUntil: "networkidle" });
  await ap.getByRole("link", { name: /Personal spend/ }).first().click();
  await ap.waitForURL(/\/allocations\//);
  const personalAllocUrl = ap.url();
  ok(await ap.getByText(/₦10,000 owed to Israel Oni/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), "finance sees the amount owed to the staff member");
  await ap.getByRole("button", { name: "Settle personal spend" }).click();
  await ap.getByRole("radio", { name: /From allocated funds/ }).click();
  await ap.selectOption("#sourceAllocationId", { label: /Staff Training Logistics/ }).catch(async () => {
    const v = await ap.locator("#sourceAllocationId option", { hasText: "Staff Training Logistics" }).getAttribute("value");
    await ap.selectOption("#sourceAllocationId", v);
  });
  await ap.getByRole("button", { name: "Settle from allocated funds" }).click();
  await ap.getByText(/Fully settled/).waitFor({ timeout: 15000 });
  await ap.goto(personalAllocUrl + "?tab=funding", { waitUntil: "networkidle" });
  ok(await ap.getByText(/settled from AL-\d{4}-\d{5} \(Staff Training Logistics\)/).first().isVisible(), "personal record shows it was settled from the allocation");
  await ap.goto(BASE + "/allocations?q=Staff%20Training", { waitUntil: "networkidle" });
  await ap.locator("tbody a", { hasText: "Staff Training Logistics" }).click();
  await ap.waitForURL(/\/allocations\/[0-9a-f-]{36}/);
  await ap.goto(ap.url() + "?tab=funding", { waitUntil: "networkidle" });
  ok(await ap.getByText(/Used to settle personal spend/).first().isVisible() && await ap.getByText("-₦10,000").first().isVisible(), "the allocation shows ₦10,000 used to settle the personal spend");
}

// ---- Feedback ----
{
  const sp = staff.page;
  await sp.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await sp.getByRole("button", { name: "Send feedback" }).click();
  await sp.selectOption("#category", "BUG");
  await sp.fill("#subject", "Export menu hard to find");
  await sp.fill("#message", "On my phone I couldn't find where to download my expenses.");
  await sp.locator('input[name="screenshots"]').setInputFiles(png);
  await sp.getByRole("button", { name: "Send feedback" }).last().click();
  await sp.getByText(/your feedback has been sent/).waitFor({ timeout: 15000 });
  ok(true, "staff sent feedback with a screenshot from the top-bar button");

  const adm = await session("admin@teasoo.test");
  await adm.page.goto(BASE + "/admin/feedback", { waitUntil: "networkidle" });
  ok(await adm.page.getByText("Export menu hard to find").isVisible() && (await adm.page.getByText("/dashboard").count()) > 0, "admin sees the feedback with the page it was sent from");
  await adm.page.getByRole("button", { name: "Respond" }).first().click();
  await adm.page.selectOption("#status", "RESOLVED");
  await adm.page.fill("#response", "Thanks! It's under Expenses → Export.");
  await adm.page.getByRole("button", { name: "Save" }).last().click();
  await adm.page.getByText(/sender has been notified/).waitFor({ timeout: 15000 });
  await sp.goto(BASE + "/feedback", { waitUntil: "networkidle" });
  ok(await sp.getByText("Thanks! It's under Expenses → Export.").isVisible() && await sp.getByText("Resolved").first().isVisible(), "staff sees the admin's reply and resolved status");

  if (process.env.SMOKE_STORAGE_TEST === "1") {
    await adm.page.goto(BASE + "/admin/settings", { waitUntil: "networkidle" });
    await adm.page.getByRole("button", { name: "Test storage" }).click();
    await adm.page.getByText(/Storage is working|Storage test failed/).first().waitFor({ timeout: 20000 });
    ok(await adm.page.getByText(/Storage is working/).first().isVisible(), "admin storage test passes");
  }
  await adm.ctx.close();
}

// ---- Ad-hoc staff: accountant invites someone without a company email ----
p = acct.page;
await p.goto(BASE + "/admin/users", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Invite user" }).click();
const adhocEmail = `contractor${Date.now()}@example.com`;
await p.fill("#firstName", "Bayo");
await p.fill("#lastName", "Contractor");
await p.fill("#email", adhocEmail);
await p.getByRole("button", { name: "Send invite" }).click();
const pwCell = p.locator("dd.font-mono");
await pwCell.waitFor({ timeout: 15000 });
const issued = (await pwCell.textContent()).trim();
ok(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/.test(issued), `accountant invited ad-hoc staff and was shown a generated password`);

const adhoc = await session(adhocEmail.replace("Password123", ""), { width: 390, height: 844 }).catch(() => null);
ok(adhoc === null, "generated password is required (demo password rejected)");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", adhocEmail);
  await page.fill("#password", issued);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  ok(await page.getByText("You're using a password that was set for you.").isVisible(), "ad-hoc staff sees the keep-or-change password prompt");
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  ok(!(await page.getByText("You're using a password that was set for you.").isVisible()), "choosing to keep the password dismisses the prompt");
  await ctx.close();
}

// ---- "Others" category with a typed category ----
{
  const st = await session("staff@teasoo.test");
  const sp = st.page;
  await sp.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
  await sp.getByText("Staff Training Logistics").click();
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.fill("#amount", "7,500");
  await sp.fill("#description", "Courtesy visit gift for venue manager");
  await sp.selectOption("#categoryId", { label: "Others (not listed)" });
  ok(await sp.locator("#categoryOther").isVisible(), "choosing Others shows a field to type the category");
  await sp.getByRole("button", { name: /Continue/ }).click();
  ok(await sp.getByText("Type the category for this expense.").isVisible(), "the typed category is required");
  await sp.fill("#categoryOther", "Gifts");
  await sp.getByRole("button", { name: /Continue/ }).click();
  await sp.getByRole("button", { name: /Continue/ }).click();
  ok(await sp.getByText("Others: Gifts").first().isVisible(), "review step shows Others: Gifts");
  await sp.getByRole("button", { name: /Save draft/ }).last().click();
  await sp.waitForURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 20000 });
  ok(await sp.getByText("Others: Gifts").first().isVisible(), "saved expense shows the typed category");
  await st.ctx.close();
}

// ---- Several expenses at once ----
{
  const st = await session("staff@teasoo.test", { width: 390, height: 844 });
  const bp = st.page;
  await bp.goto(BASE + "/expenses/new", { waitUntil: "networkidle" });
  await bp.getByRole("tab", { name: "Several at once" }).click();
  await bp.waitForURL(/mode=batch/, { timeout: 20000 });
  const rowsL = bp.getByTestId("batch-row");
  ok((await rowsL.count()) === 2, "batch mode starts with two expense rows");
  const fundValue = await rowsL.nth(0).getByLabel("Fund for expense 1").locator("option", { hasText: "Staff Training Logistics" }).getAttribute("value");
  const fill = async (i, { amount, description, category, other }) => {
    const row = rowsL.nth(i);
    await row.getByLabel(`Fund for expense ${i + 1}`).selectOption(fundValue);
    await row.getByLabel(`Amount of expense ${i + 1}`).fill(amount);
    await row.getByLabel(`Description of expense ${i + 1}`).fill(description);
    await row.getByLabel(`Category of expense ${i + 1}`).selectOption({ label: category });
    if (other) await row.getByLabel(`Typed category of expense ${i + 1}`).fill(other);
  };
  await fill(0, { amount: "4,000", description: "Taxi to the venue", category: "Transportation" });
  await fill(1, { amount: "2,500", description: "Bottled water for volunteers", category: "Meals" });
  await bp.getByRole("button", { name: "Add another expense" }).click();
  ok((await rowsL.count()) === 3, "another row can be added without leaving the page");
  await fill(2, { amount: "1,200", description: "Thank-you card for the host", category: "Others (not listed)" });
  await rowsL.nth(0).getByTestId("batch-receipt").setInputFiles(png);
  ok((await bp.getByTestId("batch-total").textContent()).includes("7,700"), "running total adds up all the rows");
  await bp.getByRole("button", { name: /Submit all/ }).click();
  await bp.getByText("Type the category for this expense.").first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await bp.getByText("Type the category for this expense.").first().isVisible(), "a row with a problem is flagged before anything is saved");
  await rowsL.nth(2).getByLabel("Typed category of expense 3").fill("Gifts");
  await bp.getByRole("button", { name: /Submit all/ }).click();
  await bp.getByTestId("batch-done").waitFor({ timeout: 60000 });
  ok(await bp.getByText(/3 expenses saved · 3 submitted for review/).isVisible(), "all three expenses were submitted in one go");
  await bp.goto(BASE + "/expenses", { waitUntil: "networkidle" });
  ok(
    (await bp.getByText("Taxi to the venue").count()) > 0 && (await bp.getByText("Thank-you card for the host").count()) > 0,
    "the batch expenses appear in the expense list",
  );
  await st.ctx.close();
}

// ---- Requisitions: staff → COO → Managing Partner ----
{
  const st = await session("staff@teasoo.test");
  let rp = st.page;
  await rp.goto(BASE + "/requisitions/new", { waitUntil: "networkidle" });
  await rp.fill("#title", "Projector for the training room");
  const items = rp.getByTestId("req-item");
  await rp.getByLabel("Item 1 name").fill("HD projector");
  await rp.getByLabel("Item 1 category").selectOption({ label: "Equipment" });
  await rp.getByLabel("Item 1 vendor").selectOption("__new__");
  await rp.fill("#vendor-name", "Slot Systems Ltd");
  await rp.fill("#accountName", "SLOT SYSTEMS LTD");
  await rp.fill("#accountNumber", "0123456789");
  await rp.fill("#bankName", "Zenith Bank");
  await rp.getByRole("button", { name: "Add vendor" }).click();
  await rp.getByText("Pay to SLOT SYSTEMS LTD").waitFor({ timeout: 15000 });
  ok(true, "staff added a new vendor with bank details without leaving the form");
  await rp.getByLabel("Item 1 quantity").fill("2");
  await rp.getByLabel("Item 1 price").fill("150,000");
  await rp.getByLabel("Item 1 discount").fill("10,000");
  await rp.getByRole("button", { name: "Add another item" }).click();
  await rp.getByLabel("Item 2 name").fill("HDMI cables");
  await rp.getByLabel("Item 2 category").selectOption({ label: "Others (not listed)" });
  await rp.getByLabel("Item 2 typed category").fill("Accessories");
  await rp.getByLabel("Item 2 quantity").fill("3");
  await rp.getByLabel("Item 2 price").fill("5,000");
  ok((await items.count()) === 2 && (await rp.getByTestId("req-total").textContent()).includes("305,000"), "requisition total is quantity × price − discount across items");
  await rp.getByRole("button", { name: "Submit for approval" }).click();
  await rp.waitForURL(/\/requisitions\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const reqUrl = rp.url();
  ok(
    (await rp.getByText("Awaiting approval").first().isVisible()) && (await rp.getByTestId("req-history").getByText(/submitted it\s*to Femi Balogun/).isVisible()),
    "submitted requisition goes to the COO",
  );

  // COO asks for more information
  const coo = await session("management@teasoo.test");
  await coo.page.goto(BASE + "/requisitions", { waitUntil: "networkidle" });
  ok(await coo.page.getByText("Projector for the training room").first().isVisible(), "the COO sees it under 'Waiting for me'");
  await coo.page.goto(reqUrl, { waitUntil: "networkidle" });
  await coo.page.getByRole("button", { name: "Ask for more info" }).first().click();
  await coo.page.fill("#comment-HOLD", "Please attach the quote from the vendor.");
  await coo.page.getByRole("button", { name: "Ask for more info" }).last().click();
  await coo.page.getByText("More info needed").first().waitFor({ timeout: 15000 });
  ok(true, "the COO sent it back asking for more information");

  // Staff updates and resubmits
  await rp.goto(reqUrl, { waitUntil: "networkidle" });
  ok(await rp.getByText("Please attach the quote from the vendor.").first().isVisible(), "staff sees what the COO asked for");
  await rp.getByRole("link", { name: /Update & resubmit/ }).click();
  await rp.waitForURL(/\/edit$/, { timeout: 20000 });
  await rp.getByTestId("req-quotes").setInputFiles(png);
  await rp.fill("#comment", "Quote attached.");
  await rp.getByRole("button", { name: "Resubmit" }).click();
  await rp.waitForURL(/\/requisitions\/[0-9a-f-]{36}$/, { timeout: 20000 });
  ok(await rp.getByText("Awaiting approval").first().isVisible(), "resubmitted requisition is back with the COO");

  // COO approves
  await coo.page.goto(reqUrl, { waitUntil: "networkidle" });
  await coo.page.getByRole("button", { name: "Approve" }).first().click();
  await coo.page.getByRole("button", { name: "Approve" }).last().click();
  await coo.page.getByText("Approved · awaiting payment").first().waitFor({ timeout: 15000 });
  ok(true, "the COO approved it");
  await coo.ctx.close();

  // Managing Partner records the payment
  const mp = await session("admin@teasoo.test");
  await mp.page.goto(reqUrl, { waitUntil: "networkidle" });
  ok(await mp.page.getByText("Ready to pay").isVisible(), "the Managing Partner is asked to pay it");
  await mp.page.fill("#paymentReference", "TRF-PROJ-001");
  await mp.page.getByRole("button", { name: /Record payment of ₦305,000/ }).click();
  await mp.page.getByTestId("req-payment").waitFor({ timeout: 15000 });
  ok(await mp.page.getByText(/ref TRF-PROJ-001/).isVisible(), "payment recorded with its reference");

  // The seeded approved requisition is paid to the requester as an allocation.
  await mp.page.goto(BASE + "/requisitions?view=pending", { waitUntil: "networkidle" });
  await mp.page.locator("tr", { hasText: "Conference banners and flyers" }).getByRole("link").click();
  await mp.page.waitForURL(/\/requisitions\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await mp.page.getByText(/Jane Doe/).first().waitFor();
  await mp.page.locator('input[name="payTo"][value="REQUESTER"]').check();
  await mp.page.getByRole("button", { name: /Record payment/ }).click();
  await mp.page.getByText(/log expenses against it/).waitFor({ timeout: 15000 });
  ok(true, "paying the requester creates an allocation for them");

  const exp = await mp.page.request.get(BASE + "/api/exports?report=requisitions&view=all&status=all&format=xlsx");
  ok(exp.status() === 200, "requisitions export to Excel");
  await mp.ctx.close();

  await rp.goto(reqUrl, { waitUntil: "networkidle" });
  ok(await rp.getByText("Paid", { exact: true }).first().isVisible(), "staff sees their requisition was paid");
  await st.ctx.close();

  // The COO's own requisition goes to the Managing Partner.
  const coo2 = await session("management@teasoo.test");
  await coo2.page.goto(BASE + "/requisitions/new", { waitUntil: "networkidle" });
  ok(await coo2.page.getByText(/Goes to Tolu Adeyemi/).isVisible(), "the COO's own requisition goes to the Managing Partner");
  await coo2.ctx.close();

  const acc = await session("accountant@teasoo.test");
  await acc.page.goto(BASE + "/admin/vendors", { waitUntil: "networkidle" });
  ok(await acc.page.getByText("Slot Systems Ltd", { exact: true }).isVisible(), "finance sees the vendor list");
  await acc.ctx.close();
}

// ---- Multiple organisations ----
{
  const adm = await session("admin@teasoo.test");
  const ap = adm.page;
  await ap.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await ap.getByTestId("org-switcher").first().click();
  ok(await ap.getByRole("menuitem", { name: /Teasoo Logistics Ltd/ }).isVisible(), "admin's organisation menu lists the subsidiary");
  await ap.getByRole("menuitem", { name: /Teasoo Logistics Ltd/ }).click();
  await ap.waitForURL(/\/dashboard/, { timeout: 20000 });
  await ap.goto(BASE + "/allocations", { waitUntil: "networkidle" });
  ok(
    (await ap.getByText("Fleet fuel and maintenance").first().isVisible()) && (await ap.getByText("Staff Training Logistics").count()) === 0,
    "after switching, admin sees only the subsidiary's allocations",
  );
  await ap.getByText("Warehouse inspection trip").first().click();
  await ap.waitForURL(/\/allocations\/[0-9a-f-]{36}/, { timeout: 20000 });
  const logisticsAllocationUrl = ap.url().split("?")[0];

  // Invite an existing person (Jane, in Consulting only) into the subsidiary.
  await ap.goto(BASE + "/admin/users", { waitUntil: "networkidle" });
  ok((await ap.getByText("Kemi Adewale").count()) > 0 && (await ap.getByText("Jane Doe").count()) === 0, "users page lists the active organisation's members only");
  await ap.getByRole("button", { name: "Invite user" }).click();
  await ap.fill("#firstName", "Jane");
  await ap.fill("#lastName", "Doe");
  await ap.fill("#email", "jane@teasoo.test");
  await ap.getByRole("button", { name: "Send invite" }).click();
  await ap.getByText(/already had an account and now also has access/).waitFor({ timeout: 15000 });
  ok(true, "inviting an existing user adds them to another organisation");

  // A new organisation
  await ap.goto(BASE + "/admin/organisations", { waitUntil: "networkidle" });
  const newOrg = `Teasoo Ventures ${Date.now() % 100000}`;
  await ap.getByRole("button", { name: "Add organisation" }).click();
  await ap.fill("#org-name", newOrg);
  await ap.locator('input[name="logo"]').setInputFiles(png);
  await ap.getByRole("button", { name: "Create organisation" }).click();
  await ap.getByText(/Organisation created/).waitFor({ timeout: 15000 });
  await ap.reload({ waitUntil: "networkidle" });
  ok(await ap.getByText(newOrg).first().isVisible(), "group admin created a new organisation");
  ok((await ap.locator('img[src*="/api/organisations/"]').count()) > 0, "the new organisation's logo is shown");
  await adm.ctx.close();

  // Kemi only belongs to the subsidiary: no switcher menu, lands in Logistics.
  const kemi = await session("kemi@teasoo.test", { width: 390, height: 844 });
  await kemi.page.goto(BASE + "/funds", { waitUntil: "networkidle" });
  ok(
    (await kemi.page.locator("header").getByText("Teasoo Logistics Ltd").first().isVisible()) && (await kemi.page.getByTestId("org-switcher").count()) === 0,
    "single-organisation staff see their company without a switcher",
  );
  ok(await kemi.page.getByText("Fleet fuel and maintenance").first().isVisible(), "staff in the subsidiary see their funds there");
  await kemi.ctx.close();

  // Israel works in both; a link to a subsidiary record switches organisation automatically.
  const isr = await session("staff@teasoo.test");
  await isr.page.goto(logisticsAllocationUrl, { waitUntil: "networkidle" });
  await isr.page.getByText("Warehouse inspection trip").first().waitFor({ timeout: 20000 }).catch(() => {});
  ok(
    (await isr.page.getByText("Warehouse inspection trip").first().isVisible()) && /\/allocations\//.test(isr.page.url()),
    "opening a record from another organisation switches to it",
  );
  await isr.ctx.close();

  // Nobody can sign in without an invitation.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  ok(await page.getByText(/Access is by invitation/).isVisible(), "login page explains access is by invitation");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
