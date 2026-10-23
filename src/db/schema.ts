import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * All monetary values are stored as integers in the smallest currency unit
 * (kobo for NGN). They are never represented as floating-point naira.
 */
const money = (name: string) => bigint(name, { mode: "number" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const roleEnum = pgEnum("role", ["STAFF", "ACCOUNTANT", "ADMIN", "MANAGEMENT"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);
export const allocationKindEnum = pgEnum("allocation_kind", ["ADVANCE", "REIMBURSEMENT"]);
export const allocationStatusEnum = pgEnum("allocation_status", [
  "ACTIVE",
  "RECONCILED",
  "ARCHIVED",
  "VOIDED",
]);
export const adjustmentTypeEnum = pgEnum("adjustment_type", [
  "ADDITIONAL_FUNDING",
  "REIMBURSEMENT",
  "CORRECTION",
  "TRANSFER",
]);
export const expenseStatusEnum = pgEnum("expense_status", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_CLARIFICATION",
  "APPROVED",
  "REJECTED",
  "RECONCILED",
  "VOIDED",
]);
export const reviewActionEnum = pgEnum("review_action", [
  "SUBMITTED",
  "RESUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "REQUEST_CLARIFICATION",
  "REQUEST_EVIDENCE",
  "EVIDENCE_ADDED",
  "COMMENT",
  "VOIDED",
]);
export const documentKindEnum = pgEnum("document_kind", [
  "RECEIPT",
  "SUPPORTING",
  "TRANSFER_RECEIPT",
  "RETURN_EVIDENCE",
  "AUTHORIZATION",
  "SCREENSHOT",
  "QUOTE",
  "PAYMENT_PROOF",
]);
export const requisitionStatusEnum = pgEnum("requisition_status", [
  "DRAFT",
  "AWAITING_APPROVAL",
  "ON_HOLD",
  "APPROVED",
  "REJECTED",
  "PROCESSED",
  "CANCELLED",
]);
export const requisitionEventEnum = pgEnum("requisition_event", [
  "CREATED",
  "SUBMITTED",
  "RECALLED",
  "RESUBMITTED",
  "APPROVED",
  "REJECTED",
  "INFO_REQUESTED",
  "PROCESSED",
  "CANCELLED",
  "COMMENT",
]);
export const feedbackCategoryEnum = pgEnum("feedback_category", ["BUG", "IDEA", "QUESTION", "OTHER"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export const claimTypeEnum = pgEnum("claim_type", ["ADDITIONAL_FUNDS", "REIMBURSEMENT"]);
export const claimStatusEnum = pgEnum("claim_status", [
  "SUBMITTED",
  "RECOMMENDED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type AllocationStatus = (typeof allocationStatusEnum.enumValues)[number];
export type AllocationKind = (typeof allocationKindEnum.enumValues)[number];
export type AdjustmentType = (typeof adjustmentTypeEnum.enumValues)[number];
export type ExpenseStatus = (typeof expenseStatusEnum.enumValues)[number];
export type ReviewAction = (typeof reviewActionEnum.enumValues)[number];
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type ClaimType = (typeof claimTypeEnum.enumValues)[number];
export type ClaimStatus = (typeof claimStatusEnum.enumValues)[number];
export type FeedbackCategory = (typeof feedbackCategoryEnum.enumValues)[number];
export type FeedbackStatus = (typeof feedbackStatusEnum.enumValues)[number];
export type RequisitionStatus = (typeof requisitionStatusEnum.enumValues)[number];
export type RequisitionEventType = (typeof requisitionEventEnum.enumValues)[number];

export type OrgSettings = {
  /** Block expenses that exceed the available balance instead of flagging them as over budget. */
  blockOverspend: boolean;
  /** Warn the user when a similar expense already exists. */
  duplicateDetection: boolean;
  /** Reject expense dates in the future. */
  blockFutureDates: boolean;
  /** Require receipts at submission for funded expenses in categories marked "receipt required" (personal spend always requires one). */
  requireReceipt: boolean;
  /** Maximum upload size in megabytes. */
  maxUploadMb: number;
  /** Notify when an allocation's utilisation crosses this percentage. */
  nearDepletionPercent: number;
  /** Expenses this many times above the 90-day category average are flagged as unusual. */
  unusualMultiplier: number;
  /** Requisitions: first approver (e.g. the COO) and an optional backup. */
  requisitionApproverId?: string | null;
  requisitionApproverBackupId?: string | null;
  /** Requisitions: who executes/pays approved requests (e.g. the Managing Partner) and an optional backup. */
  requisitionExecutorId?: string | null;
  requisitionExecutorBackupId?: string | null;
  /** Requisition reference prefix, e.g. "TC" → TC-PR-00100. Defaults to the organisation's initials. */
  requisitionPrefix?: string | null;
  /** Shown under the logo on printed/PDF documents such as purchase requests. */
  contactAddress?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
};

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  blockOverspend: false,
  duplicateDetection: true,
  blockFutureDates: true,
  requireReceipt: false,
  maxUploadMb: 4,
  nearDepletionPercent: 80,
  unusualMultiplier: 3,
};

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("NGN"),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default(DEFAULT_ORG_SETTINGS),
  lastSweepAt: timestamp("last_sweep_at", { withTimezone: true }),
  /** Storage key of the organisation's logo (served through /api/organisations/[id]/logo). */
  logoKey: text("logo_key"),
  logoType: text("logo_type"),
  /** Archived organisations are hidden from the switcher and can't be signed into. */
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  code: text("code"),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    departmentId: uuid("department_id").references(() => departments.id),
    role: roleEnum("role").notNull().default("STAFF"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    jobTitle: text("job_title"),
    /** Null for people who sign in with Google only. */
    passwordHash: text("password_hash"),
    /** Google account subject ("sub" claim), linked on first Google sign-in. */
    googleSub: text("google_sub").unique(),
    /** True while the user still has the password an admin/accountant set for them. */
    passwordSetByAdmin: boolean("password_set_by_admin").notNull().default(false),
    emailNotifications: boolean("email_notifications").notNull().default(true),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    resetTokenHash: text("reset_token_hash"),
    resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
    /** Group admins manage every organisation (create subsidiaries, invite into any of them). */
    isGroupAdmin: boolean("is_group_admin").notNull().default(false),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    invitedBy: uuid("invited_by"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

/**
 * A person's access to one organisation. Role, department and status are per organisation,
 * so the same person can be staff in one subsidiary and an accountant in another.
 * (users.organisationId / role / departmentId hold the defaults from when they were first invited.)
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    role: roleEnum("role").notNull().default("STAFF"),
    departmentId: uuid("department_id").references(() => departments.id),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    invitedBy: uuid("invited_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_user_org_idx").on(t.userId, t.organisationId), index("memberships_org_idx").on(t.organisationId)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  departmentId: uuid("department_id").references(() => departments.id),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  budget: money("budget"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const expenseCategories = pgTable("expense_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  description: text("description"),
  /** Comma-separated keywords used for smart category suggestions. */
  keywords: text("keywords"),
  receiptRequired: boolean("receipt_required").notNull().default(true),
  /** The "Others" category: staff type the real category in expenses.categoryOther. */
  isOther: boolean("is_other").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    reference: text("reference").notNull().unique(),
    kind: allocationKindEnum("kind").notNull().default("ADVANCE"),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id),
    departmentId: uuid("department_id").references(() => departments.id),
    projectId: uuid("project_id").references(() => projects.id),
    purpose: text("purpose").notNull(),
    initialAmount: money("initial_amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    dateReceived: date("date_received").notNull(),
    expectedCompletionDate: date("expected_completion_date"),
    status: allocationStatusEnum("status").notNull().default("ACTIVE"),
    transferReference: text("transfer_reference"),
    fundingSource: text("funding_source"),
    approvingOfficer: text("approving_officer"),
    notes: text("notes"),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("allocations_staff_idx").on(t.staffId), index("allocations_status_idx").on(t.status)],
);

export const allocationAdjustments = pgTable("allocation_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => allocations.id),
  type: adjustmentTypeEnum("type").notNull(),
  /** Signed amount in kobo. Positive adds funds, negative removes. */
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  reference: text("reference"),
  claimId: uuid("claim_id"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => allocations.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    projectId: uuid("project_id").references(() => projects.id),
    departmentId: uuid("department_id").references(() => departments.id),
    expenseDate: date("expense_date").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("NGN"),
    vendor: text("vendor"),
    description: text("description").notNull(),
    /** Free-text category typed by staff when the "Others" category is chosen. */
    categoryOther: text("category_other"),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    notes: text("notes"),
    status: expenseStatusEnum("status").notNull().default("DRAFT"),
    overBudget: boolean("over_budget").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    voidReason: text("void_reason"),
    ...timestamps,
  },
  (t) => [
    index("expenses_allocation_idx").on(t.allocationId),
    index("expenses_staff_idx").on(t.staffId),
    index("expenses_status_idx").on(t.status),
    index("expenses_date_idx").on(t.expenseDate),
  ],
);

export const fundReturns = pgTable("fund_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => allocations.id),
  amount: money("amount").notNull(),
  returnDate: date("return_date").notNull(),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => allocations.id),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => users.id),
  type: claimTypeEnum("type").notNull(),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  authorizedBy: text("authorized_by"),
  status: claimStatusEnum("status").notNull().default("SUBMITTED"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewComment: text("review_comment"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionComment: text("decision_comment"),
  ...timestamps,
});

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    category: feedbackCategoryEnum("category").notNull().default("OTHER"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    /** Page the person was on when they sent it. */
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    status: feedbackStatusEnum("status").notNull().default("OPEN"),
    response: text("response"),
    respondedBy: uuid("responded_by").references(() => users.id),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("feedback_status_idx").on(t.organisationId, t.status)],
);

/** Suppliers that requisitions pay, with their bank details. */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    name: text("name").notNull(),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    bankName: text("bank_name"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("vendors_org_idx").on(t.organisationId)],
);

/**
 * A purchase request ("requisition"): staff ask for money to be paid out, the approver (COO)
 * approves, declines or asks for more information, then the executor (Managing Partner) pays.
 */
export const requisitions = pgTable(
  "requisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    reference: text("reference").notNull().unique(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    departmentId: uuid("department_id").references(() => departments.id),
    projectId: uuid("project_id").references(() => projects.id),
    /** Why the money is needed. */
    title: text("title").notNull(),
    expectedDate: date("expected_date").notNull(),
    deliveryAddress: text("delivery_address"),
    /** The requester's own reference (e.g. a quote or invoice number). */
    externalReference: text("external_reference"),
    notesToApprover: text("notes_to_approver"),
    total: money("total").notNull().default(0),
    status: requisitionStatusEnum("status").notNull().default("DRAFT"),
    /** Who must act next (approver while awaiting approval, executor once approved). */
    currentApproverId: uuid("current_approver_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedBy: uuid("processed_by").references(() => users.id),
    paymentDate: date("payment_date"),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    paymentNotes: text("payment_notes"),
    /** Set when the money was given to the requester as an allocation to account for. */
    allocationId: uuid("allocation_id").references(() => allocations.id),
    ...timestamps,
  },
  (t) => [
    index("requisitions_org_status_idx").on(t.organisationId, t.status),
    index("requisitions_requester_idx").on(t.requesterId),
    index("requisitions_approver_idx").on(t.currentApproverId),
  ],
);

export const requisitionItems = pgTable(
  "requisition_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    itemName: text("item_name").notNull(),
    categoryId: uuid("category_id").references(() => expenseCategories.id),
    categoryOther: text("category_other"),
    description: text("description"),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    /** Quantity in hundredths (1.5 → 150), so it stays exact. */
    quantity: integer("quantity").notNull().default(100),
    /** Unit price in kobo. */
    rate: money("rate").notNull(),
    /** Discount in kobo for the whole line. */
    discount: money("discount").notNull().default(0),
    amount: money("amount").notNull(),
  },
  (t) => [index("requisition_items_req_idx").on(t.requisitionId)],
);

/** Approval history: every submission, decision, recall and comment. */
export const requisitionEvents = pgTable(
  "requisition_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requisitionId: uuid("requisition_id")
      .notNull()
      .references(() => requisitions.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    type: requisitionEventEnum("type").notNull(),
    comment: text("comment"),
    /** Who it was sent to, for "submitted to …" lines. */
    targetUserId: uuid("target_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requisition_events_req_idx").on(t.requisitionId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    kind: documentKindEnum("kind").notNull(),
    expenseId: uuid("expense_id").references(() => expenses.id),
    allocationId: uuid("allocation_id").references(() => allocations.id),
    fundReturnId: uuid("fund_return_id").references(() => fundReturns.id),
    claimId: uuid("claim_id").references(() => claims.id),
    feedbackId: uuid("feedback_id").references(() => feedback.id),
    requisitionId: uuid("requisition_id").references(() => requisitions.id),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
  },
  (t) => [index("documents_expense_idx").on(t.expenseId), index("documents_allocation_idx").on(t.allocationId)],
);

export const expenseReviews = pgTable("expense_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  action: reviewActionEnum("action").notNull(),
  comment: text("comment"),
  /** Finance-only note, hidden from the staff member. */
  internal: boolean("internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  allocationId: uuid("allocation_id")
    .notNull()
    .references(() => allocations.id),
  totalFunded: money("total_funded").notNull(),
  approvedExpenses: money("approved_expenses").notNull(),
  amountReturned: money("amount_returned").notNull(),
  adjustments: money("adjustments").notNull(),
  finalBalance: money("final_balance").notNull(),
  status: text("status").notNull().default("COMPLETED"),
  notes: text("notes"),
  reconciledBy: uuid("reconciled_by")
    .notNull()
    .references(() => users.id),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Organisation the notification belongs to (links open in that organisation). */
    organisationId: uuid("organisation_id").references(() => organisations.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    userId: uuid("user_id").references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    entityRef: text("entity_ref"),
    /** Allocation the event relates to, so allocation timelines can be built from the log. */
    allocationId: uuid("allocation_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_allocation_idx").on(t.allocationId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

/** Sequential, human-readable reference numbers (AL-2026-00124, EXP-2026-00982). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Category = typeof expenseCategories.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Requisition = typeof requisitions.$inferSelect;
export type RequisitionItem = typeof requisitionItems.$inferSelect;
