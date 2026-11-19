// End-of-day cash reconciliation. Runs against the in-memory Postgres harness; the shared database is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { audit_logs, cash_remittances, users } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { requirePermission, staffModuleGuard } from "../middleware/permissions";
import { businessDayBounds, createCashRemittance, listCashCollections, sumCashByUser, todayInManila } from "./cash-remittances";
import { denominationTotalCents } from "../../shared/api";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

type Role = "admin" | "staff" | "agent" | "driver";
let seeded: Awaited<ReturnType<typeof seedUsers>>;

// A fixed past day, so "today" checks never depend on when the suite runs.
const DAY = "2026-01-15";
const at = (time: string) => new Date(`${DAY}T${time}+08:00`);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.update(users).set({ module_permissions: ["accounting"] }).where(eq(users.id, seeded.staff.id));

  const payment = (id: string, userId: string, action: string, state: Record<string, unknown>, time: string) => ({
    id, user_id: userId, action, resource_type: "delivery_item", resource_id: `di-${id}`, after_state: JSON.stringify(state), created_at: at(time),
  });
  await db.insert(audit_logs).values([
    payment("a", seeded.driver.id, "confirm", { payment_amount: "100.50", payment_method: "cash" }, "09:00:00"),
    payment("b", seeded.driver.id, "record_payment", { payment_amount: "50.00", payment_method: "cash" }, "15:30:00"),
    payment("c", seeded.driver.id, "record_payment", { payment_amount: "999.00", payment_method: "bank_transfer" }, "16:00:00"),
    payment("d", seeded.agent.id, "confirm", { payment_amount: "75.00", payment_method: "cash" }, "10:00:00"),
    // One minute before midnight Philippine time starts the day: it belongs to the previous day.
    { ...payment("e", seeded.driver.id, "confirm", { payment_amount: "500.00", payment_method: "cash" }, "00:00:00"), created_at: new Date(at("00:00:00").getTime() - 60_000) },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function reqFor(role: Role, userId: string, body: unknown = {}, query: Record<string, string> = {}, modules?: string[]): AuthRequest {
  return { user: { userId, username: userId, role }, modulePermissions: modules, query, params: {}, body } as unknown as AuthRequest;
}

async function run(chain: RequestHandler[], req: AuthRequest) {
  let status = 200;
  let body: unknown;
  let responded = false;
  const res = {
    status(code: number) { status = code; return res; },
    json(payload: unknown) { body = payload; responded = true; return res; },
  } as unknown as Response;
  for (const handler of chain) {
    let advanced = false;
    await handler(req as Request, res, () => { advanced = true; });
    if (responded || !advanced) break;
  }
  return { status, body };
}

const asAccounting = (body: unknown = {}, query: Record<string, string> = {}) => reqFor("staff", seeded.staff.id, body, query, ["accounting"]);
const list = [requirePermission("cash:reconcile"), listCashCollections];
const create = [requirePermission("cash:reconcile"), createCashRemittance];

describe("denominationTotalCents", () => {
  it("adds up bills and coins exactly", () => {
    expect(denominationTotalCents({ "1000": 2, "500": 1, "20": 3, "0.25": 3 })).toBe(256075);
    expect(denominationTotalCents({})).toBe(0);
  });

  it.each([{ "1000": -1 }, { "1000": 1.5 }, { "750": 1 }, { "1000": "2" }, [], null, "x"])("rejects %j", (input) => {
    expect(denominationTotalCents(input)).toBeNull();
  });
});

describe("businessDayBounds and todayInManila", () => {
  it("spans the Philippine calendar day", () => {
    const bounds = businessDayBounds("2026-01-15")!;
    expect(bounds.start.toISOString()).toBe("2026-01-14T16:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-01-15T16:00:00.000Z");
  });

  it.each(["2026-02-31", "15-01-2026", "", "2026-1-5"])("rejects %j", (value) => {
    expect(businessDayBounds(value)).toBeNull();
  });

  it("rolls to the next day at 16:00 UTC", () => {
    expect(todayInManila(new Date("2026-01-15T15:59:00Z"))).toBe("2026-01-15");
    expect(todayInManila(new Date("2026-01-15T16:00:00Z"))).toBe("2026-01-16");
  });
});

describe("sumCashByUser", () => {
  it("counts only cash with a positive amount and skips unreadable entries", () => {
    const totals = sumCashByUser([
      { user_id: "u", after_state: JSON.stringify({ payment_amount: "10.10", payment_method: "cash" }) },
      { user_id: "u", after_state: JSON.stringify({ payment_amount: "20.20", payment_method: "cash" }) },
      { user_id: "u", after_state: JSON.stringify({ payment_amount: "99.00", payment_method: "check" }) },
      { user_id: "u", after_state: JSON.stringify({ payment_amount: "0.00", payment_method: "cash" }) },
      { user_id: "u", after_state: "not json" },
      { user_id: "u", after_state: null },
    ]);
    expect(totals.get("u")).toEqual({ cents: 3030, count: 2 });
  });
});

describe("GET /api/cash-remittances/collections", () => {
  it("is open to admin and accounting staff only", async () => {
    expect((await run(list, reqFor("admin", seeded.admin.id, {}, { date: DAY }))).status).toBe(200);
    expect((await run(list, asAccounting({}, { date: DAY }))).status).toBe(200);
    for (const role of ["agent", "driver"] as Role[]) {
      expect((await run(list, reqFor(role, seeded[role].id, {}, { date: DAY }))).status).toBe(403);
    }
    expect((await run(list, reqFor("staff", seeded.staff.id, {}, { date: DAY }, ["reports"]))).status).toBe(403);
  });

  it("totals each collector's cash for the Philippine day, ignoring other methods and other days", async () => {
    const { body } = await run(list, asAccounting({}, { date: DAY }));
    const rows = body as { user_id: string; expected: string; payment_count: number; remittance: unknown }[];
    expect(rows.find((row) => row.user_id === seeded.driver.id)).toMatchObject({ expected: "150.50", payment_count: 2, remittance: null });
    expect(rows.find((row) => row.user_id === seeded.agent.id)).toMatchObject({ expected: "75.00", payment_count: 1 });
  });

  it("rejects a date that does not exist", async () => {
    expect((await run(list, asAccounting({}, { date: "2026-02-31" }))).status).toBe(400);
  });
});

describe("POST /api/cash-remittances", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    remitted_by: seeded.driver.id,
    business_date: DAY,
    denominations: { "100": 1, "50": 1, "0.25": 2 },
    ...over,
  });

  it("refuses to let people confirm their own cash", async () => {
    const { status } = await run(create, reqFor("admin", seeded.admin.id, body({ remitted_by: seeded.admin.id })));
    expect(status).toBe(409);
  });

  it("denies agents and drivers", async () => {
    expect((await run(create, reqFor("driver", seeded.driver.id, body()))).status).toBe(403);
  });

  it("validates the input", async () => {
    for (const bad of [
      body({ remitted_by: "" }),
      body({ business_date: "2026-02-31" }),
      body({ business_date: "2999-01-01" }),
      body({ denominations: { "100": -1 } }),
      body({ denominations: { "123": 1 } }),
      body({ notes: 5 }),
      body({ notes: "x".repeat(501) }),
    ]) {
      expect((await run(create, asAccounting(bad))).status).toBe(400);
    }
    expect((await run(create, asAccounting(body({ remitted_by: "nobody", notes: "n" })))).status).toBe(404);
    expect(await db.select().from(cash_remittances)).toHaveLength(0);
  });

  it("needs a note when the count differs from the expected cash", async () => {
    // Expected 150.50; this count is 150.50 + 0.50 = 151.00 with no note.
    const mismatch = body({ denominations: { "100": 1, "50": 1, "0.25": 4 } });
    expect((await run(create, asAccounting(mismatch))).status).toBe(400);
  });

  it("confirms a matching count, with the expected amount computed by the server", async () => {
    const { status, body: saved } = await run(create, asAccounting(body()));
    expect(status).toBe(201);
    expect(saved).toMatchObject({
      remitted_by: seeded.driver.id,
      received_by: seeded.staff.id,
      expected_amount: "150.50",
      counted_amount: "150.50",
      business_date: DAY,
    });
  });

  it("ignores any expected or received_by the client tries to send", async () => {
    const { status, body: saved } = await run(
      create,
      asAccounting(body({ remitted_by: seeded.agent.id, expected_amount: "1.00", received_by: seeded.admin.id, denominations: { "50": 1 }, notes: "short by 25" })),
    );
    expect(status).toBe(201);
    expect(saved).toMatchObject({ expected_amount: "75.00", counted_amount: "50.00", received_by: seeded.staff.id, notes: "short by 25" });
  });

  it("refuses to confirm the same person and day twice", async () => {
    expect((await run(create, asAccounting(body()))).status).toBe(409);
    expect(await db.select().from(cash_remittances)).toHaveLength(2);
  });

  it("shows the confirmation on the collections list and audit-logs it", async () => {
    const { body: rows } = await run(list, asAccounting({}, { date: DAY }));
    const driver = (rows as { user_id: string; remittance: { received_by_username: string } | null }[]).find((row) => row.user_id === seeded.driver.id);
    expect(driver?.remittance?.received_by_username).toBe("test_staff");
    const logs = await db.select().from(audit_logs).where(eq(audit_logs.action, "reconcile_cash"));
    expect(logs).toHaveLength(2);
  });
});

describe("staff module guard", () => {
  it("lets an accounting-only staff account reach /cash-remittances", async () => {
    const req = { ...asAccounting(), path: "/cash-remittances/collections" } as AuthRequest;
    expect((await run([staffModuleGuard], req)).status).toBe(200);
  });
});
