// Expense workflow: accounting submits, admin approves or rejects, accounting pays. Runs against the
// in-memory Postgres harness; the shared database is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { audit_logs, expenses, users } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { requireAnyPermission, requirePermission, staffModuleGuard } from "../middleware/permissions";
import { approveExpense, createExpense, listExpenses, payExpense, rejectExpense } from "./expenses";
import { seedUsers } from "../test/test-db";

vi.mock("../db", async () => {
  const { createTestDb: create } = await import("../test/test-db");
  return { db: (await create()).db };
});

type Role = "admin" | "staff" | "agent" | "driver";
let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  // `staff` holds the accounting module; `plain-staff` does not.
  await db.update(users).set({ module_permissions: ["accounting"] }).where(eq(users.id, seeded.staff.id));
  await db.insert(users).values([
    { id: "plain-staff", username: "plain_staff", password_hash: "x", role: "staff", mfa_required: false },
    { id: "admin-2", username: "second_admin", password_hash: "x", role: "admin", mfa_required: false },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function reqFor(role: Role, userId: string, params: Record<string, string> = {}, body: unknown = {}, modulePermissions?: string[]): AuthRequest {
  return { user: { userId, username: userId, role }, modulePermissions, query: {}, params, body } as unknown as AuthRequest;
}

/** Runs the middleware chain the way express does; stops at the first one that responds. */
async function run(chain: RequestHandler[], req: AuthRequest) {
  let status = 200;
  let body: unknown;
  let responded = false;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      responded = true;
      return res;
    },
  } as unknown as Response;
  for (const handler of chain) {
    let advanced = false;
    await handler(req as Request, res, () => {
      advanced = true;
    });
    if (responded || !advanced) break;
  }
  return { status, body };
}

const accounting = (params: Record<string, string> = {}, body: unknown = {}) => reqFor("staff", seeded.staff.id, params, body, ["accounting"]);
const admin = (params: Record<string, string> = {}, body: unknown = {}) => reqFor("admin", seeded.admin.id, params, body);
const admin2 = (params: Record<string, string> = {}, body: unknown = {}) => reqFor("admin", "admin-2", params, body);
const outsiders = (params: Record<string, string> = {}, body: unknown = {}) => [
  reqFor("staff", "plain-staff", params, body, []),
  reqFor("agent", seeded.agent.id, params, body),
  reqFor("driver", seeded.driver.id, params, body),
];

const list = [requireAnyPermission("expense:submit", "expense:approve", "expense:pay"), listExpenses];
const create = [requirePermission("expense:submit"), createExpense];
const approve = [requirePermission("expense:approve"), approveExpense];
const reject = [requirePermission("expense:approve"), rejectExpense];
const pay = [requirePermission("expense:pay"), payExpense];

type Row = { id: string } & Record<string, unknown>;
const valid = { category: "Fuel", description: "Diesel for truck 3", amount: "1250.50" };

async function submit(by: AuthRequest = accounting(), body: unknown = valid): Promise<string> {
  const { status, body: created } = await run(create, Object.assign(by, { body }));
  expect(status).toBe(201);
  return ((created as { expense: Row }).expense).id;
}

describe("POST /api/expenses", () => {
  it("submits an expense with the submitter taken from the token", async () => {
    const req = accounting({}, { ...valid, submitted_by: seeded.admin.id, status: "paid", approved_by: seeded.admin.id });
    const { status, body } = await run(create, req);
    expect(status).toBe(201);
    expect((body as { expense: Row }).expense).toMatchObject({
      category: "Fuel",
      description: "Diesel for truck 3",
      amount: "1250.50",
      status: "submitted",
      submitted_by: seeded.staff.id,
      approved_by: null,
      paid_by: null,
    });
  });

  it("audit-logs the submission", async () => {
    const id = await submit();
    const [entry] = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    expect(entry).toMatchObject({ user_id: seeded.staff.id, action: "submit", resource_type: "expense" });
    expect(JSON.parse(entry.after_state!)).toMatchObject({ status: "submitted", amount: "1250.50" });
  });

  it("lets admin submit too", async () => {
    expect((await run(create, admin({}, valid))).status).toBe(201);
  });

  it.each(["0", "0.00", "-5", "abc", "", "1.234", "1e3", "NaN", "Infinity", " 5", "5 "])("rejects the amount %j with 400", async (amount) => {
    expect((await run(create, accounting({}, { ...valid, amount }))).status).toBe(400);
  });

  it("rejects a missing or non-numeric amount with 400", async () => {
    expect((await run(create, accounting({}, { category: "Fuel", description: "x" }))).status).toBe(400);
    expect((await run(create, accounting({}, { ...valid, amount: null }))).status).toBe(400);
    expect((await run(create, accounting({}, { ...valid, amount: {} }))).status).toBe(400);
  });

  it("accepts a plain number for the amount", async () => {
    const { status, body } = await run(create, accounting({}, { ...valid, amount: 12.5 }));
    expect(status).toBe(201);
    expect((body as { expense: Row }).expense.amount).toBe("12.50");
  });

  it("rejects an empty category or description with 400", async () => {
    expect((await run(create, accounting({}, { ...valid, category: "  " }))).status).toBe(400);
    expect((await run(create, accounting({}, { ...valid, description: "" }))).status).toBe(400);
    expect((await run(create, accounting({}, { category: "Fuel", amount: "5" }))).status).toBe(400);
  });

  it("denies staff without accounting, agents and drivers", async () => {
    for (const req of outsiders({}, valid)) expect((await run(create, req)).status).toBe(403);
  });
});

describe("GET /api/expenses", () => {
  it("lists newest first with the submitter, approver and payer names", async () => {
    const id = await submit(accounting(), { ...valid, category: "Newest" });
    await run(approve, admin({ id }));
    await run(pay, accounting({ id }));

    const { status, body } = await run(list, accounting());
    expect(status).toBe(200);
    const rows = (body as { expenses: Row[] }).expenses;
    expect(rows[0]).toMatchObject({
      id,
      category: "Newest",
      status: "paid",
      submitted_by_name: "test_staff",
      approved_by_name: "test_admin",
      paid_by_name: "test_staff",
    });
    const times = rows.map((r) => new Date(r.created_at as string).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("is open to anyone who can submit, approve or pay, and denied to everyone else", async () => {
    expect((await run(list, admin())).status).toBe(200);
    expect((await run(list, accounting())).status).toBe(200);
    for (const req of outsiders()) expect((await run(list, req)).status).toBe(403);
  });
});

describe("POST /api/expenses/:id/approve", () => {
  it("approves a submitted expense, recording the approver from the token", async () => {
    const id = await submit();
    const { status, body } = await run(approve, admin({ id }, { approved_by: "admin-2" }));
    expect(status).toBe(200);
    expect((body as { expense: Row }).expense).toMatchObject({ id, status: "approved", approved_by: seeded.admin.id });
    expect((body as { expense: Row }).expense.approved_at).toBeTruthy();
  });

  it("audit-logs the approval", async () => {
    const id = await submit();
    await run(approve, admin({ id }));
    const entries = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    const entry = entries.find((e) => e.action === "approve");
    expect(entry).toMatchObject({ user_id: seeded.admin.id, resource_type: "expense" });
    expect(JSON.parse(entry!.before_state!)).toMatchObject({ status: "submitted" });
    expect(JSON.parse(entry!.after_state!)).toMatchObject({ status: "approved", approved_by: seeded.admin.id });
  });

  it("answers 409 when the approver is the submitter", async () => {
    const id = await submit(admin());
    const { status } = await run(approve, admin({ id }));
    expect(status).toBe(409);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row.status).toBe("submitted");
    // A different admin can approve it.
    expect((await run(approve, admin2({ id }))).status).toBe(200);
  });

  it("answers 409 unless the expense is submitted", async () => {
    const id = await submit();
    expect((await run(approve, admin({ id }))).status).toBe(200);
    expect((await run(approve, admin2({ id }))).status).toBe(409);
    const rejected = await submit();
    await run(reject, admin({ id: rejected }, { reject_reason: "No receipt" }));
    expect((await run(approve, admin({ id: rejected }))).status).toBe(409);
  });

  it("answers 404 for an unknown expense", async () => {
    expect((await run(approve, admin({ id: "nope" }))).status).toBe(404);
  });

  it("denies accounting, other staff, agents and drivers", async () => {
    const id = await submit();
    for (const req of [accounting({ id }), ...outsiders({ id })]) expect((await run(approve, req)).status).toBe(403);
  });

  it("does not let two simultaneous approvals both succeed", async () => {
    const id = await submit();
    const results = await Promise.all([run(approve, admin({ id })), run(approve, admin2({ id }))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const entries = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    expect(entries.filter((e) => e.action === "approve")).toHaveLength(1);
  });
});

describe("POST /api/expenses/:id/reject", () => {
  it("rejects a submitted expense with the reason", async () => {
    const id = await submit();
    const { status, body } = await run(reject, admin({ id }, { reject_reason: "No receipt" }));
    expect(status).toBe(200);
    expect((body as { expense: Row }).expense).toMatchObject({ id, status: "rejected", reject_reason: "No receipt" });
    const entries = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    expect(entries.find((e) => e.action === "reject")).toMatchObject({ user_id: seeded.admin.id, resource_type: "expense" });
  });

  it("requires a non-empty reason (400)", async () => {
    const id = await submit();
    expect((await run(reject, admin({ id }, {}))).status).toBe(400);
    expect((await run(reject, admin({ id }, { reject_reason: "   " }))).status).toBe(400);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row.status).toBe("submitted");
  });

  it("answers 409 when the rejecter is the submitter, and when it is not submitted", async () => {
    const own = await submit(admin());
    expect((await run(reject, admin({ id: own }, { reject_reason: "x" }))).status).toBe(409);
    const id = await submit();
    await run(approve, admin({ id }));
    expect((await run(reject, admin2({ id }, { reject_reason: "x" }))).status).toBe(409);
  });

  it("answers 404 for an unknown expense and denies non-approvers", async () => {
    expect((await run(reject, admin({ id: "nope" }, { reject_reason: "x" }))).status).toBe(404);
    const id = await submit();
    for (const req of [accounting({ id }, { reject_reason: "x" }), ...outsiders({ id }, { reject_reason: "x" })]) {
      expect((await run(reject, req)).status).toBe(403);
    }
  });
});

describe("POST /api/expenses/:id/pay", () => {
  it("pays an approved expense, recording the payer from the token", async () => {
    const id = await submit();
    await run(approve, admin({ id }));
    const { status, body } = await run(pay, accounting({ id }, { paid_by: "admin-2" }));
    expect(status).toBe(200);
    expect((body as { expense: Row }).expense).toMatchObject({ id, status: "paid", paid_by: seeded.staff.id, approved_by: seeded.admin.id });
    expect((body as { expense: Row }).expense.paid_at).toBeTruthy();
    const entries = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    const entry = entries.find((e) => e.action === "pay");
    expect(entry).toMatchObject({ user_id: seeded.staff.id, resource_type: "expense" });
    expect(JSON.parse(entry!.after_state!)).toMatchObject({ status: "paid", paid_by: seeded.staff.id });
  });

  it("answers 409 unless the expense is approved", async () => {
    const id = await submit();
    expect((await run(pay, accounting({ id }))).status).toBe(409);
    await run(approve, admin({ id }));
    expect((await run(pay, accounting({ id }))).status).toBe(200);
    expect((await run(pay, accounting({ id }))).status).toBe(409);
  });

  it("answers 409 when the payer is the approver", async () => {
    const id = await submit();
    await run(approve, admin({ id }));
    expect((await run(pay, admin({ id }))).status).toBe(409);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row.status).toBe("approved");
    // A different admin may pay it.
    expect((await run(pay, admin2({ id }))).status).toBe(200);
  });

  it("answers 404 for an unknown expense", async () => {
    expect((await run(pay, accounting({ id: "nope" }))).status).toBe(404);
  });

  it("denies staff without accounting, agents and drivers", async () => {
    const id = await submit();
    await run(approve, admin({ id }));
    for (const req of outsiders({ id })) expect((await run(pay, req)).status).toBe(403);
  });

  it("does not let two simultaneous payments both succeed", async () => {
    const id = await submit();
    await run(approve, admin({ id }));
    const results = await Promise.all([run(pay, accounting({ id })), run(pay, admin2({ id }))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const entries = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, id));
    expect(entries.filter((e) => e.action === "pay")).toHaveLength(1);
  });
});

describe("staff module guard", () => {
  const guardFor = (path: string, modules: string[]) => run([staffModuleGuard], { ...reqFor("staff", seeded.staff.id, {}, {}, modules), path } as AuthRequest);

  it.each(["/expenses", "/expenses/exp-1/approve", "/expenses/exp-1/pay"])("lets an accounting-only staff account reach %s", async (path) => {
    expect((await guardFor(path, ["accounting"])).status).toBe(200);
  });

  it("keeps staff without accounting out of the expenses routes", async () => {
    expect((await guardFor("/expenses", ["order-fulfillment"])).status).toBe(403);
  });

  it("does not stop admin", async () => {
    const adminReq = { ...admin(), path: "/expenses" } as AuthRequest;
    expect((await run([staffModuleGuard], adminReq)).status).toBe(200);
  });
});
