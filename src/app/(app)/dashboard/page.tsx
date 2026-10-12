import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, Clock, FileWarning, HandCoins, Hourglass, Lightbulb, Plus, Scale, Users, Wallet } from "lucide-react";
import { AllocationCard } from "@/components/domain/allocation-card";
import { ExpenseTable } from "@/components/domain/expense-table";
import { RankedBars, WeeklyBars } from "@/components/charts/charts";
import { ExpenseStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/current";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { can } from "@/lib/rbac";
import { financeDashboard, staffDashboard } from "@/lib/services/reports";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const deniedBanner = denied ? (
    <div className="mb-4">
      <Alert tone="amber" title="Access restricted">
        Your role doesn&apos;t have access to that page.
      </Alert>
    </div>
  ) : null;
  if (can(user.role, "allocations.viewAll")) {
    return (
      <>
        {deniedBanner}
        <FinanceDashboard />
      </>
    );
  }
  return (
    <>
      {deniedBanner}
      <StaffDashboard />
    </>
  );
}

async function StaffDashboard() {
  const user = await requireUser();
  const d = await staffDashboard(user);
  const t = d.totals;
  const firstName = user.firstName;
  return (
    <div>
      <PageHeader
        title={`Hello, ${firstName}`}
        description="How much you were given, what you've spent, and what's left."
        actions={
          <LinkButton href="/expenses/new" className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Add expense
          </LinkButton>
        }
      />

      <section aria-label="My funds" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <StatCard tone="brand" label="Remaining" value={formatMoney(t.remaining)} hint={t.remaining < 0 ? "You have spent more than you received" : "Available to spend"} icon={<Wallet className="h-4 w-4" />} />
        </div>
        <StatCard label="Total received" value={formatMoney(t.received)} hint={`${d.active.length} active fund${d.active.length === 1 ? "" : "s"}`} />
        <StatCard label="Total spent" value={formatMoney(t.spent)} hint="Approved + awaiting review" />
        <StatCard label="Pending review" value={formatMoney(t.pending)} hint="Waiting for finance" tone={t.pending ? "amber" : "default"} />
      </section>

      {(t.personalOwed > 0 || t.personalPending > 0) && (
        <div className="mt-3 flex flex-col gap-1 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">Owed to you: {formatMoney(t.personalOwed)}</span>
            {t.personalPending > 0 && <span className="text-violet-800"> · {formatMoney(t.personalPending)} awaiting review</span>}
          </p>
          <p className="text-xs text-violet-800">Money you spent from your own pocket — not taken from your allocated funds. Finance will refund you or settle it.</p>
        </div>
      )}

      {d.attention.length > 0 && (
        <Card className="mt-6 border-amber-200">
          <CardHeader title="Needs your attention" description="Expenses that were returned to you or haven't been submitted yet." />
          <ul className="divide-y divide-gray-100">
            {d.attention.map((e) => (
              <li key={e.id}>
                <Link href={`/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", e.status === "DRAFT" ? "text-gray-400" : "text-amber-500")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{e.description}</p>
                    <p className="text-xs text-gray-500">
                      {formatMoney(e.amount)} · {formatDate(e.expenseDate, "short")} · updated {relativeTime(e.updatedAt)}
                    </p>
                  </div>
                  <ExpenseStatusBadge status={e.status} staffView />
                  <ArrowRight className="hidden h-4 w-4 text-gray-400 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">My funds</h2>
          <Link href="/funds" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            View all
          </Link>
        </div>
        {d.active.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.active.map((a) => (
              <AllocationCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Banknote className="h-6 w-6" />}
              title="No active funds"
              description="When finance sends you money for a task, it will appear here. Spent your own money for work? Log it as a personal spend."
              action={
                <LinkButton href="/funds" variant="secondary">
                  Log personal spend
                </LinkButton>
              }
            />
          </Card>
        )}
      </section>

      <Card className="mt-8">
        <CardHeader
          title="Recent expenses"
          action={
            <Link href="/expenses" className="text-sm font-medium text-brand-700">
              See all
            </Link>
          }
        />
        {d.recent.length ? (
          <ExpenseTable rows={d.recent.map((r) => ({ ...r, reference: "", vendor: null }))} staffView />
        ) : (
          <EmptyState title="No expenses yet" description="Log your first expense in under a minute." action={<LinkButton href="/expenses/new">Add expense</LinkButton>} />
        )}
      </Card>
    </div>
  );
}

async function FinanceDashboard() {
  const user = await requireUser();
  const d = await financeDashboard(user);
  const m = d.metrics;
  const canReview = can(user.role, "expenses.review");
  return (
    <div>
      <PageHeader
        title="Overview"
        description="Where every naira disbursed to staff currently stands."
        actions={
          can(user.role, "allocations.create") ? (
            <LinkButton href="/allocations/new">
              <Plus className="h-4 w-4" /> New allocation
            </LinkButton>
          ) : (
            <LinkButton href="/reports" variant="secondary">
              View reports
            </LinkButton>
          )
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard tone="brand" label="Funds disbursed" value={formatMoney(m.disbursed)} hint={`${m.reconciledPct}% of allocations reconciled`} icon={<Banknote className="h-4 w-4" />} href="/allocations?status=all" />
        <StatCard label="Total expenses" value={formatMoney(m.expenses)} hint="Approved + pending" href="/expenses" />
        <StatCard label="Pending review" value={formatMoney(m.pendingReview)} hint={`${m.pendingCount} expense${m.pendingCount === 1 ? "" : "s"}`} tone={m.pendingCount ? "amber" : "default"} href={canReview ? "/review" : "/expenses?status=review"} />
        <StatCard label="Outstanding balance" value={formatMoney(m.outstanding)} hint={`Held by ${m.staffWithOutstanding} staff`} href="/staff" />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        {[
          { label: "Active allocations", value: m.activeAllocations, icon: Wallet, href: "/allocations?status=ACTIVE" },
          { label: "Pending expenses", value: m.pendingCount, icon: Hourglass, href: canReview ? "/review" : "/expenses?status=review" },
          { label: "Overdue", value: m.overdueCount, icon: Clock, href: "/allocations?overdue=1", alert: m.overdueCount > 0 },
          { label: "Rejected", value: m.rejectedCount, icon: AlertTriangle, href: "/expenses?status=REJECTED" },
          { label: "Without receipts", value: m.noReceiptCount, icon: FileWarning, href: "/expenses?receipt=no", alert: m.noReceiptCount > 0 },
          { label: "Ready to reconcile", value: m.readyToReconcile, icon: Scale, href: "/reconciliation" },
          { label: "Owed to staff (personal spend)", value: formatMoneyCompact(m.owedToStaff), icon: HandCoins, href: "/reconciliation#personal", alert: m.owedToStaff > 0 },
        ].map((x) => (
          <Link key={x.label} href={x.href} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm hover:shadow-md">
            <span className={cn("rounded-lg p-2", x.alert ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500")}>
              <x.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold tabular-nums leading-5 text-gray-900">{x.value}</span>
              <span className="block truncate text-xs text-gray-500">{x.label}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {canReview && (
            <Card>
              <CardHeader
                title="Awaiting review"
                description="Oldest submissions first"
                action={
                  <Link href="/review" className="text-sm font-medium text-brand-700">
                    Open queue
                  </Link>
                }
              />
              {d.queue.length ? (
                <ul className="divide-y divide-gray-100">
                  {d.queue.map((q) => (
                    <li key={q.id}>
                      <Link href={`/expenses/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{q.description}</p>
                          <p className="truncate text-xs text-gray-500">
                            {q.staffName} · submitted {relativeTime(q.submittedAt)}
                          </p>
                        </div>
                        {q.overBudget && <AlertTriangle className="h-4 w-4 text-orange-500" aria-label="Over budget" />}
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(q.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="All caught up" description="No expenses are waiting for review." />
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Spending over time" description="Weekly approved + pending expenses, last 8 weeks" />
            <CardBody>
              <WeeklyBars data={d.charts.weekly} />
            </CardBody>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Spending by category" />
              <CardBody>
                <RankedBars data={d.charts.byCategory} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Spending by staff" />
              <CardBody>
                <RankedBars data={d.charts.byStaff} />
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Spending by project" />
            <CardBody>
              <RankedBars data={d.charts.byProject} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Insights" description="Things worth a closer look" />
            {d.insights.length ? (
              <ul className="divide-y divide-gray-100">
                {d.insights.map((i, idx) => {
                  const body = (
                    <div className="flex gap-3 px-4 py-3 sm:px-5">
                      <span
                        className={cn(
                          "mt-0.5 h-fit rounded-lg p-1.5",
                          i.tone === "red" ? "bg-red-50 text-red-600" : i.tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600",
                        )}
                      >
                        {i.tone === "blue" ? <Lightbulb className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{i.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{i.body}</p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={idx}>
                      {i.href ? (
                        <Link href={i.href} className="block hover:bg-gray-50">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing unusual" description="No anomalies detected." />
            )}
          </Card>

          <Card>
            <CardHeader title="Overdue allocations" action={<Link href="/allocations?overdue=1" className="text-sm font-medium text-brand-700">All</Link>} />
            {d.overdue.length ? (
              <ul className="divide-y divide-gray-100">
                {d.overdue.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href={`/allocations/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{a.purpose}</p>
                        <p className="text-xs text-red-600">
                          {a.staffName} · due {formatDate(a.expectedCompletionDate, "short")}
                        </p>
                      </div>
                      <span className="text-sm font-medium tabular-nums">{formatMoney(a.balance.available)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Users className="h-6 w-6" />} title="Nothing overdue" />
            )}
          </Card>

          <Card>
            <CardHeader title="Ready to reconcile" action={<Link href="/reconciliation" className="text-sm font-medium text-brand-700">Open</Link>} />
            {d.ready.length ? (
              <ul className="divide-y divide-gray-100">
                {d.ready.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href={`/allocations/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{a.purpose}</p>
                        <p className="text-xs text-gray-500">{a.staffName}</p>
                      </div>
                      <span className="text-sm tabular-nums">{formatMoney(a.balance.totalFunded)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing ready yet" description="Allocations appear here once every expense is approved and unspent funds are returned." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
