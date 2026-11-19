import { RequestHandler } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { accounts_receivable, audit_logs, customers, delivery_items, invoices, receipts, users } from "../db/schema";
import { AuthRequest } from "../middleware/auth";
import { logAction } from "../middleware/audit-logger";

// Field staff (driver, agent) record payments on delivery stops; Accounting verifies them here.
//
// A payment counts as "recorded" once its delivery item carries a payment_method. Both ways of
// recording a payment set it: confirming a stop with an amount collected, and the later
// /payment call. A confirmation with nothing collected leaves it null, and a receipt row exists
// for every confirmed stop whether or not money changed hands, so the receipt alone proves nothing.

/** The user behind the latest confirm / record_payment audit entry of each delivery item. */
async function latestRecorders(itemIds: string[]): Promise<Map<string, string>> {
  const recorderByItem = new Map<string, string>();
  if (itemIds.length === 0) return recorderByItem;
  const entries = await db
    .select({ resource_id: audit_logs.resource_id, user_id: audit_logs.user_id })
    .from(audit_logs)
    .where(
      and(
        eq(audit_logs.resource_type, "delivery_item"),
        inArray(audit_logs.action, ["confirm", "record_payment"]),
        inArray(audit_logs.resource_id, itemIds),
      ),
    )
    .orderBy(desc(audit_logs.created_at));
  for (const entry of entries) {
    if (entry.resource_id && !recorderByItem.has(entry.resource_id)) recorderByItem.set(entry.resource_id, entry.user_id);
  }
  return recorderByItem;
}

// ─── GET /api/payments/unverified ─────────────────────────────────────────────

export const listUnverifiedPayments: RequestHandler = async (_req: AuthRequest, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);

    const rows = await db
      .select({
        receipt: receipts,
        customer_name: customers.store_name,
        invoice_receipt_number: invoices.receipt_number,
        invoice_total: invoices.total_amount,
        invoice_gross: invoices.gross_amount,
        payment_method: delivery_items.payment_method,
        outstanding: accounts_receivable.amount_due,
      })
      .from(receipts)
      .innerJoin(delivery_items, eq(delivery_items.id, receipts.delivery_item_id))
      .innerJoin(customers, eq(customers.id, receipts.customer_id))
      .innerJoin(invoices, eq(invoices.id, receipts.invoice_id))
      .leftJoin(
        accounts_receivable,
        and(eq(accounts_receivable.delivery_item_id, receipts.delivery_item_id), eq(accounts_receivable.status, "outstanding")),
      )
      .where(and(isNull(receipts.payment_verified_at), isNotNull(delivery_items.payment_method)))
      .orderBy(asc(receipts.confirmed_at));

    // Who recorded the payment: the latest confirm / record_payment entry for the stop, falling
    // back to the receipt's confirmed_by when the audit log has nothing.
    const itemIds = rows.map((row) => row.receipt.delivery_item_id);
    const recorderByItem = await latestRecorders(itemIds);
    const recorderIds = rows
      .map((row) => recorderByItem.get(row.receipt.delivery_item_id) ?? row.receipt.confirmed_by)
      .filter((userId): userId is string => Boolean(userId));
    const usernames = new Map<string, string>();
    if (recorderIds.length > 0) {
      const found = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, [...new Set(recorderIds)]));
      for (const user of found) usernames.set(user.id, user.username);
    }

    res.json(
      rows.map((row) => {
        const recordedBy = recorderByItem.get(row.receipt.delivery_item_id) ?? row.receipt.confirmed_by ?? null;
        // Collected so far = invoice total minus the balance still outstanding on the stop.
        const totalCents = Math.round(Number(row.invoice_total ?? row.invoice_gross ?? 0) * 100);
        const outstandingCents = Math.round(Number(row.outstanding ?? 0) * 100);
        return {
          ...row.receipt,
          customer_name: row.customer_name,
          invoice_receipt_number: row.invoice_receipt_number,
          payment_method: row.payment_method,
          amount: (Math.max(totalCents - outstandingCents, 0) / 100).toFixed(2),
          recorded_by: recordedBy,
          recorded_by_username: recordedBy ? usernames.get(recordedBy) ?? null : null,
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching unverified payments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── POST /api/receipts/:id/verify ────────────────────────────────────────────

export const verifyReceiptPayment: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;

  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database not configured" });

  try {
    const [existing] = await db
      .select({ receipt: receipts, payment_method: delivery_items.payment_method })
      .from(receipts)
      .innerJoin(delivery_items, eq(delivery_items.id, receipts.delivery_item_id))
      .where(eq(receipts.id, id));

    if (!existing) return res.status(404).json({ error: "Receipt not found" });
    if (existing.receipt.payment_verified_at) {
      return res.status(409).json({ error: "This payment is already verified" });
    }
    if (!existing.payment_method) {
      return res.status(409).json({ error: "No payment has been recorded for this receipt" });
    }

    // Separation of duties: whoever recorded the payment (same lookup as the unverified list) cannot
    // also verify it. This means a solo admin cannot verify payments they recorded themselves.
    const itemId = existing.receipt.delivery_item_id;
    const recordedBy = (await latestRecorders([itemId])).get(itemId) ?? existing.receipt.confirmed_by;
    if (recordedBy && recordedBy === req.user.userId) {
      return res.status(409).json({ error: "You recorded this payment, so someone else must verify it" });
    }

    // Conditional on still being unverified, so two simultaneous verifications cannot both win.
    const [verified] = await db
      .update(receipts)
      .set({ payment_verified_by: req.user.userId, payment_verified_at: new Date() })
      .where(and(eq(receipts.id, id), isNull(receipts.payment_verified_at)))
      .returning();

    if (!verified) return res.status(409).json({ error: "This payment is already verified" });

    await logAction(
      req.user.userId,
      "verify_payment",
      "receipt",
      id,
      { payment_verified_by: null, payment_verified_at: null },
      {
        receipt_number: verified.receipt_number,
        payment_verified_by: verified.payment_verified_by,
        payment_verified_at: verified.payment_verified_at,
      },
    );

    res.json(verified);
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
