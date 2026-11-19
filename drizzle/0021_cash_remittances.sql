-- End-of-day cash hand-over. A new table only, so it is safe to apply before or after the code.
-- Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS "cash_remittances" (
	"id" text PRIMARY KEY NOT NULL,
	"remitted_by" text NOT NULL,
	"received_by" text NOT NULL,
	"business_date" text NOT NULL,
	"expected_amount" numeric(12, 2) NOT NULL,
	"counted_amount" numeric(12, 2) NOT NULL,
	"denominations" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_remittances_amounts_nonnegative" CHECK ("expected_amount" >= 0 AND "counted_amount" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_remittances" ADD CONSTRAINT "cash_remittances_remitted_by_users_id_fk" FOREIGN KEY ("remitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cash_remittances" ADD CONSTRAINT "cash_remittances_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_remittances_remitter_day_idx" ON "cash_remittances" USING btree ("remitted_by","business_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_remittances_business_date_idx" ON "cash_remittances" USING btree ("business_date");
