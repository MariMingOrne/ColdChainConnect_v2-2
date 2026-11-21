import type { RequestHandler } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { invoices } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { agentInvoiceFilter, agentInvoiceScope } from "../services/agent-bookings";
import { logAction } from "../middleware/audit-logger";
import { createInvoiceAfterPicking } from "../services/booking-invoices";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchInvoiceWithItems(id: string) {
  return db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: {
      invoice_items: true,
      agent: {
        columns: { id: true },
        with: { agents: { columns: { full_name: true } } },
      },
      booking: {
        with: {
          customer: true,
          booking_items: { with: { product: true } },
        },
      },
    },
  });
}

// ─── List Invoices ───────────────────────────────────────────────────────────

export const listInvoices: RequestHandler = async (req: AuthRequest, res) => {
  try {
    const { status, payment_status, unpaid } = req.query;

    const scope = await agentInvoiceFilter(req, invoices.id);
    if (scope.none) return res.json([]);

    const allInvoices = await db.query.invoices.findMany({
      where: scope.where,
      orderBy: [desc(invoices.created_at)],
      with: {
        invoice_items: true,
        agent: {
          columns: { id: true },
          with: { agents: { columns: { full_name: true } } },
        },
        booking: {
          with: {
            customer: true,
            booking_items: { with: { product: true } },
          },
        },
      },
    });

    let result = allInvoices.map((invoice) => {
      const fullName = invoice.agent?.agents.find((profile) => profile.full_name?.trim())?.full_name?.trim();
      const { agent, ...invoiceData } = invoice;
      return { ...invoiceData, prepared_by: fullName || invoice.prepared_by };
    });
    if (status) result = result.filter((i) => i.status === status);
    if (unpaid === "true") result = result.filter((i) => i.payment_status === "unpaid");
    else if (payment_status) result = result.filter((i) => i.payment_status === payment_status);

    res.json(result);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Get Single Invoice ──────────────────────────────────────────────────────

export const getInvoice: RequestHandler = async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const scope = await agentInvoiceScope(req);
    if (scope && !scope.includes(id)) return res.status(404).json({ error: "Invoice not found" });
    const invoice = await fetchInvoiceWithItems(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const fullName = invoice.agent?.agents.find((profile) => profile.full_name?.trim())?.full_name?.trim();
    const { agent, ...invoiceData } = invoice;
    res.json({ ...invoiceData, prepared_by: fullName || invoice.prepared_by });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Create Invoice ──────────────────────────────────────────────────────────

export const createInvoice: RequestHandler = async (req: AuthRequest, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: "Booking ID is required" });
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  try {
    const result = await createInvoiceAfterPicking(booking_id);
    if (result.status === "not_found") return res.status(404).json({ error: "Booking not found" });
    if (result.status === "not_ready") {
      return res.status(409).json({ error: "Prepare all pallets before creating the invoice." });
    }
    if (result.status === "incomplete_pick") {
      return res.status(409).json({ error: "Picked quantities must exactly match the booking before invoicing." });
    }

    if (result.status === "created") {
      await logAction(req.user.userId, "create", "invoice", result.invoice!.id, undefined, result.invoice);
    }

    res.status(result.status === "created" ? 201 : 200).json(result.invoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Update Invoice Status ───────────────────────────────────────────────────

export const updateInvoiceStatus: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: "Status is required" });

  try {
    const existing = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!existing) return res.status(404).json({ error: "Invoice not found" });

    await db.update(invoices).set({ status, updated_at: new Date() }).where(eq(invoices.id, id));
    const updated = await fetchInvoiceWithItems(id);

    if (req.user) {
      await logAction(req.user.userId, "update", "invoice", id, existing, updated);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating invoice status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Update Invoice Payment Status ──────────────────────────────────────────

export const updateInvoicePaymentStatus: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { payment_status } = req.body;

  if (!payment_status) return res.status(400).json({ error: "Payment status is required" });

  try {
    const existing = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!existing) return res.status(404).json({ error: "Invoice not found" });

    await db.update(invoices).set({ payment_status, updated_at: new Date() }).where(eq(invoices.id, id));
    const updated = await fetchInvoiceWithItems(id);

    if (req.user) {
      await logAction(req.user.userId, "update", "invoice_payment", id, existing, updated);
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating invoice payment status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
