// Approving an order records who approved it and when, and flags self-approval in the audit log.
// Runs against the in-memory Postgres harness; the shared database is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { audit_logs, bookings, customers, trucks } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { updateBookingStatus } from "./bookings";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.insert(trucks).values({ id: "truck-1", license_plate: "AAA-111", district: "d" });
  await db.insert(customers).values({ id: "cust-1", store_name: "Store", location: "Somewhere", district: "d" });
  await db.insert(bookings).values([
    { id: "book-own", customer_id: "cust-1", created_by: seeded.admin.id, prepared_delivery_date: "2030-01-01" },
    { id: "book-agent", customer_id: "cust-1", created_by: seeded.agent.id, prepared_delivery_date: "2030-01-01" },
    { id: "book-reject", customer_id: "cust-1", created_by: seeded.agent.id },
    { id: "book-undated", customer_id: "cust-1", created_by: seeded.agent.id },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

async function setStatus(id: string, status: string) {
  const req = { user: { userId: seeded.admin.id, username: "admin", role: "admin" }, params: { id }, body: { status }, query: {} } as unknown as AuthRequest;
  let code = 200;
  const res = {
    status(c: number) {
      code = c;
      return res;
    },
    json: () => res,
  } as unknown as Response;
  await updateBookingStatus(req, res, () => undefined);
  return code;
}

const auditFor = async (id: string) => {
  const [entry] = await db.select().from(audit_logs).where(and(eq(audit_logs.resource_id, id), eq(audit_logs.resource_type, "booking")));
  return JSON.parse(entry.after_state!) as Record<string, unknown>;
};
const rowFor = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0];

describe("booking approval", () => {
  it("records the approver and time, and flags a self-approval in the audit entry", async () => {
    expect(await setStatus("book-own", "approved")).toBe(200);
    const row = await rowFor("book-own");
    expect(row.approved_by).toBe(seeded.admin.id);
    expect(row.approved_at).toBeInstanceOf(Date);
    expect(await auditFor("book-own")).toMatchObject({ status: "approved", selfApproved: true });
  });

  it("does not flag approving someone else's order", async () => {
    expect(await setStatus("book-agent", "approved")).toBe(200);
    expect((await rowFor("book-agent")).approved_by).toBe(seeded.admin.id);
    expect(await auditFor("book-agent")).toMatchObject({ selfApproved: false });
  });

  it("refuses approval until the order has a prepared delivery date", async () => {
    expect(await setStatus("book-undated", "approved")).toBe(400);
    expect((await rowFor("book-undated")).status).toBe("pending");
  });

  it("leaves the approval columns alone for other statuses", async () => {
    expect(await setStatus("book-reject", "rejected")).toBe(200);
    const row = await rowFor("book-reject");
    expect(row.approved_by).toBeNull();
    expect(row.approved_at).toBeNull();
    expect(await auditFor("book-reject")).not.toHaveProperty("selfApproved");
  });
});
