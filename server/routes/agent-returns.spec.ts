// Returned quantity is capped at what the order contained. In-memory Postgres; the shared DB is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agent_returns, bookings, customers, invoice_items, invoices, products } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { createAgentReturn } from "./agent-returns";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.insert(customers).values({ id: "cust-1", store_name: "Store One", location: "Somewhere" });
  await db.insert(products).values([
    { id: "prod-a", name: "Alpha", price: "10.00" },
    { id: "prod-b", name: "Bravo", price: "20.00" },
  ]);
  await db.insert(bookings).values({ id: "book-1", customer_id: "cust-1", created_by: seeded.admin.id });
  await db.insert(invoices).values({
    id: "inv-1", booking_id: "book-1", agent_id: seeded.admin.id, receipt_number: "INV-1", customer_name: "Store One", total_amount: "100.00",
  });
  await db.insert(invoice_items).values([
    { id: "ii-a", invoice_id: "inv-1", product_id: "prod-a", product_name: "Alpha", qty_ordered: 5, unit_price: "10.00", amount: "50.00" },
    { id: "ii-b", invoice_id: "inv-1", product_id: "prod-b", product_name: "Bravo", qty_ordered: 2, unit_price: "20.00", amount: "40.00" },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

async function create(items: { product_id: string; qty_returned: number }[]) {
  let status = 200;
  let body: unknown;
  const res = {
    status(code: number) { status = code; return res; },
    json(payload: unknown) { body = payload; return res; },
  } as unknown as Response;
  const req = {
    user: { userId: seeded.admin.id, username: "admin", role: "admin" },
    body: { invoice_id: "inv-1", customer_id: "cust-1", items, return_type: "good", reason: "test" },
    query: {}, params: {},
  } as unknown as AuthRequest;
  await createAgentReturn(req as Request, res, () => undefined);
  return { status, body: body as { error?: string } };
}

describe("POST /api/agent-returns quantity cap", () => {
  it("refuses more than was ordered, and saves nothing", async () => {
    const { status, body } = await create([{ product_id: "prod-a", qty_returned: 6 }]);
    expect(status).toBe(409);
    expect(body.error).toMatch(/Only 5 of Alpha/);
    expect(await db.select().from(agent_returns)).toHaveLength(0);
  });

  it("accepts up to the ordered quantity", async () => {
    expect((await create([{ product_id: "prod-a", qty_returned: 3 }])).status).toBe(201);
  });

  it("counts earlier pending returns against the remainder", async () => {
    const over = await create([{ product_id: "prod-a", qty_returned: 3 }]);
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/Only 2 of Alpha/);
    expect((await create([{ product_id: "prod-a", qty_returned: 2 }])).status).toBe(201);
  });

  it("says so when everything was already returned", async () => {
    const { status, body } = await create([{ product_id: "prod-a", qty_returned: 1 }]);
    expect(status).toBe(409);
    expect(body.error).toMatch(/already been returned/);
  });

  it("does not count rejected returns", async () => {
    await db.update(agent_returns).set({ status: "rejected" }).where(eq(agent_returns.product_id, "prod-a"));
    expect((await create([{ product_id: "prod-a", qty_returned: 5 }])).status).toBe(201);
  });

  it("checks every line, so one bad line blocks the whole return", async () => {
    const { status } = await create([
      { product_id: "prod-b", qty_returned: 1 },
      { product_id: "prod-b", qty_returned: 3 },
    ]);
    expect(status).toBe(400); // duplicate product is rejected before the cap check
    const bad = await create([{ product_id: "prod-b", qty_returned: 3 }]);
    expect(bad.status).toBe(409);
    expect((await db.select().from(agent_returns).where(eq(agent_returns.product_id, "prod-b")))).toHaveLength(0);
  });
});
