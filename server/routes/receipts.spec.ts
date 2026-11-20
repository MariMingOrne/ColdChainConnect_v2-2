// Receipt attribution and payment handling on the confirm / payment endpoints. Runs against the
// in-memory Postgres harness; the shared database is never touched.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  accounts_receivable,
  agents,
  bookings,
  customers,
  deliveries,
  delivery_items,
  drivers,
  invoices,
  order_pallets,
  receipt_payment_entries,
  receipts,
  trucks,
} from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { confirmDeliveryItem, recordDeliveryItemPayment } from "./receipts";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.insert(drivers).values({ id: "drv-a", user_id: seeded.driver.id, full_name: "Driver A" });
  await db.insert(agents).values({ id: "agt-a", user_id: seeded.agent.id, full_name: "Agent A" });
  await db.insert(trucks).values({ id: "truck-a", license_plate: "AAA-111", district: "d", driver_id: "drv-a" });
  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere" });
  await db.insert(deliveries).values({ id: "del-1", truck_id: "truck-a", driver_id: "drv-a", agent_id: "agt-a" });

  const stops = ["drv-confirm", "agt-confirm", "partial", "overpay-confirm", "overpay-later", "overpay-later-2"];
  await db.insert(bookings).values(stops.map((id) => ({ id: `book-${id}`, customer_id: "cust-1", created_by: seeded.admin.id })));
  await db.insert(invoices).values(
    stops.map((id) => ({ id: `inv-${id}`, booking_id: `book-${id}`, agent_id: seeded.admin.id, total_amount: "100.00" })),
  );
  await db.insert(order_pallets).values(stops.map((id) => ({ id: `pal-${id}`, order_id: `book-${id}`, status: "shipped" })));
  await db.insert(delivery_items).values(
    stops.map((id) => ({ id: `di-${id}`, delivery_id: "del-1", invoice_id: `inv-${id}`, destination_customer_id: "cust-1" })),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
});

async function run(handler: RequestHandler, userId: string, role: "driver" | "agent", params: Record<string, string>, body: object = {}) {
  let status = 200;
  let payload: unknown;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      payload = value;
      return res;
    },
  } as unknown as Response;
  const req = { user: { userId, username: userId, role }, query: {}, params, body } as unknown as AuthRequest;
  await handler(req, res, () => undefined);
  return { status, payload };
}

const confirmBody = { is_paid: false, confirmed_by: "test-admin" };

describe("receipts.confirmed_by", () => {
  it("records the signed-in driver even when the body names someone else", async () => {
    const { status, payload } = await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "di-drv-confirm" }, confirmBody);
    expect(status).toBe(201);
    const [row] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-drv-confirm"));
    expect(row.confirmed_by).toBe(seeded.driver.id);
    // The response is the row that was written (no second read that could fail after the commit).
    expect(payload).toEqual(row);
  });

  it("records the signed-in agent even when the body names someone else", async () => {
    const { status } = await run(confirmDeliveryItem, seeded.agent.id, "agent", { id: "del-1", itemId: "di-agt-confirm" }, confirmBody);
    expect(status).toBe(201);
    const [row] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-agt-confirm"));
    expect(row.confirmed_by).toBe(seeded.agent.id);
  });

  it("ignores confirmed_by in the body of a later payment", async () => {
    await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "di-partial" }, { is_paid: false });
    const { status } = await run(
      recordDeliveryItemPayment,
      seeded.agent.id,
      "agent",
      { id: "del-1", itemId: "di-partial" },
      { payment_amount: 40, payment_method: "cash", payment_id: "partial-payment-1", confirmed_by: "test-admin" },
    );
    expect(status).toBe(200);
    const [row] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-partial"));
    expect(row.confirmed_by).toBe(seeded.driver.id);
  });
});

describe("receipt overpayments", () => {
  it("creates customer credit when the collected amount exceeds the invoice at confirmation", async () => {
    const { status } = await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "di-overpay-confirm" }, {
      is_paid: true,
      payment_amount: 120,
      payment_method: "cash",
      payment_id: "overpay-confirm-key",
    });
    expect(status).toBe(201);

    const [receipt] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-overpay-confirm"));
    const credits = await db.select().from(accounts_receivable).where(eq(accounts_receivable.credit_type, "overpayment"));
    expect(receipt.cash_collected_amount).toBe("120.00");
    expect(credits).toContainEqual(expect.objectContaining({
      customer_id: "cust-1",
      invoice_id: "inv-overpay-confirm",
      amount_due: "-20.00",
      status: "outstanding",
    }));
  });

  it("does not count a retried partial-payment request twice", async () => {
    await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "di-overpay-later" }, { is_paid: false });
    const body = { payment_amount: 40, payment_method: "cash", payment_id: "partial-retry-key" };
    const first = await run(recordDeliveryItemPayment, seeded.agent.id, "agent", { id: "del-1", itemId: "di-overpay-later" }, body);
    const retry = await run(recordDeliveryItemPayment, seeded.agent.id, "agent", { id: "del-1", itemId: "di-overpay-later" }, body);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);

    const [ar] = await db.select().from(accounts_receivable).where(eq(accounts_receivable.delivery_item_id, "di-overpay-later"));
    const [receipt] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-overpay-later"));
    const events = await db.select().from(receipt_payment_entries).where(eq(receipt_payment_entries.idempotency_key, "partial-retry-key"));
    expect(ar.amount_due).toBe("60.00");
    expect(receipt.cash_collected_amount).toBe("40.00");
    expect(events).toHaveLength(1);
  });

  it("creates customer credit when a later payment exceeds the remaining balance", async () => {
    // Uses its own stop: the retry test above already records 40 against di-overpay-later.
    await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "di-overpay-later-2" }, { is_paid: false });
    const { status } = await run(recordDeliveryItemPayment, seeded.agent.id, "agent", { id: "del-1", itemId: "di-overpay-later-2" }, {
      payment_amount: 120,
      payment_method: "cash",
      payment_id: "overpay-later-key",
    });
    expect(status).toBe(200);

    const [receipt] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-overpay-later-2"));
    const credit = await db.select().from(accounts_receivable).where(eq(accounts_receivable.invoice_id, "inv-overpay-later-2"));
    expect(receipt.cash_collected_amount).toBe("120.00");
    expect(credit).toContainEqual(expect.objectContaining({
      credit_type: "overpayment",
      amount_due: "-20.00",
      status: "outstanding",
    }));
  });
});

describe("a payment recorded after verification", () => {
  // Verification is stored on each payment entry, so a later payment is queued for accounting on its own
  // and the entry that was already verified stays verified.
  it("queues the new payment for accounting and leaves the verified one alone", async () => {
    const [before] = await db.select().from(receipts).where(eq(receipts.delivery_item_id, "di-partial"));
    const [firstEntry] = await db.select().from(receipt_payment_entries).where(eq(receipt_payment_entries.idempotency_key, "partial-payment-1"));
    expect(firstEntry.verified_at).toBeNull();
    await db
      .update(receipt_payment_entries)
      .set({ verified_by: seeded.admin.id, verified_at: new Date() })
      .where(eq(receipt_payment_entries.id, firstEntry.id));

    const { status } = await run(
      recordDeliveryItemPayment,
      seeded.agent.id,
      "agent",
      { id: "del-1", itemId: "di-partial" },
      { payment_amount: 10, payment_method: "gcash", payment_reference: "REF-2", payment_id: "partial-payment-2" },
    );
    expect(status).toBe(200);

    const entries = await db.select().from(receipt_payment_entries).where(eq(receipt_payment_entries.receipt_id, before.id));
    const earlier = entries.find((entry) => entry.id === firstEntry.id);
    const later = entries.find((entry) => entry.idempotency_key === "partial-payment-2");
    expect(earlier?.verified_by).toBe(seeded.admin.id);
    expect(earlier?.verified_at).not.toBeNull();
    expect(later?.verified_by).toBeNull();
    expect(later?.verified_at).toBeNull();
    expect(later?.payment_reference).toBe("REF-2");
    const [after] = await db.select().from(receipts).where(eq(receipts.id, before.id));
    expect(after.cash_collected_amount).toBe("50.00");
    const [ar] = await db.select().from(accounts_receivable).where(eq(accounts_receivable.delivery_item_id, "di-partial"));
    expect(ar.amount_due).toBe("50.00");
  });
});
