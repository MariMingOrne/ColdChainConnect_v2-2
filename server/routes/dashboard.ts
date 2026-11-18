import { RequestHandler } from "express";
import { and, count, eq, min, ne, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { accounts_receivable, bookings, deliveries, products } from "../db/schema";
import { calculateProductInventory } from "./pallets";
import type { DashboardSummary } from "@shared/api";

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /api/dashboard/summary: counts and totals computed in the database. */
export const getDashboardSummary: RequestHandler = async (_req, res) => {
  try {
    const [[pending], [active], [ar], productRows, inventory] = await Promise.all([
      db.select({ n: count() }).from(bookings).where(eq(bookings.status, "pending")),
      db.select({ n: count() }).from(deliveries).where(ne(deliveries.status, "completed")),
      db
        .select({
          total: sum(accounts_receivable.amount_due),
          n: count(),
          oldest: min(accounts_receivable.created_at),
        })
        .from(accounts_receivable)
        .where(eq(accounts_receivable.status, "outstanding")),
      db
        .select({ id: products.id, name: products.name, reorderPoint: products.reorder_point })
        .from(products)
        .where(and(sql`${products.reorder_point} is not null`, sql`coalesce(${products.is_discontinued}, false) = false`)),
      calculateProductInventory(),
    ]);

    const lowStock = productRows
      .map((p) => ({ id: p.id, name: p.name, available: inventory[p.id] ?? 0, reorderPoint: p.reorderPoint as number }))
      .filter((p) => p.available <= p.reorderPoint)
      .sort((a, b) => a.available / Math.max(a.reorderPoint, 1) - b.available / Math.max(b.reorderPoint, 1));

    const summary: DashboardSummary = {
      pendingOrders: Number(pending?.n ?? 0),
      activeDeliveries: Number(active?.n ?? 0),
      availableUnits: Object.values(inventory).reduce((total, units) => total + Number(units), 0),
      lowStock,
      receivables: {
        outstandingTotal: Number(ar?.total ?? 0).toFixed(2),
        outstandingCount: Number(ar?.n ?? 0),
        oldestDays: ar?.oldest ? Math.floor((Date.now() - new Date(ar.oldest).getTime()) / DAY_MS) : null,
      },
      generatedAt: new Date().toISOString(),
    };
    res.json(summary);
  } catch (error) {
    console.error("Error building dashboard summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
