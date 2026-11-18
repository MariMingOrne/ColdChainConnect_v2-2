CREATE TABLE IF NOT EXISTS "order_item_reservations" (
  "id" text PRIMARY KEY,
  "booking_id" text NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "booking_item_id" text NOT NULL REFERENCES "booking_items"("id") ON DELETE CASCADE,
  "product_id" text NOT NULL REFERENCES "products"("id"),
  "qty_reserved" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'reserved',
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "updated_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "order_item_reservations_qty_positive" CHECK ("qty_reserved" > 0),
  CONSTRAINT "order_item_reservations_status_check" CHECK ("status" IN ('reserved', 'released', 'converted', 'superseded'))
);

INSERT INTO "order_item_reservations" ("id", "booking_id", "booking_item_id", "product_id", "qty_reserved", "status", "created_by", "updated_by")
SELECT gen_random_uuid()::text, b."id", bi."id", bi."product_id", bi."qty_ordered", 'reserved', b."created_by", b."created_by"
FROM "bookings" b
JOIN "booking_items" bi ON bi."booking_id" = b."id"
WHERE b."status" IN ('pending', 'approved')
  AND bi."qty_ordered" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "order_pallets" op WHERE op."order_id" = b."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "order_item_reservations" r
    WHERE r."booking_item_id" = bi."id"
  );

CREATE INDEX IF NOT EXISTS "order_item_reservations_booking_id_idx" ON "order_item_reservations" ("booking_id");
CREATE INDEX IF NOT EXISTS "order_item_reservations_product_status_idx" ON "order_item_reservations" ("product_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "order_item_reservations_active_booking_item_idx" ON "order_item_reservations" ("booking_item_id") WHERE "status" = 'reserved';
