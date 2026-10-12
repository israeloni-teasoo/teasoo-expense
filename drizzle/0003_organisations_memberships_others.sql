CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role" "role" DEFAULT 'STAFF' NOT NULL,
	"department_id" uuid,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "is_other" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "category_other" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "logo_type" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_group_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_org_idx" ON "memberships" USING btree ("user_id","organisation_id");--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("organisation_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Everyone keeps access to the organisation they already belong to.
INSERT INTO "memberships" ("user_id", "organisation_id", "role", "department_id", "status")
SELECT "id", "organisation_id", "role", "department_id", "status" FROM "users"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Existing admins become group admins so they can add subsidiaries.
UPDATE "users" SET "is_group_admin" = true WHERE "role" = 'ADMIN';--> statement-breakpoint
-- Every organisation gets an "Others" category with a free-text field.
INSERT INTO "expense_categories" ("organisation_id", "name", "description", "receipt_required", "is_other")
SELECT o."id", 'Others', 'Anything not listed — type the category when recording', false, true FROM "organisations" o
WHERE NOT EXISTS (SELECT 1 FROM "expense_categories" c WHERE c."organisation_id" = o."id" AND c."is_other");--> statement-breakpoint
UPDATE "notifications" n SET "organisation_id" = u."organisation_id" FROM "users" u WHERE n."user_id" = u."id" AND n."organisation_id" IS NULL;
