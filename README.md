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
| **Smart validation** | Insufficient balance (flag or block, configurable), possible duplicates (confirm to continue), future dates, required receipts, file type sniffing and size limits; category suggestions from the description; unusual-expense detection |
| **Reconciliation** | Unspent money is never assumed returned: returns are recorded with method, reference and evidence. Allocations can only be reconciled once every expense is resolved, claims are decided and the final balance is ₦0 |
| **Over-spending** | Over-budget expenses are flagged; staff log a claim with evidence of approval → accountant recommends → admin approves → the funds are added to the allocation as an adjustment |
| **Reports & export** | Expense, staff accountability, allocation, category, project and department reports for Today / This week / This month / Last month / This quarter / This year / custom ranges. Exports to **Excel, CSV and PDF** for the current view, all expenses, selected rows, a single allocation, staff or project reports |
| **Audit & integrity** | Every important action is written to an append-only audit log (user, action, time, record, old/new values, IP / device) in the same transaction as the change. Financial records are voided, never deleted. Approved expenses can't be edited. Nobody can approve their own expense or decide their own claim |
| **Notifications** | In-app notifications for new funds, approvals, rejections, questions, near-depletion, overdue allocations, new submissions, missing receipts, over-budget, ready-to-reconcile and claims |

## Tech stack

- **Next.js 15** (App Router, server components, server actions) + **TypeScript**
- **PostgreSQL** via **Drizzle ORM** (migrations in `drizzle/`)
- **Tailwind CSS**, lucide icons, **Recharts**
- **ExcelJS**, **jsPDF** for exports
- Session auth with `jose` (HS256 JWT in an httpOnly cookie) and `bcryptjs`

### Money

All amounts are stored as **integer kobo** (`bigint`) and parsed from user input with string arithmetic — never with floating-point multiplication. Balances are always derived on the server from the underlying records (`src/lib/balance.ts`):

```
total funded = initial amount + adjustments (additional funding, reimbursements, corrections)
available    = total funded − approved − pending − returned
outstanding  = total funded − approved − returned            (must be ₦0 to reconcile)
```

### Receipts

Files are validated by their actual content (magic bytes), stored outside the database, and only reachable through `/api/documents/[id]`, which checks the viewer's access on every request. The default driver writes to a private directory (`STORAGE_DIR`); implement `StorageDriver` in `src/lib/storage.ts` to use S3, Cloudflare R2 or Supabase Storage.

## Getting started

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
cp .env.example .env          # then set DATABASE_URL and a long random AUTH_SECRET
npm install
npm run db:migrate            # create tables
npm run db:seed               # optional demo organisation
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

### Production

```bash
npm run build
npm run db:migrate
npm start
```

Set `AUTH_SECRET`, `DATABASE_URL`, `APP_URL`, and serve over HTTPS (session cookies are `Secure` in production). The demo-account hint on the login page is hidden in production unless `SHOW_DEMO_ACCOUNTS=1`.

Password resets: without an email service configured, reset links are written to the server log (`[password-reset]`); administrators can also set a new password from **Users**.

## Testing

```bash
npm test              # unit tests: money parsing, balance maths, reporting periods, category suggestions
npm run typecheck
npm run lint
npm run test:smoke    # end-to-end workflow against a running app with fresh seed data (needs Playwright)
```

The smoke test drives the real UI: staff logs an expense with a receipt on a phone-sized screen, sees the duplicate warning, uploads a forged PDF (rejected), accountant approves, records a return, reconciles to ₦0, downloads Excel/CSV/PDF exports, and an over-spend claim goes through recommend → approve.

## REST API

All routes use the session cookie (`POST /api/auth` with `{ email, password }` to sign in). Amounts in requests are naira; responses include naira strings and kobo integers.

| Method | Route | Notes |
| --- | --- | --- |
| `POST` / `DELETE` | `/api/auth` | Sign in / out |
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

Receipt OCR, Google / Microsoft sign-in, email & WhatsApp notifications, recurring allocations, bulk imports, S3/R2 storage driver, and Phase 3 finance-operations features (purchase requests, vendors, budgets, bank matching, accounting integrations).
