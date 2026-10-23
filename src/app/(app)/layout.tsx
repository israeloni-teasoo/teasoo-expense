import type { ReactNode } from "react";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { allocations, claims, expenses } from "@/db/schema";
import { AppShell, type NavItem, type NavSection } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/current";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { unreadCount } from "@/lib/services/notifications";
import { runSweep } from "@/lib/services/sweep";
import { openFeedbackCount } from "@/lib/services/feedback";
import { pendingRequisitionCount } from "@/lib/services/requisitions";
import { logoutAction } from "@/app/actions/auth";
import { keepPasswordAction } from "@/app/actions/account";
import Link from "next/link";
import { PendingButton } from "@/components/ui/pending-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  await runSweep(user.organisationId).catch((e) => console.error("sweep failed", e));

  const [unread, reviewCount, claimCount, attentionCount, feedbackCount, requisitionCount] = await Promise.all([
    unreadCount(user.id),
    can(user.role, "expenses.review")
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(expenses)
          .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
          .where(and(eq(allocations.organisationId, user.organisationId), inArray(expenses.status, ["SUBMITTED", "UNDER_REVIEW"]), sql`${expenses.staffId} <> ${user.id}`))
          .then((r) => Number(r[0].c))
      : 0,
    can(user.role, "claims.review")
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(claims)
          .innerJoin(allocations, eq(allocations.id, claims.allocationId))
          .where(
            and(
              eq(allocations.organisationId, user.organisationId),
              inArray(claims.status, user.role === "ADMIN" ? ["SUBMITTED", "RECOMMENDED"] : ["SUBMITTED"]),
            ),
          )
          .then((r) => Number(r[0].c))
      : 0,
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(expenses)
      .innerJoin(allocations, eq(allocations.id, expenses.allocationId))
      .where(and(eq(allocations.organisationId, user.organisationId), eq(expenses.staffId, user.id), inArray(expenses.status, ["REJECTED", "NEEDS_CLARIFICATION"])))
      .then((r) => Number(r[0].c)),
    can(user.role, "feedback.manage") ? openFeedbackCount(user.organisationId) : 0,
    pendingRequisitionCount(user),
  ]);
  const requisitionsNav: NavItem = { href: "/requisitions", label: "Requisitions", icon: "requisition", badge: requisitionCount };

  const sections: NavSection[] = [];
  let bottomNav: NavItem[];

  if (user.role === "STAFF") {
    sections.push({
      items: [
        { href: "/dashboard", label: "Overview", icon: "home" },
        { href: "/funds", label: "My Funds", icon: "wallet" },
        { href: "/expenses", label: "Expenses", icon: "receipt", badge: attentionCount },
        { href: "/expenses/new", label: "Add Expense", icon: "plus" },
        { href: "/claims", label: "Claims", icon: "claims" },
        requisitionsNav,
        { href: "/notifications", label: "Notifications", icon: "bell", badge: unread },
        { href: "/feedback", label: "Feedback", icon: "feedback" },
        { href: "/profile", label: "Profile", icon: "user" },
      ],
    });
    bottomNav = [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/funds", label: "Funds", icon: "wallet" },
      { href: "/expenses/new", label: "Add", icon: "plus" },
      { href: "/expenses", label: "Expenses", icon: "receipt", badge: attentionCount },
      { href: "/notifications", label: "Alerts", icon: "bell", badge: unread },
    ];
  } else {
    const finance: NavItem[] = [{ href: "/dashboard", label: "Overview", icon: "home" }];
    if (can(user.role, "expenses.review")) finance.push({ href: "/review", label: "Review queue", icon: "review", badge: reviewCount });
    finance.push({ href: "/allocations", label: "Allocations", icon: "allocations" });
    finance.push({ href: "/expenses", label: "Expenses", icon: "receipt" });
    if (can(user.role, "staff.view")) finance.push({ href: "/staff", label: "Staff", icon: "users" });
    if (can(user.role, "allocations.reconcile")) finance.push({ href: "/reconciliation", label: "Reconciliation", icon: "scale" });
    if (can(user.role, "claims.review")) finance.push({ href: "/claims", label: "Claims", icon: "claims", badge: claimCount });
    finance.push(requisitionsNav);
    if (can(user.role, "reports.view")) finance.push({ href: "/reports", label: "Reports", icon: "chart" });
    if (can(user.role, "documents.viewAll")) finance.push({ href: "/documents", label: "Documents", icon: "file" });
    sections.push({ items: finance });

    if (can(user.role, "funds.own")) {
      sections.push({
        title: "My workspace",
        items: [
          { href: "/funds", label: "My Funds", icon: "wallet" },
          { href: "/expenses/new", label: "Add Expense", icon: "plus" },
        ],
      });
    }
    if (can(user.role, "admin.users") || can(user.role, "users.addAdhoc") || can(user.role, "audit.view")) {
      const admin: NavItem[] = [];
      if (can(user.role, "admin.users") || can(user.role, "users.addAdhoc")) admin.push({ href: "/admin/users", label: "Users", icon: "users" });
      if (can(user.role, "admin.users")) admin.push({ href: "/admin/roles", label: "Roles & permissions", icon: "shield" });
      if (can(user.role, "admin.config")) {
        admin.push({ href: "/admin/categories", label: "Categories", icon: "tags" });
        admin.push({ href: "/admin/departments", label: "Departments", icon: "building" });
        admin.push({ href: "/admin/projects", label: "Projects", icon: "folder" });
        admin.push({ href: "/admin/settings", label: "Settings", icon: "settings" });
      }
      if (user.isGroupAdmin) admin.push({ href: "/admin/organisations", label: "Organisations", icon: "building" });
      if (can(user.role, "vendors.manage")) admin.push({ href: "/admin/vendors", label: "Vendors", icon: "store" });
      if (can(user.role, "feedback.manage")) admin.push({ href: "/admin/feedback", label: "Feedback inbox", icon: "feedback", badge: feedbackCount });
      if (can(user.role, "audit.view")) admin.push({ href: "/admin/audit", label: "Audit log", icon: "audit" });
      sections.push({ title: "Administration", items: admin });
    }
    sections.push({
      title: "Account",
      items: [
        { href: "/notifications", label: "Notifications", icon: "bell", badge: unread },
        { href: "/feedback", label: "Feedback", icon: "feedback" },
        { href: "/profile", label: "Profile", icon: "user" },
      ],
    });
    bottomNav =
      user.role === "MANAGEMENT"
        ? [
            { href: "/dashboard", label: "Home", icon: "home" },
            { href: "/allocations", label: "Allocations", icon: "allocations" },
            { href: "/expenses", label: "Expenses", icon: "receipt" },
            { href: "/reports", label: "Reports", icon: "chart" },
            { href: "/notifications", label: "Alerts", icon: "bell", badge: unread },
          ]
        : [
            { href: "/dashboard", label: "Home", icon: "home" },
            { href: "/review", label: "Review", icon: "review", badge: reviewCount },
            { href: "/allocations/new", label: "Allocate", icon: "plus" },
            { href: "/allocations", label: "Allocations", icon: "allocations" },
            { href: "/expenses", label: "Expenses", icon: "receipt" },
          ];
  }

  return (
    <AppShell
      sections={sections}
      bottomNav={bottomNav}
      user={{ name: user.fullName, role: ROLE_LABELS[user.role], email: user.email }}
      unread={unread}
      org={{
        activeId: user.organisationId,
        manageHref: user.isGroupAdmin ? "/admin/organisations" : null,
        orgs: user.organisations.map((o) => ({
          id: o.organisationId,
          name: o.name,
          role: ROLE_LABELS[o.role],
          logoUrl: o.hasLogo ? `/api/organisations/${o.organisationId}/logo?v=${o.version}` : null,
        })),
      }}
      logoutAction={logoutAction}
    >
      {user.passwordSetByAdmin && user.hasPassword && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">You&apos;re using a password that was set for you.</span> You can keep it or choose your own.
          </p>
          <div className="flex shrink-0 gap-2">
            <Link href="/profile#password" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">
              Change password
            </Link>
            <form action={keepPasswordAction}>
              <PendingButton className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-300 hover:bg-blue-100">Keep it</PendingButton>
            </form>
          </div>
        </div>
      )}
      {children}
    </AppShell>
  );
}
