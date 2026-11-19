-- Accounting workflow: booking approval trail, receipt payment verification, and the expenses table.
-- Additive and safe to re-run: nullable columns, a new table, IF NOT EXISTS, guarded constraints.
-- Numbering note: originally drafted as 0009_accounting.sql, renamed to 0019 after merging origin/main
-- (which added 0017_order_item_reservations and 0018_user_archive). These hand-written files are not in
-- drizzle/meta/_journal.json (it stops at 0004), so the prefix does not affect ordering and the
-- statements here do not depend on any other file.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "approved_by" text,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "receipts"
  ADD COLUMN IF NOT EXISTS "payment_verified_by" text,
  ADD COLUMN IF NOT EXISTS "payment_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "payment_verification_remarks" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'submitted' NOT NULL,
	"submitted_by" text NOT NULL,
	"approved_by" text,
	"paid_by" text,
	"reject_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"paid_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_verified_by_users_id_fk" FOREIGN KEY ("payment_verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_submitted_by_idx" ON "expenses" ("submitted_by");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_status_check" CHECK ("status" IN ('submitted', 'approved', 'rejected', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
