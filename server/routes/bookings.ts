import { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { bookings, booking_items, invoices, agents, trucks, users, order_pallets, order_item_reservations } from "../db/schema";
import { AuthRequest } from "../middleware/auth";
import { logAction } from "../middleware/audit-logger";
import { CreditBlockResponse } from "../../shared/api";
import { evaluateCreditRules } from "../services/credit-rules";
import { estimateOrderTotal, loadCustomerCredit } from "../services/customer-credit";
import { getAgentOrderIds } from "../services/agent-bookings";
import { getAvailableUnitsByProduct, releaseBookingReservationsTx, reserveBookingItemsTx } from "../services/inventory-reservations";

class StockReservationConflict extends Error {
  constructor(readonly productId: string, readonly available: number, readonly requested: number) {
    super("Insufficient stock");
  }
}

function quantitiesForProduct(items: Array<{ product_id: string; qty_ordered: number }>, productId: string) {
  return items.filter((item) => item.product_id === productId).reduce((total, item) => total + item.qty_ordered, 0);
}

// Returns the truck serving the given district, preferring an available truck.
function findTruckForDistrict(
  allTrucks: Array<{ id: string; district: string; status: string | null }>,
  district: string
): { id: string; district: string; status: string | null } | null {
  const matches = allTrucks.filter((t) => t.district === district);
  if (matches.length === 0) return null;
  return matches.find((t) => t.status === "available") || matches[0];
}

export const listBookings: RequestHandler = async (req: AuthRequest, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);

    const { status } = req.query;
    const agentOrderIds = req.user?.role === "agent"
      ? await getAgentOrderIds(req.user.userId)
      : undefined;
    if (agentOrderIds?.length === 0) return res.json([]);

    const conditions = [
      status ? eq(bookings.status, status as any) : undefined,
      agentOrderIds ? inArray(bookings.id, agentOrderIds) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [allBookings, agentProfiles] = await Promise.all([
      db.query.bookings.findMany({
        where: whereClause,
        orderBy: [desc(bookings.created_at)],
        with: {
          booking_items: {
            with: {
              product: true,
            },
          },
          customer: { with: { discounts: true } },
          creator: true,
        },
      }),
      db.query.agents.findMany({
        columns: { user_id: true, full_name: true },
      }),
    ]);
    const agentByUserId = new Map(agentProfiles.map((agent) => [agent.user_id, agent]));

    res.json(allBookings.map((booking) => ({
      ...booking,
      creator: booking.creator
        ? { ...booking.creator, agent: agentByUserId.get(booking.created_by) ?? null }
        : booking.creator,
    })));
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createBooking: RequestHandler = async (req: AuthRequest, res) => {
  const { customer_id, prepared_delivery_date, items, ar_override, ar_override_reason } = req.body;

  if (!customer_id || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Customer ID and items array are required" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Demo mode: no real DB, skip insert and return a stub
  if (!process.env.DATABASE_URL) {
    return res.status(201).json({
      id: randomUUID(),
      customer_id,
      prepared_delivery_date: prepared_delivery_date || null,
      status: "pending",
      booking_items: [],
    });
  }

  try {
    // Validate that the user in the JWT actually exists in the DB.
    // Prevents FK violations when a stale or demo token is used.
    const creatorExists = await db.query.users.findFirst({
      where: eq(users.id, req.user.userId),
    });
    if (!creatorExists) {
      return res.status(401).json({ error: "User account not found. Please log in again." });
    }

    if (items.some((item: { product_id?: string; qty_ordered?: unknown }) =>
      !item?.product_id || !Number.isInteger(Number(item.qty_ordered)) || Number(item.qty_ordered) <= 0,
    )) {
      return res.status(400).json({ error: "Each item needs a product_id and a positive integer qty_ordered" });
    }

    const credit = await loadCustomerCredit(customer_id);
    if (!credit) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const newOrderAmount = await estimateOrderTotal(items, credit.discountRate);
    const violations = evaluateCreditRules({ ...credit.state, newOrderAmount });

    let creditOverride: { reason: string; violations: typeof violations } | null = null;
    if (violations.length > 0) {
      const isAdmin = req.user.role === "admin";
      const reason = typeof ar_override_reason === "string" ? ar_override_reason.trim() : "";
      if (!isAdmin || ar_override !== true) {
        const block: CreditBlockResponse = {
          error: "This customer's credit terms or limit block this booking.",
          code: "AR_CREDIT_BLOCKED",
          violations,
          canOverride: isAdmin,
        };
        return res.status(409).json(block);
      }
      if (!reason) {
        return res.status(400).json({ error: "An override reason is required" });
      }
      creditOverride = { reason, violations };
    }

    const bookingId = randomUUID();
    const bookingItemRows = items.map((item: { product_id: string; qty_ordered: number }) => ({
      id: randomUUID(),
      booking_id: bookingId,
      product_id: item.product_id,
      qty_ordered: Number(item.qty_ordered),
    }));

    await db.transaction(async (tx) => {
      await tx.insert(bookings).values({
        id: bookingId,
        customer_id,
        created_by: req.user!.userId,
        status: "pending",
        prepared_delivery_date: prepared_delivery_date || null,
      });
      if (bookingItemRows.length > 0) await tx.insert(booking_items).values(bookingItemRows);

      const reservation = await reserveBookingItemsTx(tx, bookingId, bookingItemRows, req.user!.userId);
      if (reservation.status === "insufficient_stock") {
        throw new StockReservationConflict(
          reservation.productId,
          reservation.available,
          quantitiesForProduct(bookingItemRows, reservation.productId),
        );
      }
    });

    const newBooking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        booking_items: {
          with: {
            product: true,
          },
        },
        customer: { with: { discounts: true } },
        creator: true,
      },
    });

    if (req.user) {
      await logAction(req.user.userId, "create", "booking", bookingId, undefined, newBooking);
    }

    if (req.user && creditOverride) {
      await logAction(req.user.userId, "ar_credit_override", "booking", bookingId, undefined, {
        customer_id,
        reason: creditOverride.reason,
        violations: creditOverride.violations,
        new_order_amount: newOrderAmount,
      });
    }

    res.status(201).json(newBooking);
  } catch (error) {
    if (error instanceof StockReservationConflict) {
      return res.status(409).json({
        error: `Only ${error.available} units are currently available for product ${error.productId}; this order requests ${error.requested}.`,
      });
    }
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateBookingStatus: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { status, driver_id } = req.body;

  if (!status && !driver_id) {
    return res.status(400).json({ error: "Status or driver_id is required" });
  }

  try {
    const existing = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: { customer: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Resolve which truck this booking should go to.
    // - If a truck was passed explicitly (driver_id), honor it.
    // - Otherwise, when approving, auto-assign the truck serving the customer's district.
    let resolvedTruckId: string | null = driver_id || null;
    if (driver_id) {
      const [explicitTruck] = await db.select().from(trucks).where(eq(trucks.id, driver_id));
      if (!explicitTruck) {
        return res.status(404).json({ error: "Truck not found" });
      }
      if (explicitTruck.district !== existing.customer?.district) {
        return res.status(400).json({
          error: `${explicitTruck.license_plate} serves ${explicitTruck.district}, but this customer is in ${existing.customer?.district || "no district"}.`,
        });
      }
    }
    if (!resolvedTruckId && status === "approved") {
      const customerDistrict = existing.customer?.district;
      if (!customerDistrict) {
        return res.status(400).json({
          error: `Set a truck district for "${existing.customer?.store_name || "this customer"}" in Customers first.`,
        });
      }
      const allTrucks = await db.select().from(trucks);
      const matchedTruck = findTruckForDistrict(allTrucks, customerDistrict);
      if (!matchedTruck) {
        return res.status(400).json({
          error: `No truck serves "${customerDistrict}". Add a truck for that district first.`,
        });
      }
      resolvedTruckId = matchedTruck.id;
    }

    const updates: any = {};
    if (status) updates.status = status;

    const updateResult = await db.transaction(async (tx) => {
      const [lockedBooking] = await tx.select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, id))
        .for("update");
      if (!lockedBooking) return { status: "not_found" as const };

      if (status && status !== "approved") {
        const existingInvoice = await tx.query.invoices.findFirst({
          where: eq(invoices.booking_id, id),
        });
        if (existingInvoice) return { status: "invoiced" as const };

        const reservedPallet = await tx.query.order_pallets.findFirst({
          where: eq(order_pallets.order_id, id),
        });
        if (reservedPallet) return { status: "reserved" as const };
        await releaseBookingReservationsTx(tx, id, req.user!.userId);
      }

      if (status === "approved" && lockedBooking.status !== "approved") {
        const items = await tx.query.booking_items.findMany({ where: eq(booking_items.booking_id, id) });
        const reservation = await reserveBookingItemsTx(tx, id, items, req.user!.userId);
        if (reservation.status === "insufficient_stock") {
          return { status: "insufficient_stock" as const, productId: reservation.productId, available: reservation.available };
        }
      }

      await tx.update(bookings).set(updates).where(eq(bookings.id, id));
      return { status: "updated" as const };
    });
    if (updateResult.status === "not_found") return res.status(404).json({ error: "Booking not found" });
    if (updateResult.status === "invoiced") {
      return res.status(409).json({ error: "An invoiced order cannot be moved out of approved status." });
    }
    if (updateResult.status === "reserved") {
      return res.status(409).json({ error: "Remove the order's unshipped pallets before moving it out of approved status." });
    }
    if (updateResult.status === "insufficient_stock") {
      return res.status(409).json({ error: `Only ${updateResult.available} units are currently available for product ${updateResult.productId}.` });
    }

    const updated = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: { booking_items: true, customer: true, creator: true },
    });

    if (req.user) {
      await logAction(req.user.userId, "update", "booking", id, existing, updated);
    }

    res.json({ booking: updated, invoice: null });
  } catch (error) {
    console.error("Error updating booking status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateBookingItems: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;
  const items = req.body?.items;
  if (!Array.isArray(items) || items.some((item) =>
    !item || typeof item.id !== "string" || !Number.isInteger(item.qty_ordered) || item.qty_ordered <= 0,
  )) {
    return res.status(400).json({ error: "Items must contain booking item IDs and positive integer quantities." });
  }

  try {
    const before = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: { booking_items: true },
    });
    if (!before) return res.status(404).json({ error: "Booking not found" });

    const result = await db.transaction(async (tx) => {
      const [booking] = await tx.select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, id))
        .for("update");
      if (!booking) return { status: "not_found" as const };
      if (booking.status !== "pending" && booking.status !== "approved") return { status: "locked" as const };

      const invoice = await tx.query.invoices.findFirst({ where: eq(invoices.booking_id, id) });
      const pallet = await tx.query.order_pallets.findFirst({ where: eq(order_pallets.order_id, id) });
      if (invoice || pallet) return { status: "locked" as const };

      const currentItems = await tx.query.booking_items.findMany({ where: eq(booking_items.booking_id, id) });
      if (items.length !== currentItems.length || new Set(items.map((item) => item.id)).size !== items.length ||
        items.some((item) => !currentItems.some((current) => current.id === item.id))) {
        return { status: "invalid_items" as const };
      }

      const activeReservation = await tx.query.order_item_reservations.findFirst({
        where: and(
          eq(order_item_reservations.booking_id, id),
          eq(order_item_reservations.status, "reserved"),
        ),
      });
      const updatedItems = currentItems.map((item) => ({
        ...item,
        qty_ordered: items.find((requested) => requested.id === item.id)!.qty_ordered as number,
      }));

      if (activeReservation) {
        const reservation = await reserveBookingItemsTx(tx, id, updatedItems, req.user!.userId, "superseded");
        if (reservation.status === "insufficient_stock") {
          return {
            status: "insufficient_stock" as const,
            productId: reservation.productId,
            available: reservation.available,
          };
        }
      }

      for (const item of updatedItems) {
        await tx.update(booking_items)
          .set({ qty_ordered: item.qty_ordered })
          .where(eq(booking_items.id, item.id));
      }
      return { status: "updated" as const };
    });

    if (result.status === "not_found") return res.status(404).json({ error: "Booking not found" });
    if (result.status === "locked") return res.status(409).json({ error: "Order quantities cannot be changed after pallets or an invoice exist." });
    if (result.status === "invalid_items") return res.status(400).json({ error: "The item list must match the order's current items." });
    if (result.status === "insufficient_stock") {
      return res.status(409).json({ error: `Only ${result.available} units are currently available for product ${result.productId}.` });
    }

    const updated = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: {
        booking_items: { with: { product: true } },
        customer: { with: { discounts: true } },
        creator: true,
      },
    });
    if (req.user) await logAction(req.user.userId, "update", "booking", id, before, updated);
    res.json(updated);
  } catch (error) {
    console.error("Error updating booking items:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteBooking: RequestHandler = async (req: AuthRequest, res) => {
  const { id } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const existing = await db.query.bookings.findFirst({ where: eq(bookings.id, id) });
    if (!existing) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const isAdmin = req.user.role === "admin";
    if (!isAdmin && existing.created_by !== req.user.userId) {
      return res.status(403).json({ error: "You can only roll back orders you created" });
    }
    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending orders can be rolled back" });
    }

    const invoice = await db.query.invoices.findFirst({ where: eq(invoices.booking_id, id) });
    if (invoice) {
      return res.status(409).json({ error: "This order already has an invoice and cannot be rolled back" });
    }

    const preparedPallet = await db.query.order_pallets.findFirst({
      where: and(eq(order_pallets.order_id, id), ne(order_pallets.status, "draft")),
    });
    if (preparedPallet) {
      return res.status(409).json({ error: "This order has prepared pallets and cannot be rolled back" });
    }

    await db.delete(bookings).where(eq(bookings.id, id));
    await logAction(req.user.userId, "rollback", "booking", id, existing, undefined);

    res.status(204).end();
  } catch (error) {
    console.error("Error rolling back booking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
