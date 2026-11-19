// Accounting verifies payments that field staff recorded. Runs against the in-memory Postgres
// harness; the shared database is never touched.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  accounts_receivable,
  audit_logs,
  bookings,
  customers,
  deliveries,
  delivery_items,
  invoices,
  receipts,
  trucks,
  users,
} from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { requirePermission, staffModuleGuard } from "../middleware/permissions";
import { listUnverifiedPayments, verifyReceiptPayment } from "./payment-verification";
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
  await db.insert(users).values({ id: "plain-staff", username: "plain_staff", password_hash: "x", role: "staff", mfa_required: false });

  await db.insert(trucks).values({ id: "truck-1", license_plate: "AAA-111", district: "d" });
  await db.insert(customers).values([
    { id: "cust-1", store_name: "Store One", location: "Somewhere" },
    { id: "cust-2", store_name: "Store Two", location: "Elsewhere" },
  ]);
  await db.insert(deliveries).values({ id: "del-1", truck_id: "truck-1" });

  const ids = ["full", "partial", "unpaid", "verified"];
  await db.insert(bookings).values(ids.map((id) => ({ id: `book-${id}`, customer_id: "cust-1", created_by: seeded.admin.id })));
  await db.insert(invoices).values(
    ids.map((id) => ({
      id: `inv-${id}`,
      booking_id: `book-${id}`,
      agent_id: seeded.admin.id,
      receipt_number: `INV-${id}`,
      customer_name: "Store One",
      total_amount: "100.00",
    })),
  );
  const paid = { status: "completed" as const, payment_method: "cash" };
  await db.insert(delivery_items).values([
    { id: "di-full", delivery_id: "del-1", invoice_id: "inv-full", destination_customer_id: "cust-1", is_paid: true, ...paid },
    { id: "di-partial", delivery_id: "del-1", invoice_id: "inv-partial", destination_customer_id: "cust-2", ...paid },
    { id: "di-unpaid", delivery_id: "del-1", invoice_id: "inv-unpaid", destination_customer_id: "cust-1", status: "completed" },
    { id: "di-verified", delivery_id: "del-1", invoice_id: "inv-verified", destination_customer_id: "cust-1", is_paid: true, ...paid },
  ]);
  await db.insert(receipts).values(
    ids.map((id) => ({
      id: `rec-${id}`,
      receipt_number: `OR-${id}`,
      delivery_item_id: `di-${id}`,
      customer_id: id === "partial" ? "cust-2" : "cust-1",
      truck_id: "truck-1",
      invoice_id: `inv-${id}`,
      confirmed_by: seeded.driver.id,
    })),
  );
  await db
    .update(receipts)
    .set({ payment_verified_by: seeded.admin.id, payment_verified_at: new Date() })
    .where(eq(receipts.id, "rec-verified"));

  // 60.00 collected on the partial stop, 40.00 still owed; the unpaid stop owes everything.
  await db.insert(accounts_receivable).values([
    { id: "ar-partial", customer_id: "cust-2", delivery_item_id: "di-partial", invoice_id: "inv-partial", amount_due: "40.00", status: "outstanding" },
    { id: "ar-unpaid", customer_id: "cust-1", delivery_item_id: "di-unpaid", invoice_id: "inv-unpaid", amount_due: "100.00", status: "outstanding" },
  ]);
  // Who recorded each payment: the driver confirmed every stop; the agent later took the partial balance.
  await db.insert(audit_logs).values([
    { id: "log-1", user_id: seeded.driver.id, action: "confirm", resource_type: "delivery_item", resource_id: "di-full", created_at: new Date("2026-01-01T10:00:00Z") },
    { id: "log-2", user_id: seeded.driver.id, action: "confirm", resource_type: "delivery_item", resource_id: "di-partial", created_at: new Date("2026-01-01T10:00:00Z") },
    { id: "log-3", user_id: seeded.agent.id, action: "record_payment", resource_type: "delivery_item", resource_id: "di-partial", created_at: new Date("2026-01-01T11:00:00Z") },
  ]);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function reqFor(role: Role, userId: string, params: Record<string, string> = {}, modulePermissions?: string[]): AuthRequest {
  return { user: { userId, username: userId, role }, modulePermissions, query: {}, params, body: {} } as unknown as AuthRequest;
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

const asAccounting = (params: Record<string, string> = {}) => reqFor("staff", seeded.staff.id, params, ["accounting"]);
const list = [requirePermission("payment:verify"), listUnverifiedPayments];
const verify = [requirePermission("payment:verify"), verifyReceiptPayment];

type Row = { id: string } & Record<string, unknown>;

describe("GET /api/payments/unverified", () => {
  it("lists receipts with a recorded payment that is not yet verified", async () => {
    const { status, body } = await run(list, asAccounting());
    expect(status).toBe(200);
    expect((body as Row[]).map((r) => r.id).sort()).toEqual(["rec-full", "rec-partial"]);
  });

  it("shows what accounting needs to check a row", async () => {
    const { body } = await run(list, asAccounting());
    const rows = body as Row[];
    expect(rows.find((r) => r.id === "rec-full")).toMatchObject({
      receipt_number: "OR-full",
      invoice_receipt_number: "INV-full",
      customer_name: "Store One",
      amount: "100.00",
      payment_method: "cash",
      recorded_by: seeded.driver.id,
      recorded_by_username: "test_driver",
    });
    // The collected amount is the invoice total minus what is still outstanding; the later
    // record_payment entry wins over the original confirmation.
    expect(rows.find((r) => r.id === "rec-partial")).toMatchObject({
      customer_name: "Store Two",
      amount: "60.00",
      recorded_by: seeded.agent.id,
      recorded_by_username: "test_agent",
    });
  });

  it("is open to admin and denied to staff without accounting, agents and drivers", async () => {
    expect((await run(list, reqFor("admin", seeded.admin.id))).status).toBe(200);
    expect((await run(list, reqFor("staff", "plain-staff", {}, []))).status).toBe(403);
    expect((await run(list, reqFor("agent", seeded.agent.id))).status).toBe(403);
    expect((await run(list, reqFor("driver", seeded.driver.id))).status).toBe(403);
  });
});

describe("POST /api/receipts/:id/verify", () => {
  it("verifies once, then answers 409", async () => {
    const first = await run(verify, asAccounting({ id: "rec-full" }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ id: "rec-full", payment_verified_by: seeded.staff.id });
    expect((first.body as Row).payment_verified_at).toBeTruthy();

    const again = await run(verify, asAccounting({ id: "rec-full" }));
    expect(again.status).toBe(409);
  });

  it("takes the verifier from the token, never from the request body", async () => {
    const req = asAccounting({ id: "rec-partial" });
    (req as unknown as { body: unknown }).body = { payment_verified_by: seeded.admin.id };
    const { body } = await run(verify, req);
    expect(body).toMatchObject({ payment_verified_by: seeded.staff.id });
  });

  it("removes verified rows from the unverified list", async () => {
    const { body } = await run(list, asAccounting());
    expect(body).toEqual([]);
  });

  it("audit-logs the verification with the actor", async () => {
    const [entry] = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, "rec-full"));
    expect(entry).toMatchObject({ user_id: seeded.staff.id, action: "verify_payment", resource_type: "receipt" });
    expect(JSON.parse(entry.after_state!)).toMatchObject({ payment_verified_by: seeded.staff.id });
  });

  it("does not let two simultaneous verifications both succeed", async () => {
    await db.update(receipts).set({ payment_verified_by: null, payment_verified_at: null }).where(eq(receipts.id, "rec-full"));
    const results = await Promise.all([
      run(verify, asAccounting({ id: "rec-full" })),
      run(verify, reqFor("admin", seeded.admin.id, { id: "rec-full" })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  describe("separation of duties", () => {
    // A stop whose payment was recorded by the accounting user, with no audit entry: the receipt's
    // confirmed_by is the recorder, as in the unverified list.
    async function addStop(id: string, recordedBy: string, audit?: { user: string }) {
      await db.insert(bookings).values({ id: `book-${id}`, customer_id: "cust-1", created_by: seeded.admin.id });
      await db.insert(invoices).values({ id: `inv-${id}`, booking_id: `book-${id}`, agent_id: seeded.admin.id, receipt_number: `INV-${id}`, customer_name: "Store One", total_amount: "100.00" });
      await db.insert(delivery_items).values({ id: `di-${id}`, delivery_id: "del-1", invoice_id: `inv-${id}`, destination_customer_id: "cust-1", status: "completed", is_paid: true, payment_method: "cash" });
      await db.insert(receipts).values({ id: `rec-${id}`, receipt_number: `OR-${id}`, delivery_item_id: `di-${id}`, customer_id: "cust-1", truck_id: "truck-1", invoice_id: `inv-${id}`, confirmed_by: recordedBy });
      if (audit) {
        await db.insert(audit_logs).values({ id: `log-${id}`, user_id: audit.user, action: "record_payment", resource_type: "delivery_item", resource_id: `di-${id}` });
      }
    }

    it("answers 409 when the verifier is the user who recorded the payment", async () => {
      await addStop("self", seeded.staff.id);
      const { status, body } = await run(verify, asAccounting({ id: "rec-self" }));
      expect(status).toBe(409);
      expect(body).toMatchObject({ error: expect.stringContaining("recorded") });
      const [row] = await db.select().from(receipts).where(eq(receipts.id, "rec-self"));
      expect(row.payment_verified_at).toBeNull();
    });

    it("uses the latest audit entry as the recorder, like the unverified list", async () => {
      // Confirmed by the driver, but the accounting user took the later payment.
      await addStop("later", seeded.driver.id, { user: seeded.staff.id });
      expect((await run(verify, asAccounting({ id: "rec-later" }))).status).toBe(409);
    });

    it("lets a different user verify the same receipt", async () => {
      const { status, body } = await run(verify, reqFor("admin", seeded.admin.id, { id: "rec-self" }));
      expect(status).toBe(200);
      expect(body).toMatchObject({ payment_verified_by: seeded.admin.id });
    });
  });

  it("denies staff without accounting, agents and drivers", async () => {
    for (const req of [
      reqFor("staff", "plain-staff", { id: "rec-unpaid" }, []),
      reqFor("agent", seeded.agent.id, { id: "rec-unpaid" }),
      reqFor("driver", seeded.driver.id, { id: "rec-unpaid" }),
    ]) {
      expect((await run(verify, req)).status).toBe(403);
    }
  });

  it("answers 404 for an unknown receipt", async () => {
    expect((await run(verify, asAccounting({ id: "nope" }))).status).toBe(404);
  });

  it("refuses to verify a receipt where no payment was recorded", async () => {
    const { status } = await run(verify, asAccounting({ id: "rec-unpaid" }));
    expect(status).toBe(409);
    const [row] = await db.select().from(receipts).where(eq(receipts.id, "rec-unpaid"));
    expect(row.payment_verified_at).toBeNull();
  });
});

describe("staff module guard", () => {
  const guardFor = (path: string, modules: string[]) => run([staffModuleGuard], { ...reqFor("staff", seeded.staff.id, {}, modules), path } as AuthRequest);

  it.each(["/payments/unverified", "/receipts/rec-1/verify"])("lets an accounting-only staff account reach %s", async (path) => {
    expect((await guardFor(path, ["accounting"])).status).toBe(200);
  });

  it("keeps staff without accounting out of the payments routes", async () => {
    expect((await guardFor("/payments/unverified", ["order-fulfillment"])).status).toBe(403);
  });
});

describe("clearance remarks", () => {
  beforeAll(async () => {
    await db.insert(bookings).values({ id: "book-bank", customer_id: "cust-1", created_by: seeded.admin.id });
    await db.insert(invoices).values({
      id: "inv-bank", booking_id: "book-bank", agent_id: seeded.admin.id, receipt_number: "INV-bank", customer_name: "Store One", total_amount: "100.00",
    });
    await db.insert(delivery_items).values({
      id: "di-bank", delivery_id: "del-1", invoice_id: "inv-bank", destination_customer_id: "cust-1", status: "completed", is_paid: true, payment_method: "bank_transfer",
    });
    await db.insert(receipts).values({
      id: "rec-bank", receipt_number: "OR-bank", delivery_item_id: "di-bank", customer_id: "cust-1", truck_id: "truck-1", invoice_id: "inv-bank",
      confirmed_by: seeded.driver.id, payment_reference: "BDO-12345",
    });
  });

  const withRemarks = (remarks: unknown) => {
    const req = asAccounting({ id: "rec-bank" });
    (req as unknown as { body: unknown }).body = { remarks };
    return req;
  };

  it("lists the bank reference so Accounting can match it", async () => {
    const { body } = await run(list, asAccounting());
    expect((body as Row[]).find((row) => row.id === "rec-bank")).toMatchObject({ payment_reference: "BDO-12345" });
  });

  it("refuses a bank transfer without a remark, and leaves it unverified", async () => {
    for (const remarks of [undefined, "", "   "]) {
      expect((await run(verify, withRemarks(remarks))).status).toBe(400);
    }
    const [row] = await db.select().from(receipts).where(eq(receipts.id, "rec-bank"));
    expect(row.payment_verified_at).toBeNull();
  });

  it("rejects remarks that are not text or are too long", async () => {
    expect((await run(verify, withRemarks(42))).status).toBe(400);
    expect((await run(verify, withRemarks("x".repeat(501)))).status).toBe(400);
  });

  it("stores the trimmed remark and audit-logs it", async () => {
    const { status, body } = await run(verify, withRemarks("  Cleared in BDO on Nov 20  "));
    expect(status).toBe(200);
    expect(body).toMatchObject({ payment_verification_remarks: "Cleared in BDO on Nov 20" });
    const logs = await db.select().from(audit_logs).where(eq(audit_logs.resource_id, "rec-bank"));
    expect(JSON.parse(logs[0].after_state!)).toMatchObject({ payment_verification_remarks: "Cleared in BDO on Nov 20" });
  });
});
