import { RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import { agentInvoiceFilter } from "../services/agent-bookings";
import { db } from "../db";
import {
  accounts_receivable,
  customers,
  invoices,
  delivery_items,
} from "../db/schema";
import { AuthRequest } from "../middleware/auth";

export const listAccountsReceivable: RequestHandler = async (
  req: AuthRequest,
  res
) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.json([]);
    }

    const { status } = req.query;

    const scope = await agentInvoiceFilter(req, accounts_receivable.invoice_id);
    if (scope.none) return res.json([]);

    const whereClause = and(
      status ? eq(accounts_receivable.status, status as any) : undefined,
      scope.where,
    );

    const records = await db.query.accounts_receivable.findMany({
      where: whereClause,
      orderBy: [desc(accounts_receivable.created_at)],
    });

    res.json(records);
  } catch (error) {
    console.error("Error fetching accounts receivable:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getCustomerBalance: RequestHandler = async (
  req: AuthRequest,
  res
) => {
  const { customerId } = req.params;

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const scope = await agentInvoiceFilter(req, accounts_receivable.invoice_id);
    const records = scope.none ? [] : await db.query.accounts_receivable.findMany({
      where: and(
        eq(accounts_receivable.customer_id, customerId),
        eq(accounts_receivable.status, "outstanding"),
        scope.where,
      ),
      orderBy: [desc(accounts_receivable.created_at)],
    });

    const totalDue = records.reduce(
      (sum, record) => sum + parseFloat(record.amount_due),
      0
    );

    res.json({
      customer_id: customerId,
      total_due: totalDue.toFixed(2),
      count: records.length,
      items: records,
    });
  } catch (error) {
    console.error("Error fetching customer balance:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateARStatus: RequestHandler = async (
  req: AuthRequest,
  res
) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const existing = await db.query.accounts_receivable.findFirst({
      where: eq(accounts_receivable.id, id),
    });

    if (!existing) {
      return res.status(404).json({ error: "AR record not found" });
    }

    await db
      .update(accounts_receivable)
      .set({
        status,
        updated_at: new Date(),
      })
      .where(eq(accounts_receivable.id, id));

    const updated = await db.query.accounts_receivable.findFirst({
      where: eq(accounts_receivable.id, id),
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating AR status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const MAX_NOTE_LENGTH = 500;

export const updateARNotes: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body ?? {};

  if (notes !== null && typeof notes !== "string") {
    return res.status(400).json({ error: "Notes must be text or null" });
  }
  const cleaned = typeof notes === "string" ? notes.trim() : null;
  if (cleaned && cleaned.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ error: `Notes can be at most ${MAX_NOTE_LENGTH} characters` });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const existing = await db.query.accounts_receivable.findFirst({
      where: eq(accounts_receivable.id, id),
    });
    if (!existing) {
      return res.status(404).json({ error: "AR record not found" });
    }

    const [updated] = await db
      .update(accounts_receivable)
      .set({ notes: cleaned || null, updated_at: new Date() })
      .where(eq(accounts_receivable.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating AR notes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
