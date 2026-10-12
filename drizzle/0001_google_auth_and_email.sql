ALTER TABLE "organisations" ALTER COLUMN "settings" SET DEFAULT '{"blockOverspend":false,"duplicateDetection":true,"blockFutureDates":true,"requireReceipt":true,"maxUploadMb":4,"nearDepletionPercent":80,"unusualMultiplier":3}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_set_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub");