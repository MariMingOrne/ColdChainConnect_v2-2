import { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ModulePermission } from "@shared/api";
import { db } from "../db";
import { accounts_receivable, agent_returns, bookings, customers, deliveries, inventory_batches, invoices } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";

/** Sidebar tabs that show a "new" badge; each counts rows created after the viewer last opened the tab. */
const SECTIONS: Record<string, { table: PgTable; column: PgColumn; module: ModulePermission }> = {
  orders: { table: bookings, column: bookings.created_at, module: "order-fulfillment" },
  receipts: { table: invoices, column: invoices.created_at, module: "order-fulfillment" },
  inventory: { table: inventory_batches, column: inventory_batches.created_at, module: "product-customer" },
  customers: { table: customers, column: customers.created_at, module: "product-customer" },
  dispatch: { table: deliveries, column: deliveries.created_at, module: "delivery-operations" },
  accounts: { table: accounts_receivable, column: accounts_receivable.created_at, module: "delivery-operations" },
  returns: { table: agent_returns, column: agent_returns.created_at, module: "delivery-operations" },
};

/** GET /api/unseen?orders=<ISO>&receipts=<ISO>...: how many records each tab gained since the given time. One round trip to the database for all tabs. */
export const getUnseenCounts: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const permissions = (req as AuthRequest).modulePermissions;
    const parts: ReturnType<typeof sql>[] = [];
    const result: Record<string, number> = {};
    for (const [key, section] of Object.entries(SECTIONS)) {
      result[key] = 0;
      const raw = req.query[key];
      const since = typeof raw === "string" ? new Date(raw) : null;
      const allowed = user?.role === "admin" || permissions?.includes(section.module);
      if (!allowed || !since || Number.isNaN(since.getTime())) continue;
      parts.push(sql`(select count(*)::int from ${section.table} where ${section.column} > ${since.toISOString()}::timestamp) as ${sql.identifier(key)}`);
    }
    if (parts.length > 0) {
      const { rows } = await db.execute(sql`select ${sql.join(parts, sql`, `)}`);
      for (const [key, value] of Object.entries(rows[0] ?? {})) result[key] = Number(value);
    }
    res.json(result);
  } catch (error) {
    console.error("Error counting unseen records:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
