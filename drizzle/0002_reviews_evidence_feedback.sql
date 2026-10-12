CREATE TYPE "public"."feedback_category" AS ENUM('BUG', 'IDEA', 'QUESTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'SCREENSHOT';--> statement-breakpoint
ALTER TYPE "public"."review_action" ADD VALUE 'REQUEST_EVIDENCE' BEFORE 'COMMENT';--> statement-breakpoint
ALTER TYPE "public"."review_action" ADD VALUE 'EVIDENCE_ADDED' BEFORE 'COMMENT';--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "feedback_category" DEFAULT 'OTHER' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"page_url" text,
	"user_agent" text,
	"status" "feedback_status" DEFAULT 'OPEN' NOT NULL,
	"response" text,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisations" ALTER COLUMN "settings" SET DEFAULT '{"blockOverspend":false,"duplicateDetection":true,"blockFutureDates":true,"requireReceipt":false,"maxUploadMb":4,"nearDepletionPercent":80,"unusualMultiplier":3}'::jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_reviews" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("organisation_id","status");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Receipts become optional at submission for funded expenses (personal spend still requires one).
UPDATE "organisations" SET "settings" = jsonb_set("settings", '{requireReceipt}', 'false'::jsonb);
