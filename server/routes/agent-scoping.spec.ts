// Read-only checks against the configured database: an agent must only see
// financial records for their own orders. Skipped when no database is set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";
import { createServer } from "../index";
import { signToken } from "../auth";
import { db } from "../db";
import { invoices, users } from "../db/schema";
import { getAgentOrderIds } from "../services/agent-bookings";

const hasDb = Boolean(process.env.DATABASE_URL);
let server: Server;
let baseUrl: string;
let token = "";
let ownInvoiceIds = new Set<string>();

beforeAll(async () => {
  if (!hasDb) return;
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [agent] = await db.select().from(users).where(eq(users.role, "agent")).limit(1);
  if (!agent) return;
  token = signToken({ userId: agent.id, username: agent.username, role: "agent" });
  const orderIds = await getAgentOrderIds(agent.id);
  const own = orderIds.length
    ? await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.booking_id, orderIds))
    : [];
  ownInvoiceIds = new Set(own.map((row) => row.id));
}, 60_000);

afterAll(() => server?.close());

const getAsAgent = async (path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
};

describe.skipIf(!hasDb)("agent data scoping", () => {
  it("lists only the agent's own invoices", async () => {
    const rows = await getAsAgent("/api/invoices");
    expect(rows.every((row) => ownInvoiceIds.has(row.id as string))).toBe(true);
  });

  it.each(["/api/receipts", "/api/accounts-receivable", "/api/agent-returns"])(
    "%s only returns rows tied to the agent's invoices",
    async (path) => {
      const rows = await getAsAgent(path);
      expect(rows.every((row) => ownInvoiceIds.has(row.invoice_id as string))).toBe(true);
    },
  );
});
