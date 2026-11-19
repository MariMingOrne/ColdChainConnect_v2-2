import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  accounts_receivable,
  booking_items,
  bookings,
  customers,
  invoice_credit_applications,
  invoices,
  order_pallet_items,
  order_pallets,
  products,
} from "../db/schema";
import { seedUsers } from "../test/test-db";
import { createInvoiceAfterPicking } from "./booking-invoices";

vi.mock("../db", async () => {
  const { createTestDb } = await import("../test/test-db");
  return { db: (await createTestDb()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.insert(customers).values({ id: "cust-credit", store_name: "Credit Store", location: "Manila" });
  await db.insert(products).values({ id: "prod-credit", name: "Test Product", sku: "TEST-CREDIT", price: "50.00" });
  await db.insert(bookings).values([
    { id: "book-source", customer_id: "cust-credit", created_by: seeded.admin.id, status: "approved" },
    { id: "book-next-1", customer_id: "cust-credit", created_by: seeded.admin.id, status: "approved" },
    { id: "book-next-2", customer_id: "cust-credit", created_by: seeded.admin.id, status: "approved" },
  ]);
  await db.insert(invoices).values({ id: "inv-source", booking_id: "book-source", agent_id: seeded.admin.id, total_amount: "100.00" });
  await db.insert(accounts_receivable).values([
    {
      id: "credit-old",
      customer_id: "cust-credit",
      delivery_item_id: null,
      invoice_id: "inv-source",
      amount_due: "-30.00",
      credit_type: "overpayment",
      status: "outstanding",
      created_at: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "credit-new",
      customer_id: "cust-credit",
      delivery_item_id: null,
      invoice_id: "inv-source",
      amount_due: "-90.00",
      credit_type: "overpayment",
      status: "outstanding",
      created_at: new Date("2026-02-01T00:00:00Z"),
    },
  ]);

  for (const [index, bookingId] of ["book-next-1", "book-next-2"].entries()) {
    await db.insert(booking_items).values({
      id: `booking-item-${index}`,
      booking_id: bookingId,
      product_id: "prod-credit",
      qty_ordered: 2,
    });
    const palletId = `order-pallet-${index}`;
    await db.insert(order_pallets).values({ id: palletId, order_id: bookingId, status: "prepared" });
    await db.insert(order_pallet_items).values({
      id: `order-pallet-item-${index}`,
      pallet_id: palletId,
      product_id: "prod-credit",
      qty_units: 2,
      batch_item_id: `batch-item-${index}`,
    });
  }
});

afterAll(() => vi.unstubAllEnvs());

describe("createInvoiceAfterPicking customer overpayment credits", () => {
  it("applies oldest credits first and preserves any unused balance for the next invoice", async () => {
    const first = await createInvoiceAfterPicking("book-next-1");
    expect(first.status).toBe("created");
    expect(first.invoice).toMatchObject({
      total_amount: "100.00",
      credit_applied_amount: "100.00",
      status: "paid",
      payment_status: "paid",
    });

    const [oldCredit, newerCredit] = await db.select().from(accounts_receivable)
      .where(eq(accounts_receivable.customer_id, "cust-credit"))
      .orderBy(accounts_receivable.created_at);
    expect(oldCredit).toMatchObject({ amount_due: "0.00", status: "paid" });
    expect(newerCredit).toMatchObject({ amount_due: "-20.00", status: "outstanding" });

    const firstApplications = await db.select().from(invoice_credit_applications)
      .where(eq(invoice_credit_applications.invoice_id, first.invoice!.id));
    expect(firstApplications.map((application) => [application.credit_ar_id, application.amount_applied])).toEqual([
      ["credit-old", "30.00"],
      ["credit-new", "70.00"],
    ]);

    const second = await createInvoiceAfterPicking("book-next-2");
    expect(second.status).toBe("created");
    expect(second.invoice).toMatchObject({
      total_amount: "100.00",
      credit_applied_amount: "20.00",
      status: "issued",
      payment_status: "partial",
    });

    const [usedCredit] = await db.select().from(accounts_receivable).where(eq(accounts_receivable.id, "credit-new"));
    expect(usedCredit).toMatchObject({ amount_due: "0.00", status: "paid" });
    const secondApplications = await db.select().from(invoice_credit_applications)
      .where(eq(invoice_credit_applications.invoice_id, second.invoice!.id));
    expect(secondApplications).toHaveLength(1);
    expect(secondApplications[0]).toMatchObject({ credit_ar_id: "credit-new", amount_applied: "20.00" });
  });
});
