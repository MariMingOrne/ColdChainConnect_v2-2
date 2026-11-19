import { RequestHandler } from "express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { customers, invoices, receipt_payment_entries, receipts, users } from "../db/schema";
import { AuthRequest } from "../middleware/auth";
import { logAction } from "../middleware/audit-logger";
import { paymentNeedsClearance } from "../../shared/api";

const MAX_REMARKS_LENGTH = 500;

// Field staff record payments on delivery stops; Accounting verifies each collection separately.

// ─── GET /api/payments/unverified ─────────────────────────────────────────────

export const listUnverifiedPayments: RequestHandler = async (_req: AuthRequest, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);

    const rows = await db
      .select({
        payment: receipt_payment_entries,
        receipt: receipts,
        customer_name: customers.store_name,
        invoice_receipt_number: invoices.receipt_number,
      })
      .from(receipt_payment_entries)
      .innerJoin(receipts, eq(receipts.id, receipt_payment_entries.receipt_id))
      .innerJoin(customers, eq(customers.id, receipts.customer_id))
      .innerJoin(invoices, eq(invoices.id, receipts.invoice_id))
      .where(isNull(receipt_payment_entries.verified_at))
      .orderBy(asc(receipt_payment_entries.created_at));

    const recorderIds = rows
      .map((row) => row.payment.recorded_by)
      .filter((userId): userId is string => Boolean(userId));
    const recorderDetails = new Map<string, { username: string; role: string }>();
    if (recorderIds.length > 0) {
      const found = await db
        .select({ id: users.id, username: users.username, role: users.role })
        .from(users)
        .where(inArray(users.id, [...new Set(recorderIds)]));
      for (const user of found) recorderDetails.set(user.id, { username: user.username, role: user.role });
    }

    res.json(rows.map(({ payment, receipt, customer_name, invoice_receipt_number }) => {
      const recorder = payment.recorded_by ? recorderDetails.get(payment.recorded_by) : undefined;
      return {
        id: payment.id,
        receipt_id: receipt.id,
        receipt_number: receipt.receipt_number,
        delivery_item_id: receipt.delivery_item_id,
        customer_id: receipt.customer_id,
        invoice_id: receipt.invoice_id,
        confirmed_at: payment.created_at,
        customer_name,
        invoice_receipt_number,
        payment_method: payment.payment_method,
        payment_reference: payment.payment_reference,
        amount: payment.amount,
        recorded_by: payment.recorded_by,
        recorded_by_username: recorder?.username ?? null,
        recorded_by_role: (recorder?.role as "admin" | "agent" | "driver" | "staff" | undefined) ?? null,
      };
    }));
  } catch (error) {
    console.error("Error fetching unverified payments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── POST /api/receipt-payments/:id/verify ────────────────────────────────────

export const verifyReceiptPayment: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;

  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database not configured" });

  const rawRemarks = req.body?.remarks;
  if (rawRemarks !== undefined && rawRemarks !== null && typeof rawRemarks !== "string") {
    return res.status(400).json({ error: "Remarks must be text" });
  }
  const remarks = typeof rawRemarks === "string" ? rawRemarks.trim() : "";
  if (remarks.length > MAX_REMARKS_LENGTH) {
    return res.status(400).json({ error: `Remarks can be at most ${MAX_REMARKS_LENGTH} characters` });
  }

  try {
    const existing = await db.query.receipt_payment_entries.findFirst({
      where: eq(receipt_payment_entries.id, id),
    });

    if (!existing) return res.status(404).json({ error: "Payment not found" });
    if (existing.verified_at) return res.status(409).json({ error: "This payment is already verified" });

    if (paymentNeedsClearance(existing.payment_method) && !remarks) {
      return res.status(400).json({ error: "Add a clearance remark before verifying a bank transfer or check" });
    }

    if (existing.recorded_by && existing.recorded_by === req.user.userId) {
      return res.status(409).json({ error: "You recorded this payment, so someone else must verify it" });
    }

    const [verified] = await db
      .update(receipt_payment_entries)
      .set({
        verified_by: req.user.userId,
        verified_at: new Date(),
        verification_remarks: remarks || null,
      })
      .where(and(eq(receipt_payment_entries.id, id), isNull(receipt_payment_entries.verified_at)))
      .returning();

    if (!verified) return res.status(409).json({ error: "This payment is already verified" });

    await logAction(
      req.user.userId,
      "verify_payment",
      "receipt_payment",
      id,
      { verified_by: null, verified_at: null },
      {
        amount: verified.amount,
        payment_method: verified.payment_method,
        verified_by: verified.verified_by,
        verified_at: verified.verified_at,
        verification_remarks: verified.verification_remarks,
      },
    );

    res.json(verified);
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
