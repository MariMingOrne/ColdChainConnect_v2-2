import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, seedUsers } from "./test-db";
import {
  bookings,
  customers,
  deliveries,
  delivery_items,
  expenses,
  invoices,
  receipts,
  trucks,
  users,
} from "../db/schema";

describe("in-memory Postgres harness", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates the schema and round-trips one seeded user per role", async () => {
    const seeded = await seedUsers(ctx.db);
    expect(Object.keys(seeded).sort()).toEqual(["admin", "agent", "driver", "staff"]);

    const rows = await ctx.db.select().from(users);
    expect(rows).toHaveLength(4);
    for (const role of ["admin", "staff", "agent", "driver"] as const) {
      expect(seeded[role].role).toBe(role);
      expect(rows.find((r) => r.id === seeded[role].id)?.role).toBe(role);
    }

    const viaQueryApi = await ctx.db.query.users.findFirst();
    expect(viaQueryApi).toBeDefined();
  });

  it("stores an expense with the submitted default and reads back its approval trail", async () => {
    const rows = await ctx.db.select().from(users);
    const seeded = Object.fromEntries(rows.map((r) => [r.role, r])) as Awaited<ReturnType<typeof seedUsers>>;
    const [created] = await ctx.db
      .insert(expenses)
      .values({
        id: "exp-1",
        category: "fuel",
        description: "Diesel for truck run",
        amount: "1250.50",
        submitted_by: seeded.staff.id,
      })
      .returning();
    expect(created.status).toBe("submitted");
    expect(created.amount).toBe("1250.50");
    expect(created.approved_by).toBeNull();
    expect(created.paid_by).toBeNull();
    expect(created.reject_reason).toBeNull();
    expect(created.approved_at).toBeNull();
    expect(created.paid_at).toBeNull();
    expect(created.created_at).toBeInstanceOf(Date);
    expect(created.updated_at).toBeInstanceOf(Date);

    const approvedAt = new Date("2026-11-19T08:00:00Z");
    await ctx.db
      .update(expenses)
      .set({ status: "approved", approved_by: seeded.admin.id, approved_at: approvedAt })
      .where(eq(expenses.id, "exp-1"));
    const [read] = await ctx.db.select().from(expenses).where(eq(expenses.id, "exp-1"));
    expect(read.status).toBe("approved");
    expect(read.approved_by).toBe(seeded.admin.id);
    expect(read.approved_at?.toISOString()).toBe(approvedAt.toISOString());
  });

  it("reads and writes the nullable approval columns on bookings and receipts", async () => {
    // Users were seeded by the first test; the rows persist for the lifetime of this in-memory DB.
    const rows = await ctx.db.select().from(users);
    const seeded = Object.fromEntries(rows.map((r) => [r.role, r])) as Awaited<ReturnType<typeof seedUsers>>;
    await ctx.db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Angeles" });
    await ctx.db.insert(bookings).values({ id: "book-1", customer_id: "cust-1", created_by: seeded.agent.id });
    await ctx.db.insert(trucks).values({ id: "truck-1", license_plate: "ABC123", district: "Angeles" });
    await ctx.db.insert(invoices).values({ id: "inv-1", booking_id: "book-1", agent_id: seeded.agent.id });
    await ctx.db.insert(deliveries).values({ id: "del-1", truck_id: "truck-1" });
    await ctx.db
      .insert(delivery_items)
      .values({ id: "di-1", delivery_id: "del-1", invoice_id: "inv-1", destination_customer_id: "cust-1" });
    await ctx.db.insert(receipts).values({
      id: "rcpt-1",
      receipt_number: "R-1",
      delivery_item_id: "di-1",
      customer_id: "cust-1",
      truck_id: "truck-1",
      invoice_id: "inv-1",
    });

    const [booking] = await ctx.db.select().from(bookings).where(eq(bookings.id, "book-1"));
    expect(booking.approved_by).toBeNull();
    expect(booking.approved_at).toBeNull();
    const [receipt] = await ctx.db.select().from(receipts).where(eq(receipts.id, "rcpt-1"));
    expect(receipt.payment_verified_by).toBeNull();
    expect(receipt.payment_verified_at).toBeNull();

    const when = new Date("2026-11-19T09:30:00Z");
    await ctx.db.update(bookings).set({ approved_by: seeded.admin.id, approved_at: when }).where(eq(bookings.id, "book-1"));
    await ctx.db
      .update(receipts)
      .set({ payment_verified_by: seeded.admin.id, payment_verified_at: when })
      .where(eq(receipts.id, "rcpt-1"));
    const [booking2] = await ctx.db.select().from(bookings).where(eq(bookings.id, "book-1"));
    const [receipt2] = await ctx.db.select().from(receipts).where(eq(receipts.id, "rcpt-1"));
    expect(booking2.approved_by).toBe(seeded.admin.id);
    expect(booking2.approved_at?.toISOString()).toBe(when.toISOString());
    expect(receipt2.payment_verified_by).toBe(seeded.admin.id);
    expect(receipt2.payment_verified_at?.toISOString()).toBe(when.toISOString());
  });
});
