// A driver token may reach exactly two write endpoints (confirm and record payment on a stop) and
// the handlers must still reject a driver who is not assigned to that run. Runs against the
// in-memory Postgres harness; the shared database is never touched.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestHandler, Response } from "express";
import { db } from "../db";
import { bookings, customers, deliveries, delivery_items, drivers, invoices, order_pallets, trucks, users } from "../db/schema";
import { signToken } from "../auth";
import { authMiddleware, type AuthRequest } from "./auth";
import { confirmDeliveryItem, recordDeliveryItemPayment } from "../routes/receipts";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;
let otherDriverUser: typeof users.$inferSelect;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  [otherDriverUser] = await db
    .insert(users)
    .values({ id: "test-driver-b", username: "test_driver_b", password_hash: "x", role: "driver", mfa_required: false })
    .returning();

  await db.insert(drivers).values([
    { id: "drv-a", user_id: seeded.driver.id, full_name: "Driver A" },
    { id: "drv-b", user_id: otherDriverUser.id, full_name: "Driver B" },
  ]);
  await db.insert(trucks).values({ id: "truck-a", license_plate: "AAA-111", district: "d", driver_id: "drv-a" });
  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere" });
  await db.insert(bookings).values({ id: "book-1", customer_id: "cust-1", created_by: seeded.admin.id });
  await db.insert(invoices).values({ id: "inv-1", booking_id: "book-1", agent_id: seeded.admin.id });
  await db.insert(order_pallets).values({ id: "pal-1", order_id: "book-1", status: "shipped" });
  await db.insert(deliveries).values({ id: "del-1", truck_id: "truck-a", driver_id: "drv-a" });
  await db.insert(delivery_items).values({
    id: "item-1",
    delivery_id: "del-1",
    invoice_id: "inv-1",
    destination_customer_id: "cust-1",
  });
  // confirmed but unpaid: the state recordDeliveryItemPayment accepts before it checks who is asking
  await db.insert(delivery_items).values({
    id: "item-done",
    delivery_id: "del-1",
    invoice_id: "inv-1",
    destination_customer_id: "cust-1",
    status: "completed",
    is_paid: false,
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const driverToken = (userId: string) => signToken({ userId, username: userId, role: "driver" });

/** Runs the guard the way the /api mount does and reports the status it ends with (200 = next()). */
function gate(method: string, originalUrl: string, token: string) {
  return new Promise<number>((resolve) => {
    const [path] = originalUrl.replace(/^\/api/, "").split("?");
    const req = {
      method,
      headers: { authorization: `Bearer ${token}` },
      baseUrl: "/api",
      path,
      originalUrl,
    } as unknown as AuthRequest;
    const res = { status: (code: number) => ({ json: () => resolve(code) }) } as unknown as Response;
    void authMiddleware(req, res, () => resolve(200));
  });
}

async function run(handler: RequestHandler, userId: string, role: "driver", params: Record<string, string>, body: object = {}) {
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

describe("driver gate on delivery stop actions", () => {
  it("lets a driver confirm a stop and record payment on it", async () => {
    const token = driverToken(seeded.driver.id);
    expect(await gate("POST", "/api/deliveries/del-1/items/item-1/confirm", token)).toBe(200);
    expect(await gate("POST", "/api/deliveries/del-1/items/item-1/payment", token)).toBe(200);
  });

  it("allows only POST on those paths", async () => {
    const token = driverToken(seeded.driver.id);
    expect(await gate("GET", "/api/deliveries/del-1/items/item-1/confirm", token)).toBe(403);
    expect(await gate("PATCH", "/api/deliveries/del-1/items/item-1/payment", token)).toBe(403);
  });

  it("still blocks everything else for a driver", async () => {
    const token = driverToken(seeded.driver.id);
    for (const [method, url] of [
      ["GET", "/api/invoices"],
      ["GET", "/api/deliveries"],
      ["POST", "/api/deliveries"],
      ["POST", "/api/deliveries/del-1/items/item-1/confirm/extra"],
      ["POST", "/api/deliveries/del-1/items/confirm"],
      ["POST", "/api/deliveries/del-1/items/item-1/other"],
      ["POST", "/api/deliveries/a/b/items/item-1/confirm"],
      ["PATCH", "/api/deliveries/del-1/items/item-1/status"],
    ] as const) {
      expect(await gate(method, url, token), `${method} ${url}`).toBe(403);
    }
  });

  it("keeps the schedule and refresh endpoints open to a driver", async () => {
    const token = driverToken(seeded.driver.id);
    expect(await gate("GET", "/api/driver-schedule?date=2026-11-19", token)).toBe(200);
    expect(await gate("POST", "/api/auth/refresh", token)).toBe(200);
  });

  it("leaves other roles on their own rules", async () => {
    const token = signToken({ userId: seeded.agent.id, username: "agent", role: "agent" });
    expect(await gate("GET", "/api/invoices", token)).toBe(200);
  });
});

describe("confirm and payment handlers still check the assigned driver", () => {
  it("rejects another driver on confirm", async () => {
    const { status, payload } = await run(confirmDeliveryItem, otherDriverUser.id, "driver", { id: "del-1", itemId: "item-1" }, { is_paid: false });
    expect(status).toBe(403);
    expect(payload).toMatchObject({ error: expect.stringContaining("assigned driver") });
  });

  it("rejects another driver on payment", async () => {
    const { status, payload } = await run(
      recordDeliveryItemPayment,
      otherDriverUser.id,
      "driver",
      { id: "del-1", itemId: "item-done" },
      { payment_amount: 1, payment_method: "cash" },
    );
    expect(status).toBe(403);
    expect(payload).toMatchObject({ error: expect.stringContaining("assigned driver") });
  });

  it("lets the assigned driver confirm", async () => {
    const { status } = await run(confirmDeliveryItem, seeded.driver.id, "driver", { id: "del-1", itemId: "item-1" }, { is_paid: false });
    expect(status).toBe(201);
  });
});
