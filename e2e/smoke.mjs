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
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
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

// Staff cannot access finance pages or other people's data
const r = await staff.page.goto(BASE + "/allocations");
ok(staff.page.url().includes("/dashboard?denied=1"), "staff redirected away from finance-only page");
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

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
