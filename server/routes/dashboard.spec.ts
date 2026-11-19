// "Known totals": the summary endpoint must agree with the same figures computed from the full
// lists the old dashboard downloaded. Runs against the in-memory Postgres harness with a small
// seeded data set; the shared database is never touched.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createServer } from "../index";
import { signToken } from "../auth";
import { db } from "../db";
import {
  accounts_receivable,
  batch_pallets,
  bookings,
  customers,
  deliveries,
  inventory_batches,
  invoices,
  pallet_items,
  products,
  trucks,
} from "../db/schema";
import { seedUsers } from "../test/test-db";
import type { DashboardSummary } from "@shared/api";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let server: Server;
let baseUrl: string;
let token = "";
const get = async <T,>(path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

beforeAll(async () => {
  // calculateProductInventory short-circuits to {} without a DATABASE_URL; the db module is mocked.
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  const seeded = await seedUsers(db as never);
  token = signToken({ userId: seeded.admin.id, username: seeded.admin.username, role: "admin" });

  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere" });
  await db.insert(bookings).values([
    { id: "book-1", customer_id: "cust-1", created_by: seeded.admin.id, status: "pending" },
    { id: "book-2", customer_id: "cust-1", created_by: seeded.admin.id, status: "pending" },
    { id: "book-3", customer_id: "cust-1", created_by: seeded.admin.id, status: "approved" },
  ]);
  await db.insert(invoices).values(
    ["book-1", "book-2", "book-3"].map((booking, i) => ({ id: `inv-${i + 1}`, booking_id: booking, agent_id: seeded.admin.id })),
  );
  await db.insert(accounts_receivable).values([
    { id: "ar-1", customer_id: "cust-1", invoice_id: "inv-1", amount_due: "100.50", status: "outstanding" },
    { id: "ar-2", customer_id: "cust-1", invoice_id: "inv-2", amount_due: "20.25", status: "outstanding" },
    { id: "ar-3", customer_id: "cust-1", invoice_id: "inv-3", amount_due: "75.00", status: "paid" },
  ]);
  await db.insert(trucks).values({ id: "truck-1", license_plate: "AAA-111", district: "d" });
  await db.insert(deliveries).values([
    { id: "del-1", truck_id: "truck-1", status: "pending" },
    { id: "del-2", truck_id: "truck-1", status: "in_transit" },
    { id: "del-3", truck_id: "truck-1", status: "completed" },
  ]);
  await db.insert(products).values([
    { id: "prod-low", name: "Low stock", price: "10.00", reorder_point: 10 },
    { id: "prod-ok", name: "Well stocked", price: "10.00", reorder_point: 5 },
    { id: "prod-old", name: "Discontinued", price: "10.00", reorder_point: 5, is_discontinued: true },
    { id: "prod-none", name: "No reorder point", price: "10.00" },
  ]);
  await db.insert(inventory_batches).values({ id: "batch-1", batch_name: "Batch 1" });
  await db.insert(batch_pallets).values({ id: "bp-1", batch_id: "batch-1", pallet_id: "P-1" });
  await db.insert(pallet_items).values([
    { id: "pi-1", pallet_id: "bp-1", product_id: "prod-low", qty_units: 4 },
    { id: "pi-2", pallet_id: "bp-1", product_id: "prod-ok", qty_units: 50 },
    { id: "pi-3", pallet_id: "bp-1", product_id: "prod-old", qty_units: 3 },
  ]);

  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(() => {
  server?.close();
  vi.unstubAllEnvs();
});

describe("GET /api/dashboard/summary", () => {
  it("matches totals computed from the full lists", async () => {
    const [summary, bookingList, deliveryList, inventory, productList, receivables] = await Promise.all([
      get<DashboardSummary>("/api/dashboard/summary"),
      get<Array<{ status: string }>>("/api/bookings"),
      get<Array<{ status: string }>>("/api/deliveries"),
      get<Record<string, number>>("/api/products/inventory"),
      get<Array<{ id: string; reorder_point?: number | null; is_discontinued?: boolean }>>("/api/products"),
      get<Array<{ amount_due: string; status: string }>>("/api/accounts-receivable?status=outstanding"),
    ]);

    expect(summary.pendingOrders).toBe(bookingList.filter((b) => b.status === "pending").length);
    expect(summary.activeDeliveries).toBe(deliveryList.filter((d) => d.status !== "completed").length);
    expect(summary.availableUnits).toBe(Object.values(inventory).reduce((sum, n) => sum + Number(n), 0));
    expect(summary.lowStock.length).toBe(
      productList.filter((p) => !p.is_discontinued && typeof p.reorder_point === "number" && (inventory[p.id] ?? 0) <= p.reorder_point).length,
    );
    expect(summary.receivables.outstandingCount).toBe(receivables.length);
    const totalCents = receivables.reduce((sum, r) => sum + Math.round(Number(r.amount_due) * 100), 0);
    expect(Math.round(Number(summary.receivables.outstandingTotal) * 100)).toBe(totalCents);

    // The seeded data is non-trivial, so the comparisons above are not all zero.
    expect(summary.pendingOrders).toBe(2);
    expect(summary.activeDeliveries).toBe(2);
    expect(summary.lowStock.map((p) => p.id)).toEqual(["prod-low"]);
    expect(summary.receivables.outstandingTotal).toBe("120.75");
  }, 60_000);

  it("is much smaller than the lists it replaces", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.text();
    expect(body.length).toBeLessThan(20_000);
  });
});
