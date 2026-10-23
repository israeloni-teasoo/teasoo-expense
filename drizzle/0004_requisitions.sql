CREATE TYPE "public"."requisition_event" AS ENUM('CREATED', 'SUBMITTED', 'RECALLED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'INFO_REQUESTED', 'PROCESSED', 'CANCELLED', 'COMMENT');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('DRAFT', 'AWAITING_APPROVAL', 'ON_HOLD', 'APPROVED', 'REJECTED', 'PROCESSED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'QUOTE';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'PAYMENT_PROOF';--> statement-breakpoint
CREATE TABLE "requisition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" "requisition_event" NOT NULL,
	"comment" text,
	"target_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"item_name" text NOT NULL,
	"category_id" uuid,
	"category_other" text,
	"description" text,
	"vendor_id" uuid,
	"quantity" integer DEFAULT 100 NOT NULL,
	"rate" bigint NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"requester_id" uuid NOT NULL,
	"department_id" uuid,
	"project_id" uuid,
	"title" text NOT NULL,
	"expected_date" date NOT NULL,
	"delivery_address" text,
	"external_reference" text,
	"notes_to_approver" text,
	"total" bigint DEFAULT 0 NOT NULL,
	"status" "requisition_status" DEFAULT 'DRAFT' NOT NULL,
	"current_approver_id" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"processed_at" timestamp with time zone,
	"processed_by" uuid,
	"payment_date" date,
	"payment_method" text,
	"payment_reference" text,
	"payment_notes" text,
	"allocation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisitions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_name" text,
	"account_number" text,
	"bank_name" text,
	"email" text,
	"phone" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "requisition_id" uuid;--> statement-breakpoint
ALTER TABLE "requisition_events" ADD CONSTRAINT "requisition_events_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_events" ADD CONSTRAINT "requisition_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_events" ADD CONSTRAINT "requisition_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_items" ADD CONSTRAINT "requisition_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_current_approver_id_users_id_fk" FOREIGN KEY ("current_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requisition_events_req_idx" ON "requisition_events" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisition_items_req_idx" ON "requisition_items" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisitions_org_status_idx" ON "requisitions" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "requisitions_requester_idx" ON "requisitions" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "requisitions_approver_idx" ON "requisitions" USING btree ("current_approver_id");--> statement-breakpoint
CREATE INDEX "vendors_org_idx" ON "vendors" USING btree ("organisation_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;