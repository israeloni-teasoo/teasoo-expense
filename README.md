# Teasoo — Staff Expense & Funds Reconciliation Platform

An internal accountability platform that tracks money disbursed to staff and how it is spent:

**Funds received → Purpose → Expenses logged → Receipts attached → Balance calculated → Reviewed → Reconciled → Reported**

Every naira received has a traceable destination: who received it, why, how much, what it was spent on, where the evidence is, who approved it, how much remains, and whether the remainder was returned.

Responsive throughout: a sidebar layout on desktop, and on phones a bottom tab bar, card lists instead of wide tables, bottom-sheet dialogs, and a camera button for snapping receipts.

## Features

| Area | What's included |
| --- | --- |
| **Staff** | Dashboard (received / spent / pending / remaining + "needs your attention"), My Funds cards with utilisation bars, a 4-step Add Expense flow (fund → details → evidence → review showing "remaining after this expense"), receipt upload or phone camera capture, drafts, correct-and-resubmit, comments, personal-spend records, and over-spend / additional-funds claims |
| **Accountant** | Analytical dashboard (disbursed, expenses, pending, outstanding, overdue, rejected, missing receipts, ready to reconcile), charts, smart insights, review queue with bulk approve, approve / reject / ask a question, allocations, staff directory, record returns, reconciliation board, claims review, documents library, reports, exports |
| **Admin** | Everything above plus users & roles, categories (with receipt rules and suggestion keywords), departments, projects with budgets, validation rules, final claim approval, corrections, audit log |
| **Management** | Read-only dashboard, allocations, expenses, staff, documents, reports and exports |
| **Receipt scanning** | Snap or pick a receipt photo on the Add Expense details step: Tesseract.js reads it **in the browser** (free, no API key, the photo isn't sent anywhere for scanning) and fills in vendor, date, total and receipt number for the staff member to check. Undo restores what was there. PDFs can still be attached but aren't scanned |
| **Evidence** | Receipts are optional when submitting a funded expense — staff can add them later from the expense page, and reviewers can **request evidence** (the expense returns to the review queue automatically once the receipt is uploaded). Personal-spend claims always require a receipt. Admins can make receipts compulsory per category in Settings |
| **Review notes** | Reviewers approve, request evidence, ask a question, reject (reason required) or add a **note** — visible to the staff member or internal to finance only |
| **Feedback** | A feedback button on every page (with optional screenshot and the page it was sent from); administrators answer and resolve items in **Admin → Feedback inbox**, and the sender is notified |
| **Smart validation** | Insufficient balance (flag or block, configurable), possible duplicates (confirm to continue), future dates, required receipts, file type sniffing and size limits; category suggestions from the description; unusual-expense detection |
| **Reconciliation** | Unspent money is never assumed returned: returns are recorded with method, reference and evidence. Allocations can only be reconciled once every expense is resolved, claims are decided and the final balance is ₦0 |
| **Personal spend** | Money staff pay from their own pocket ("My own money" in Add Expense). It never reduces their allocated funds and is shown as **Owed to you / Owed to staff**. Once approved, an accountant or admin settles it either by a **company refund** or **from the staff member's unspent allocated funds** (recorded on both records) |
| **Over-spending** | Over-budget expenses are flagged; staff log a claim with evidence of approval → accountant recommends → admin approves → the funds are added to the allocation as an adjustment |
| **Reports & export** | Expense, staff accountability, allocation, category, project and department reports for Today / This week / This month / Last month / This quarter / This year / custom ranges. Exports to **Excel, CSV and PDF** for the current view, all expenses, selected rows, a single allocation, staff or project reports |
| **Audit & integrity** | Every important action is written to an append-only audit log (user, action, time, record, old/new values, IP / device) in the same transaction as the change. Financial records are voided, never deleted. Approved expenses can't be edited. Nobody can approve their own expense or decide their own claim |
| **Notifications** | In-app and email (Resend; each person can turn email off in their profile) notifications for new funds, approvals, rejections, questions, near-depletion, overdue allocations, new submissions, missing receipts, over-budget, ready-to-reconcile and claims |

## Tech stack

- **Next.js 15** (App Router, server components, server actions) + **TypeScript**
- **PostgreSQL** via **Drizzle ORM** (migrations in `drizzle/`)
- **Tailwind CSS**, lucide icons, **Recharts**
- **ExcelJS**, **jsPDF** for exports
- Session auth with `jose` (HS256 JWT in an httpOnly cookie) and `bcryptjs`
- **Google sign-in** (OpenID Connect with PKCE) for the company domain, **Resend** for email, **Supabase Storage** for receipts

### Signing in

- **Access is by invitation only.** An administrator or accountant invites people from **Users → Invite user**, choosing which organisation(s) they join. Nobody can sign up on their own; an uninvited Google account is refused with "You haven't been invited yet".
- **Company staff** (`@teasooconsulting.com`) get an invitation email and use **Sign in with Google**. Emails listed in `BOOTSTRAP_ADMIN_EMAILS` are the one exception: they become group administrators on their first sign-in, which is how the first admin is created on a fresh database. Personal Gmail and other domains are refused for Google sign-in (the ID token's `hd` claim must match).
- **Ad-hoc staff** without a company email get a readable generated (or typed) password in their invitation, or it's shown once to share if email isn't configured. After signing in they're asked whether to keep that password or choose their own. Accountants can invite Staff only and issue new login details for staff.

### Requisitions (purchase requests)

- Anyone can raise a requisition from **Requisitions → New requisition**: what it's for, the date it's needed by, delivery address, a reference, notes to the approver and line items (item, category incl. "Others", description, vendor, quantity, estimated price, discount). Quotes or invoices can be attached. Totals are calculated as quantity × price − discount.
- **Approval chain**: submitted requisitions go to the **approver** (e.g. the COO), who can approve, decline with a reason, or ask for more information (it goes back to the requester to update and resubmit). Approved requisitions go to the **payer** (e.g. the Managing Partner), who records the payment: date, method, transfer reference and proof of payment. The payer can also decline.
- Nobody approves their own requisition: the approver's own requisitions go to the payer for approval.
- Choose the approver, the payer and optional backups for each organisation in **Settings → Requisitions**.
- When paying, the payer can choose to send the money to the requester instead of the vendor; an allocation is then created so the requester accounts for it with receipts as usual.
- **Vendors** (with account name, number and bank) are saved for reuse. Staff can add one while raising a requisition; finance edit or archive them under **Administration → Vendors**.
- Requesters can recall a requisition that's awaiting approval to change it, or cancel it. Every step is in the approval history with comments, and everyone involved is notified (in the app and by email). The requisition page prints or saves as PDF, and the list exports to Excel, CSV or PDF.

### Organisations (subsidiaries)

- Each organisation has its own people, allocations, expenses, categories, departments, projects, settings, reports and audit log.
- **Group administrators** manage every organisation: **Administration → Organisations** to add a company (name, currency, logo), rename it or archive it. A new organisation starts with the default departments and categories, and its creator becomes its administrator. An organisation's own administrators can change its logo in **Settings**.
- One person can belong to several organisations with a different role and department in each. Pick the organisations when inviting, or tick/untick them later under **Users → Edit**. Inviting someone who already has an account just adds the organisation to it.
- The **organisation menu** next to the logo at the top left switches between companies (it only appears for people in more than one). Links to a record in another organisation — from a notification or an email — switch automatically.
- **Several expenses at once**: on **Add expense**, choose **Several at once** to log many expenses on one page — each row has its own fund, date, amount, category and receipt, with a running total and the balance left on each fund. Everything is checked before anything is saved; rows are then saved one by one, and any row that needs attention (e.g. a possible duplicate) stays on the page while the rest are saved.
- Expense categories include **Others**: when chosen, staff type the real category (e.g. "Others: Gifts"), which shows in lists, details and exports. Any category can be made free-text under **Categories**.
- Password reset by email is available to ad-hoc staff only.

### Money

All amounts are stored as **integer kobo** (`bigint`) and parsed from user input with string arithmetic — never with floating-point multiplication. Balances are always derived on the server from the underlying records (`src/lib/balance.ts`):

```
total funded = initial amount + adjustments (additional funding, reimbursements, corrections)
available    = total funded − approved − pending − returned
outstanding  = total funded − approved − returned            (must be ₦0 to reconcile)
```

### Receipts

Files are validated by their actual content (magic bytes), stored outside the database, and only reachable through `/api/documents/[id]`, which checks the viewer's access on every request. In production they live in a **private Supabase Storage bucket**; after the access check the route redirects to a 2-minute signed URL. Photos are downscaled in the browser before upload (≤2000px JPEG, typically a few hundred KB), which keeps uploads under Vercel's 4.5 MB request limit and stretches the storage free tier. `STORAGE_DRIVER=local` writes to a private folder for development.

## Getting started

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
cp .env.example .env          # then set DATABASE_URL and a long random AUTH_SECRET
npm install
npm run db:migrate            # create tables
npm run db:seed               # optional demo data (two organisations)
npm run dev                   # http://localhost:3000
```

Demo accounts (password `Password123`):

| Role | Email |
| --- | --- |
| Staff | `staff@teasoo.test` (also `john@`, `jane@`, `amaka@`) |
| Accountant | `accountant@teasoo.test` |
| Administrator | `admin@teasoo.test` |
| Management | `management@teasoo.test` |

`npm run db:reset` drops everything, re-runs migrations and re-seeds (refuses to run when `NODE_ENV=production`).

### Deploying to Vercel + Supabase

1. **Supabase** — create a project. From **Connect**, copy the *Transaction pooler* string (port 6543) for `DATABASE_URL` and the *Session pooler* string (port 5432) for `DIRECT_URL`. From **Project Settings → API**, copy the project URL (`SUPABASE_URL`) and the `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`, secret).
2. **Receipts bucket** — with those values in a local `.env`, run `npm run storage:setup` once to create the private `receipts` bucket (or create it in the dashboard with *Public* turned off).
3. **Google** — in Google Cloud Console create an OAuth client ID (*Web application*). Authorised redirect URI: `https://<your-domain>/api/auth/google/callback` (add `http://localhost:3000/api/auth/google/callback` for development). Set the consent screen to *Internal* so only Workspace accounts can use it.
4. **Resend** — add and verify the sending domain under **Domains** (DNS records), then create an API key. The default sender is `notifications@expense.teasooconsulting.com`; set `EMAIL_FROM` if you verify a different domain.
5. **Vercel** — import the repository and set the environment variables from `.env.example`, including `BOOTSTRAP_ADMIN_EMAILS=<your email>`. Tick **Production and Preview** for every variable — branch deployments are *Preview* builds and don't see Production-only variables. The `vercel-build` script checks the environment (`npm run check-env` prints exactly what's missing), runs database migrations, then `next build`.

   If you connected Supabase through the **Vercel Marketplace integration**, its variables are picked up automatically: `POSTGRES_URL` is used as the app connection, `POSTGRES_URL_NON_POOLING` for migrations, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` switch receipt storage to Supabase. You then only need to add `AUTH_SECRET`, the Google and Resend keys and `BOOTSTRAP_ADMIN_EMAILS`. `APP_URL` defaults to the project's production domain.
6. Sign in with Google using the bootstrap admin email. The first organisation, its default departments and categories are created automatically on that first sign-in. Then add subsidiaries under **Organisations** and invite people under **Users**. Don't run `db:seed` against production — it's demo data.

Session cookies are `Secure` in production, so serve over HTTPS (Vercel does). The demo-account hint on the login page is hidden in production unless `SHOW_DEMO_ACCOUNTS=1`.

Without `RESEND_API_KEY`, emails are written to the server log instead of being sent, and new ad-hoc staff passwords are shown on screen to share.

**Troubleshooting:** **Admin → Settings → Integrations** shows which services are switched on, the Google redirect URI for the current domain, and has **Test storage** / **Send test email** buttons that report the exact error from Supabase or Resend. Unexpected errors show a short reference (e.g. `ref K3F9QZ`); search the Vercel function logs for `ref=K3F9QZ` to find the details. Supabase's newer `sb_secret_…` keys and the classic `service_role` JWT both work; the receipts bucket is created automatically on the first upload if it doesn't exist.

## Testing

```bash
npm test              # unit tests: money, balances, periods, category suggestions, receipt parsing, Google claims
npm run typecheck
npm run lint
npm run test:smoke    # end-to-end workflow against a running app with fresh seed data (needs Playwright)
npm run storage:setup # create the private Supabase receipts bucket (once)
npm run check-env     # list missing / optional environment settings
```

The smoke test drives the real UI: staff logs an expense with a receipt on a phone-sized screen, sees the duplicate warning, uploads a forged PDF (rejected), accountant approves, records a return, reconciles to ₦0, downloads Excel/CSV/PDF exports, an over-spend claim goes through recommend → approve, an accountant invites an ad-hoc staff member who signs in with the issued password and chooses to keep it, staff record an "Others" expense with a typed category, and an admin switches to the subsidiary, invites an existing user into it and creates a new organisation with a logo.

## REST API

All routes use the session cookie (`POST /api/auth` with `{ email, password }` to sign in). Amounts in requests are naira; responses include naira strings and kobo integers.

| Method | Route | Notes |
| --- | --- | --- |
| `POST` / `DELETE` | `/api/auth` | Sign in (ad-hoc staff password) / out |
| `GET` | `/api/auth/google` | Start Google sign-in (browser redirect) |
| `GET` / `POST` | `/api/allocations` | List (own for staff, all for finance) / create |
| `GET` | `/api/allocations/:id` | Allocation, balance, expenses, adjustments, returns, timeline |
| `GET` / `POST` | `/api/expenses` | Filterable list / create (`submit`, `confirmDuplicate`, `confirmOverBudget` flags) |
| `GET` | `/api/expenses/:id` | Expense with documents, reviews and allocation balance |
| `POST` | `/api/reviews` | `{ expenseId, action: APPROVED \| REJECTED \| REQUEST_CLARIFICATION \| UNDER_REVIEW, comment }` |
| `POST` | `/api/reconciliations` | `{ allocationId, notes }` |
| `GET` | `/api/reports` | `?report=expenses\|staff\|allocations\|categories\|projects\|departments&period=…` |
| `GET` | `/api/exports` | `?report=…&format=xlsx\|csv\|pdf` plus filters, `ids=` or `allocationId=` |
| `GET` | `/api/documents/:id` | Access-checked file (`?download=1` to download) |
| `GET` / `POST` | `/api/notifications` | List / mark read |
| `GET` | `/api/categories`, `/api/projects`, `/api/departments`, `/api/users` | Reference data |
| `GET` | `/api/health` | Database health check |

## Project layout

```
src/
  app/(app)/…          authenticated screens (dashboard, funds, expenses, allocations, review,
                       staff, reconciliation, claims, reports, documents, notifications, profile, admin/*)
  app/actions/         server actions (form handlers)
  app/api/             REST API, document delivery, exports
  components/          UI primitives, app shell, domain components, forms, charts
  db/                  Drizzle schema, migrations runner, seed
  lib/                 money, balances, dates, auth, RBAC, audit, notifications, storage, export
  lib/services/        business logic shared by the UI and the API
drizzle/               SQL migrations
e2e/smoke.mjs          end-to-end workflow test
```

## Roadmap (from the spec, not yet built)

WhatsApp notifications, recurring allocations, bulk imports, and Phase 3 finance-operations features (purchase requests, vendors, budgets, bank matching, accounting integrations).
