-- Product unit and suggested retail price, a separate product_costs table (kept off products so cost never
-- travels with product lists agents can read), plus a receipt snapshot of kg per unit and the unit label.
-- Idempotent: safe to run more than once. Existing rows keep NULL (unit defaults to PK).
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "unit" varchar(10) DEFAULT 'PK' NOT NULL,
  ADD COLUMN IF NOT EXISTS "srp" numeric(10, 2);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_costs" (
	"product_id" text PRIMARY KEY NOT NULL,
	"cost_price" numeric(10, 2) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_cost_price_nonnegative" CHECK ("cost_price" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "invoice_items"
  ADD COLUMN IF NOT EXISTS "unit_weight_kg" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "unit_label" varchar(10);
