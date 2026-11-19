// A driver must only see invoices, receipts, receivables and returns tied to deliveries assigned to
// them. Runs against the in-memory Postgres harness; the shared database is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { RequestHandler, Response } from "express";
import { db } from "../db";
import {
  accounts_receivable,
  agent_returns,
  bookings,
  customers,
  deliveries,
  delivery_items,
  drivers,
  invoices,
  products,
  receipts,
  trucks,
  users,
} from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { listInvoices, getInvoice } from "./invoices";
import { listReceipts } from "./receipts";
import { listAccountsReceivable } from "./accounts-receivable";
import { listAgentReturns } from "./agent-returns";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

type Role = "admin" | "staff" | "agent" | "driver";
let seeded: Awaited<ReturnType<typeof seedUsers>>;
let driverBUser: typeof users.$inferSelect;

// invoice id -> who it belongs to
//   inv-a: delivery assigned to driver A directly
//   inv-b: delivery assigned to driver B directly
//   inv-c: delivery with no driver, on a truck whose default driver is A
//   inv-d: delivery assigned to B although it runs on A's truck (the assignment wins)
//   inv-e: not on any delivery
const ALL = ["inv-a", "inv-b", "inv-c", "inv-d", "inv-e"];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  [driverBUser] = await db
    .insert(users)
    .values({ id: "test-driver-b", username: "test_driver_b", password_hash: "x", role: "driver", mfa_required: false })
    .returning();

  await db.insert(drivers).values([
    { id: "drv-a", user_id: seeded.driver.id, full_name: "Driver A" },
    { id: "drv-b", user_id: driverBUser.id, full_name: "Driver B" },
  ]);
  await db.insert(trucks).values([
    { id: "truck-a", license_plate: "AAA-111", district: "d", driver_id: "drv-a" },
    { id: "truck-b", license_plate: "BBB-222", district: "d", driver_id: "drv-b" },
  ]);
  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere" });
  await db.insert(products).values({ id: "prod-1", name: "Widget", price: "10.00" });

  await db.insert(bookings).values(ALL.map((id) => ({ id: `book-${id}`, customer_id: "cust-1", created_by: seeded.admin.id })));
  await db.insert(invoices).values(ALL.map((id) => ({ id, booking_id: `book-${id}`, agent_id: seeded.admin.id })));

  await db.insert(deliveries).values([
    { id: "del-a", truck_id: "truck-a", driver_id: "drv-a" },
    { id: "del-b", truck_id: "truck-b", driver_id: "drv-b" },
    { id: "del-c", truck_id: "truck-a", driver_id: null },
    { id: "del-d", truck_id: "truck-a", driver_id: "drv-b" },
  ]);
  const onDelivery: Array<[string, string]> = [["inv-a", "del-a"], ["inv-b", "del-b"], ["inv-c", "del-c"], ["inv-d", "del-d"]];
  await db.insert(delivery_items).values(
    onDelivery.map(([invoice, delivery]) => ({
      id: `di-${invoice}`,
      delivery_id: delivery,
      invoice_id: invoice,
      destination_customer_id: "cust-1",
    })),
  );

  await db.insert(receipts).values(
    ALL.map((id, i) => ({
      id: `rec-${id}`,
      receipt_number: `R-${i}`,
      delivery_item_id: `di-${id === "inv-e" ? "inv-a" : id}`,
      customer_id: "cust-1",
      truck_id: "truck-a",
      invoice_id: id,
    })),
  );
  await db.insert(accounts_receivable).values(ALL.map((id) => ({ id: `ar-${id}`, customer_id: "cust-1", invoice_id: id, amount_due: "5.00" })));
  await db.insert(agent_returns).values(
    ALL.map((id) => ({ id: `ret-${id}`, invoice_id: id, customer_id: "cust-1", product_id: "prod-1", product_name: "Widget", qty_returned: 1 })),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function reqFor(role: Role, userId: string, params: Record<string, string> = {}): AuthRequest {
  return { user: { userId, username: userId, role }, query: {}, params, body: {} } as unknown as AuthRequest;
}

async function run(handler: RequestHandler, req: AuthRequest) {
  let status = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  } as unknown as Response;
  await handler(req, res, () => undefined);
  return { status, body };
}

const idsOf = (rows: unknown, key: string) => (rows as Array<Record<string, string>>).map((r) => r[key]).sort();

const lists = [
  ["invoices", listInvoices, "id"],
  ["receipts", listReceipts, "invoice_id"],
  ["accounts receivable", listAccountsReceivable, "invoice_id"],
  ["agent returns", listAgentReturns, "invoice_id"],
] as const;

describe.each(lists)("driver scoping on %s", (_name, handler, key) => {
  it("lets driver A see only the rows on their own deliveries", async () => {
    const { status, body } = await run(handler, reqFor("driver", seeded.driver.id));
    expect(status).toBe(200);
    expect(idsOf(body, key)).toEqual(["inv-a", "inv-c"]);
  });

  it("lets driver B see only the rows on their own deliveries", async () => {
    const { body } = await run(handler, reqFor("driver", driverBUser.id));
    expect(idsOf(body, key)).toEqual(["inv-b", "inv-d"]);
  });

  it("shows a driver with no profile nothing", async () => {
    const { body } = await run(handler, reqFor("driver", "no-such-driver"));
    expect(body).toEqual([]);
  });

  it.each(["admin", "staff"] as const)("leaves %s unscoped", async (role) => {
    const { body } = await run(handler, reqFor(role, seeded[role].id));
    expect(idsOf(body, key)).toEqual(ALL);
  });

  it("keeps agent scoping: an agent with no orders sees nothing", async () => {
    const { body } = await run(handler, reqFor("agent", seeded.agent.id));
    expect(body).toEqual([]);
  });
});

describe("driver scoping on a single invoice", () => {
  it("returns a driver their own invoice", async () => {
    const { status } = await run(getInvoice, reqFor("driver", seeded.driver.id, { id: "inv-a" }));
    expect(status).toBe(200);
  });

  it("hides another driver's invoice", async () => {
    const { status } = await run(getInvoice, reqFor("driver", seeded.driver.id, { id: "inv-b" }));
    expect(status).toBe(404);
  });
});
