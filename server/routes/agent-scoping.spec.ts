// An agent must only see financial records for their own orders. Runs against the in-memory
// Postgres harness with a small seeded data set; the shared database is never touched.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createServer } from "../index";
import { signToken } from "../auth";
import { db } from "../db";
import {
  accounts_receivable,
  agent_returns,
  bookings,
  customers,
  deliveries,
  delivery_items,
  invoices,
  products,
  receipts,
  trucks,
} from "../db/schema";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let server: Server;
let baseUrl: string;
let token = "";
// invoices on orders the agent created
const ownInvoiceIds = new Set(["inv-own-1", "inv-own-2"]);
// invoices on someone else's orders (the agent must never see these)
const otherInvoiceIds = ["inv-other-1", "inv-other-2"];
const ALL = [...ownInvoiceIds, ...otherInvoiceIds];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  const seeded = await seedUsers(db as never);
  token = signToken({ userId: seeded.agent.id, username: seeded.agent.username, role: "agent" });
  const owner = (id: string) => (ownInvoiceIds.has(id) ? seeded.agent.id : seeded.admin.id);

  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere" });
  await db.insert(products).values({ id: "prod-1", name: "Widget", price: "10.00" });
  await db.insert(trucks).values({ id: "truck-1", license_plate: "AAA-111", district: "d" });
  await db.insert(deliveries).values({ id: "del-1", truck_id: "truck-1" });

  await db.insert(bookings).values(ALL.map((id) => ({ id: `book-${id}`, customer_id: "cust-1", created_by: owner(id) })));
  await db.insert(invoices).values(ALL.map((id) => ({ id, booking_id: `book-${id}`, agent_id: owner(id) })));
  await db.insert(delivery_items).values(
    ALL.map((id) => ({ id: `di-${id}`, delivery_id: "del-1", invoice_id: id, destination_customer_id: "cust-1" })),
  );
  await db.insert(receipts).values(
    ALL.map((id, i) => ({
      id: `rec-${id}`,
      receipt_number: `R-${i}`,
      delivery_item_id: `di-${id}`,
      customer_id: "cust-1",
      truck_id: "truck-1",
      invoice_id: id,
    })),
  );
  await db.insert(accounts_receivable).values(ALL.map((id) => ({ id: `ar-${id}`, customer_id: "cust-1", invoice_id: id, amount_due: "5.00" })));
  await db.insert(agent_returns).values(
    ALL.map((id) => ({ id: `ret-${id}`, invoice_id: id, customer_id: "cust-1", product_id: "prod-1", product_name: "Widget", qty_returned: 1 })),
  );

  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(() => {
  server?.close();
  vi.unstubAllEnvs();
});

const getAsAgent = async (path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
};

describe("agent data scoping", () => {
  it("lists only the agent's own invoices", async () => {
    const rows = await getAsAgent("/api/invoices");
    expect(rows.length).toBe(ownInvoiceIds.size);
    expect(rows.every((row) => ownInvoiceIds.has(row.id as string))).toBe(true);
  });

  it.each(["/api/receipts", "/api/accounts-receivable", "/api/agent-returns"])(
    "%s only returns rows tied to the agent's invoices",
    async (path) => {
      const rows = await getAsAgent(path);
      expect(rows.length).toBe(ownInvoiceIds.size);
      expect(rows.every((row) => ownInvoiceIds.has(row.invoice_id as string))).toBe(true);
    },
  );
});
