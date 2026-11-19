CREATE TABLE IF NOT EXISTS "receipt_payment_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "receipt_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "payment_method" varchar(50) NOT NULL,
  "payment_reference" text,
  "recorded_by" text,
  "verified_by" text,
  "verified_at" timestamp,
  "verification_remarks" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "receipt_payment_entries_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_payment_entries" ADD CONSTRAINT "receipt_payment_entries_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_payment_entries" ADD CONSTRAINT "receipt_payment_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_payment_entries" ADD CONSTRAINT "receipt_payment_entries_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_payment_entries_idempotency_key_idx" ON "receipt_payment_entries" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_payment_entries_receipt_id_idx" ON "receipt_payment_entries" ("receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_payment_entries_verified_at_idx" ON "receipt_payment_entries" ("verified_at");
--> statement-breakpoint
WITH payment_audit AS (
  SELECT
    a."id" AS "audit_id",
    a."user_id",
    a."resource_id" AS "delivery_item_id",
    a."created_at",
    a."after_state"::jsonb AS "state",
    ROW_NUMBER() OVER (PARTITION BY a."resource_id" ORDER BY a."created_at" DESC, a."id" DESC) AS "newest_payment",
    COUNT(*) OVER (PARTITION BY a."resource_id") AS "payment_count"
  FROM "audit_logs" a
  WHERE a."resource_type" = 'delivery_item'
    AND a."action" IN ('confirm', 'record_payment')
    AND a."after_state" IS NOT NULL
    AND COALESCE((a."after_state"::jsonb ->> 'payment_amount')::numeric, 0) > 0
    AND a."after_state"::jsonb ->> 'payment_method' IS NOT NULL
)
INSERT INTO "receipt_payment_entries" (
  "id", "receipt_id", "idempotency_key", "amount", "payment_method", "payment_reference",
  "recorded_by", "verified_by", "verified_at", "verification_remarks", "created_at"
)
SELECT
  p."audit_id",
  r."id",
  'legacy:' || p."audit_id",
  (p."state" ->> 'payment_amount')::numeric,
  p."state" ->> 'payment_method',
  CASE WHEN p."newest_payment" = 1 THEN r."payment_reference" ELSE NULL END,
  p."user_id",
  CASE WHEN p."payment_count" = 1 THEN r."payment_verified_by" ELSE NULL END,
  CASE WHEN p."payment_count" = 1 THEN r."payment_verified_at" ELSE NULL END,
  CASE WHEN p."payment_count" = 1 THEN r."payment_verification_remarks" ELSE NULL END,
  p."created_at"
FROM payment_audit p
JOIN "receipts" r ON r."delivery_item_id" = p."delivery_item_id"
ON CONFLICT ("idempotency_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "receipt_payment_entries" (
  "id", "receipt_id", "idempotency_key", "amount", "payment_method", "payment_reference",
  "recorded_by", "verified_by", "verified_at", "verification_remarks", "created_at"
)
SELECT
  'legacy-fallback:' || r."id",
  r."id",
  'legacy-fallback:' || r."id",
  r."cash_collected_amount",
  di."payment_method",
  r."payment_reference",
  r."confirmed_by",
  r."payment_verified_by",
  r."payment_verified_at",
  r."payment_verification_remarks",
  r."confirmed_at"
FROM "receipts" r
JOIN "delivery_items" di ON di."id" = r."delivery_item_id"
WHERE di."payment_method" IS NOT NULL
  AND r."cash_collected_amount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "receipt_payment_entries" e WHERE e."receipt_id" = r."id"
  )
ON CONFLICT ("idempotency_key") DO NOTHING;
--> statement-breakpoint
UPDATE "receipts" r
SET "cash_collected_amount" = totals."amount"
FROM (
  SELECT "receipt_id", SUM("amount") AS "amount"
  FROM "receipt_payment_entries"
  GROUP BY "receipt_id"
) totals
WHERE totals."receipt_id" = r."id";
