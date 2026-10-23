import type { Role } from "@/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  STAFF: "Staff",
  ACCOUNTANT: "Accountant",
  ADMIN: "Administrator",
  MANAGEMENT: "Management",
};

export const PERMISSIONS = {
  "funds.own": "View own allocations and log expenses",
  "expenses.viewAll": "View all staff expenses",
  "allocations.viewAll": "View all allocations",
  "allocations.create": "Create allocations and add funding",
  "expenses.review": "Approve, reject or query expenses",
  "expenses.void": "Void expenses",
  "returns.record": "Record fund returns",
  "allocations.reconcile": "Reconcile allocations",
  "claims.review": "Review over-spend and funding claims",
  "claims.approve": "Give final approval to claims",
  "reports.view": "View reports and analytics",
  "reports.export": "Export data (CSV, Excel, PDF)",
  "documents.viewAll": "View and download all documents",
  "staff.view": "View staff directory",
  "users.addAdhoc": "Add ad-hoc staff (no company email) and send their login details",
  "admin.users": "Manage users and roles",
  "admin.config": "Configure categories, departments, projects and rules",
  "audit.view": "View audit logs",
  "feedback.manage": "Read, answer and resolve feedback from all users",
  "requisitions.create": "Raise requisitions (purchase requests)",
  "requisitions.viewAll": "View all requisitions",
  "vendors.manage": "Edit and archive saved vendors",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  STAFF: ["funds.own", "requisitions.create"],
  ACCOUNTANT: [
    "funds.own",
    "expenses.viewAll",
    "allocations.viewAll",
    "allocations.create",
    "expenses.review",
    "expenses.void",
    "returns.record",
    "allocations.reconcile",
    "claims.review",
    "reports.view",
    "reports.export",
    "documents.viewAll",
    "staff.view",
    "users.addAdhoc",
    "audit.view",
    "requisitions.create",
    "requisitions.viewAll",
    "vendors.manage",
  ],
  ADMIN: Object.keys(PERMISSIONS) as Permission[],
  MANAGEMENT: [
    "expenses.viewAll",
    "allocations.viewAll",
    "reports.view",
    "reports.export",
    "documents.viewAll",
    "staff.view",
    "requisitions.create",
    "requisitions.viewAll",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Roles with an oversight (finance) view of the organisation. */
export function isFinanceRole(role: Role) {
  return can(role, "allocations.viewAll");
}
