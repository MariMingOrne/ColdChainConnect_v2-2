// Read-only. "Known totals": the summary endpoint must agree with the same
// figures computed from the full lists the old dashboard downloaded.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createServer } from "../index";
import { tokenForRole } from "../test-utils";
import type { DashboardSummary } from "@shared/api";

const hasDb = Boolean(process.env.DATABASE_URL);
let server: Server;
let baseUrl: string;
let token = "";
const get = async <T,>(path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

beforeAll(async () => {
  if (!hasDb) return;
  token = (await tokenForRole("admin")) ?? "";
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe.skipIf(!hasDb)("GET /api/dashboard/summary", () => {
  it("matches totals computed from the full lists", async () => {
    const [summary, bookings, deliveries, inventory, products, receivables] = await Promise.all([
      get<DashboardSummary>("/api/dashboard/summary"),
      get<Array<{ status: string }>>("/api/bookings"),
      get<Array<{ status: string }>>("/api/deliveries"),
      get<Record<string, number>>("/api/products/inventory"),
      get<Array<{ id: string; reorder_point?: number | null; is_discontinued?: boolean }>>("/api/products"),
      get<Array<{ amount_due: string; status: string }>>("/api/accounts-receivable?status=outstanding"),
    ]);

    expect(summary.pendingOrders).toBe(bookings.filter((b) => b.status === "pending").length);
    expect(summary.activeDeliveries).toBe(deliveries.filter((d) => d.status !== "completed").length);
    expect(summary.availableUnits).toBe(Object.values(inventory).reduce((sum, n) => sum + Number(n), 0));
    expect(summary.lowStock.length).toBe(
      products.filter((p) => !p.is_discontinued && typeof p.reorder_point === "number" && (inventory[p.id] ?? 0) <= p.reorder_point).length,
    );
    expect(summary.receivables.outstandingCount).toBe(receivables.length);
    const totalCents = receivables.reduce((sum, r) => sum + Math.round(Number(r.amount_due) * 100), 0);
    expect(Math.round(Number(summary.receivables.outstandingTotal) * 100)).toBe(totalCents);
  }, 60_000);

  it("is much smaller than the lists it replaces", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.text();
    expect(body.length).toBeLessThan(20_000);
  });
});
