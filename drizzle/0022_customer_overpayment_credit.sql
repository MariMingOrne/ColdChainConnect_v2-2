ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "credit_applied_amount" numeric(12, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "receipts"
  ADD COLUMN IF NOT EXISTS "cash_collected_amount" numeric(12, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "accounts_receivable"
  ADD COLUMN IF NOT EXISTS "credit_type" varchar(20);
--> statement-breakpoint
UPDATE "receipts" r
SET "cash_collected_amount" = CASE
  WHEN di."payment_method" IS NULL THEN 0
  ELSE GREATEST(COALESCE(i."total_amount", i."gross_amount", 0) - COALESCE(ar."amount_due", 0), 0)
END
FROM "delivery_items" di
JOIN "invoices" i ON i."id" = di."invoice_id"
LEFT JOIN (
  SELECT "delivery_item_id", SUM("amount_due") AS "amount_due"
  FROM "accounts_receivable"
  WHERE "status" = 'outstanding'
  GROUP BY "delivery_item_id"
) ar ON ar."delivery_item_id" = di."id"
WHERE r."delivery_item_id" = di."id"
  AND r."invoice_id" = i."id"
  AND r."cash_collected_amount" = 0
  AND di."payment_method" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_credit_applications" (
  "id" text PRIMARY KEY NOT NULL,
  "credit_ar_id" text NOT NULL,
  "invoice_id" text NOT NULL,
  "amount_applied" numeric(12, 2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_credit_applications" ADD CONSTRAINT "invoice_credit_applications_credit_ar_id_accounts_receivable_id_fk" FOREIGN KEY ("credit_ar_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_credit_applications" ADD CONSTRAINT "invoice_credit_applications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_credit_applications_credit_ar_id_idx" ON "invoice_credit_applications" ("credit_ar_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_credit_applications_invoice_id_idx" ON "invoice_credit_applications" ("invoice_id");
