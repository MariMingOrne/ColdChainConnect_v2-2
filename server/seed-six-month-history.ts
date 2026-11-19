import "dotenv/config";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "./db";
import {
  accounts_receivable,
  agent_returns,
  agents,
  batch_pallets,
  booking_items,
  bookings,
  customers,
  deliveries,
  delivery_items,
  inventory_batches,
  invoice_items,
  invoices,
  order_item_reservations,
  order_pallet_items,
  order_pallets,
  pallet_items,
  products,
  receipts,
  users,
} from "./db/schema";
import { formatCustomerAddress, totalDiscountRate } from "../shared/api";

const PREFIX = "hist-";
const MONTHS_BACK = 6;
const ORDERS_PER_AGENT_PER_MONTH = 20;
const AGENT_USERNAMES = ["agent1", "agent2", "agent3"];
const PRODUCT_NAMES = ["Chicken Breast", "Pork Chops", "Fish Fillet", "Beef Steak"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STOCK_BUFFER = 1.1;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DISPATCH_TIME = "08:00";
const DISPATCH_HOUR = 8;
const STOP_MINUTES = 40;
const UNPALLETTED_PALLET_ID = `${PREFIX}pallet-unpalletted`;
const UNPALLETTED_BATCH_ID = `${PREFIX}batch-returns`;
const REJECT_REASON = "Return was submitted after the return window for this invoice closed.";
const RETURN_REASONS = {
  good: ["Customer over-ordered", "Wrong item delivered", "Customer requested a product exchange"],
  damaged: ["Damaged packaging on arrival", "Temperature check failed on arrival"],
} as const;

type Stage = "pending" | "delivered" | "in_transit" | "upcoming";
type Month = { key: string; label: string; start: number; isCurrent: boolean; availableDays: number };

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ymd = (ms: number) => iso(ms).replace(/-/g, "");
const at = (dayStart: number, hours: number, minutes = 0) => new Date(dayStart + hours * HOUR_MS + minutes * MINUTE_MS);
const money = (value: number) => value.toFixed(2);
const chunk = <T>(rows: T[], size = 500) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

function buildMonths(now: Date, todayStart: number): Month[] {
  return Array.from({ length: MONTHS_BACK }, (_, index) => {
    const offset = index - (MONTHS_BACK - 1);
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1);
    const date = new Date(start);
    const isCurrent = offset === 0;
    const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      key: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
      start,
      isCurrent,
      availableDays: isCurrent ? Math.min(daysInMonth, new Date(todayStart).getUTCDate() - 1) : daysInMonth,
    };
  });
}

async function seedHistory() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const months = buildMonths(now, todayStart);

  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.username, "admin")).limit(1);
  if (!admin) throw new Error('Needs an "admin" user to review returns.');

  const agentRecords = await db
    .select({ agentId: agents.id, userId: users.id, username: users.username })
    .from(agents)
    .innerJoin(users, eq(agents.user_id, users.id))
    .where(inArray(users.username, AGENT_USERNAMES));
  const agentList = AGENT_USERNAMES.map((username) => {
    const agent = agentRecords.find((row) => row.username === username);
    if (!agent) throw new Error(`Missing agent profile for "${username}".`);
    return agent;
  });

  const customerRows = await db.query.customers.findMany({
    where: inArray(customers.agent_id, agentList.map((agent) => agent.userId)),
    with: { discounts: true },
  });
  const truckRows = await db.query.trucks.findMany({ with: { driver: true } });
  const productRows = await db.query.products.findMany({ where: inArray(products.name, PRODUCT_NAMES) });
  const productByIndex = PRODUCT_NAMES.map((name) => {
    const product = productRows.find((row) => row.name === name);
    if (!product) throw new Error(`Missing product "${name}".`);
    return product;
  });

  const customersByAgent = agentList.map((agent) => {
    const list = customerRows
      .filter((customer) => customer.agent_id === agent.userId)
      .sort((a, b) => a.store_name.localeCompare(b.store_name));
    if (list.length === 0) throw new Error(`${agent.username} has no customers.`);
    return list;
  });

  const truckFor = (district: string | null) => {
    const truck = truckRows.find((row) => row.district === district);
    if (!truck?.driver) throw new Error(`No truck with an assigned driver for district "${district}".`);
    return truck;
  };

  type Product = (typeof productByIndex)[number];
  type Customer = (typeof customerRows)[number];
  type Truck = (typeof truckRows)[number];
  type Line = { product: Product; productIndex: number; qty: number; unitPrice: number };
  type Order = {
    key: string;
    seq: number;
    monthKey: string;
    agent: (typeof agentList)[number];
    customer: Customer;
    truck: Truck;
    orderDay: number;
    deliveryDay: number;
    stage: Stage;
    lines: Line[];
    createdAt: Date;
    paid: boolean;
    paymentMethod: string | null;
    paymentReference: string | null;
    receiptNumber: string | null;
    invoiceNumber: string;
    stopIndex: number;
  };

  const orders: Order[] = [];
  let seq = 0;
  for (const month of months) {
    if (month.availableDays < 1) continue;
    for (let k = 0; k < ORDERS_PER_AGENT_PER_MONTH; k++) {
      for (const [agentIndex, agent] of agentList.entries()) {
        seq++;
        const dayOffset = 1 + Math.floor((k * month.availableDays) / ORDERS_PER_AGENT_PER_MONTH);
        const orderDay = month.start + (dayOffset - 1) * DAY_MS;
        if (orderDay >= todayStart) continue;

        const customerList = customersByAgent[agentIndex];
        const customer = customerList[k % customerList.length];
        const truck = truckFor(customer.district);
        const isLateInMonth = month.isCurrent && dayOffset > month.availableDays - 3;
        const deliveryDay = orderDay + (isLateInMonth ? 3 + (seq % 2) : 1 + (seq % 2)) * DAY_MS;
        const isPending = month.isCurrent && k === ORDERS_PER_AGENT_PER_MONTH - 1;
        const stage: Stage = isPending
          ? "pending"
          : deliveryDay < todayStart
            ? "delivered"
            : deliveryDay === todayStart
              ? "in_transit"
              : "upcoming";
        const delivered = stage === "delivered";
        const paid = delivered && !(customer.payment_type === "bank_transfer" && seq % 6 === 4);
        const seqCode = seq.toString(36).toUpperCase().padStart(4, "0");
        const invoiceDigits = String((seq * 7919) % 1_000_000).padStart(6, "0");

        const excludedIndex = seq % PRODUCT_NAMES.length;
        const lines: Line[] = productByIndex.flatMap((product, productIndex) => {
          if (seq % 3 !== 0 && productIndex === excludedIndex) return [];
          return [{ product, productIndex, qty: 3 + ((seq * 5 + productIndex * 7) % 10), unitPrice: Number(product.price) }];
        });

        orders.push({
          key: `${month.key}-${agent.username}-${String(k).padStart(2, "0")}`,
          seq,
          monthKey: month.key,
          agent,
          customer,
          truck,
          orderDay,
          deliveryDay,
          stage,
          lines,
          createdAt: at(orderDay, 6 + (k % 3), (k * 7) % 60),
          paid,
          paymentMethod: paid ? customer.payment_type ?? "cash" : null,
          paymentReference: paid && customer.payment_type === "bank_transfer" ? `TR-${ymd(deliveryDay)}-${seqCode}` : null,
          receiptNumber: delivered ? `OR-${ymd(deliveryDay)}-${seqCode}` : null,
          invoiceNumber: `${invoiceDigits.slice(0, 3)} ${invoiceDigits.slice(3)}`,
          stopIndex: 0,
        });
      }
    }
  }

  const runGroups = new Map<string, Order[]>();
  for (const order of orders) {
    if (order.stage === "pending") continue;
    const groupKey = `${order.truck.id}|${order.deliveryDay}`;
    runGroups.set(groupKey, [...(runGroups.get(groupKey) ?? []), order]);
  }
  for (const group of runGroups.values()) {
    if (new Set(group.map((order) => order.agent.userId)).size !== 1) {
      throw new Error(`Delivery run for ${group[0].truck.license_plate} mixes agents.`);
    }
    group.sort((a, b) => (b.customer.latitude ?? 0) - (a.customer.latitude ?? 0));
    group.forEach((order, index) => {
      order.stopIndex = index;
    });
  }

  const completedAtFor = (order: Order) => at(order.deliveryDay, DISPATCH_HOUR, order.stopIndex * STOP_MINUTES);
  const bookingStatusFor: Record<Stage, (typeof bookings.$inferInsert)["status"]> = {
    pending: "pending",
    delivered: "ready",
    in_transit: "ready",
    upcoming: "prep",
  };
  const runStatusFor: Record<Exclude<Stage, "pending">, (typeof deliveries.$inferInsert)["status"]> = {
    delivered: "completed",
    in_transit: "in_transit",
    upcoming: "pending",
  };

  const stockByMonthProduct = new Map<string, { ordered: number; shipped: number }>();
  for (const order of orders) {
    if (order.stage === "pending") continue;
    for (const line of order.lines) {
      const stockKey = `${order.monthKey}|${line.productIndex}`;
      const entry = stockByMonthProduct.get(stockKey) ?? { ordered: 0, shipped: 0 };
      entry.ordered += line.qty;
      if (order.stage === "delivered" || order.stage === "in_transit") entry.shipped += line.qty;
      stockByMonthProduct.set(stockKey, entry);
    }
  }

  const restockedByProduct = PRODUCT_NAMES.map(() => 0);
  const eligibleReturns = orders
    .filter((order) => order.stage === "delivered" && order.deliveryDay <= todayStart - 2 * DAY_MS)
    .sort((a, b) => a.deliveryDay - b.deliveryDay || a.seq - b.seq);

  const batchRows: (typeof inventory_batches.$inferInsert)[] = [];
  const batchPalletRows: (typeof batch_pallets.$inferInsert)[] = [];
  const palletItemRows: (typeof pallet_items.$inferInsert)[] = [];
  const bookingRows: (typeof bookings.$inferInsert)[] = [];
  const bookingItemRows: (typeof booking_items.$inferInsert)[] = [];
  const reservationRows: (typeof order_item_reservations.$inferInsert)[] = [];
  const orderPalletRows: (typeof order_pallets.$inferInsert)[] = [];
  const orderPalletItemRows: (typeof order_pallet_items.$inferInsert)[] = [];
  const invoiceRows: (typeof invoices.$inferInsert)[] = [];
  const invoiceItemRows: (typeof invoice_items.$inferInsert)[] = [];
  const runRows: (typeof deliveries.$inferInsert)[] = [];
  const deliveryItemRows: (typeof delivery_items.$inferInsert)[] = [];
  const receiptRows: (typeof receipts.$inferInsert)[] = [];
  const arRows: (typeof accounts_receivable.$inferInsert)[] = [];
  const returnRows: (typeof agent_returns.$inferInsert)[] = [];

  for (const month of months) {
    batchRows.push({
      id: `${PREFIX}batch-${month.key}`,
      batch_name: `Restock ${month.label}`,
      is_archived: false,
      created_at: new Date(month.start),
      updated_at: new Date(month.start),
    });
    productByIndex.forEach((_, productIndex) => {
      const entry = stockByMonthProduct.get(`${month.key}|${productIndex}`);
      if (!entry) return;
      const palletId = `${PREFIX}stock-${month.key}-${productIndex}`;
      const received = iso(month.start);
      batchPalletRows.push({
        id: palletId,
        batch_id: `${PREFIX}batch-${month.key}`,
        pallet_id: `HIST-${month.key}-${productIndex + 1}`,
        supplier_name: "Cold storage supplier",
        received_date: received,
        storage_zone: `Freezer ${String.fromCharCode(65 + productIndex)}`,
        placement_location: `A-${productIndex + 1}`,
        created_at: new Date(month.start),
        updated_at: new Date(month.start),
      });
      palletItemRows.push({
        id: `${PREFIX}stock-item-${month.key}-${productIndex}`,
        pallet_id: palletId,
        product_id: productByIndex[productIndex].id,
        qty_units: Math.ceil(entry.ordered * STOCK_BUFFER) - entry.shipped,
        expiration_date: iso(month.start + 365 * DAY_MS),
        created_at: new Date(month.start),
        updated_at: now,
      });
    });
  }

  batchRows.push({
    id: UNPALLETTED_BATCH_ID,
    batch_name: "Returned Goods (Unpalleted)",
    is_archived: false,
    created_at: new Date(months[0].start),
    updated_at: now,
  });
  batchPalletRows.push({
    id: UNPALLETTED_PALLET_ID,
    batch_id: UNPALLETTED_BATCH_ID,
    pallet_id: "UNPALLETTED",
    received_date: iso(todayStart),
    storage_zone: "Returns Bay",
    placement_location: "R-1",
    created_at: new Date(months[0].start),
    updated_at: now,
  });

  for (const order of orders) {
    const { key, agent, customer, truck, stage, lines } = order;
    const bookingId = `${PREFIX}booking-${key}`;
    const invoiceId = `${PREFIX}invoice-${key}`;
    const palletId = `${PREFIX}order-pallet-${key}`;
    const runId = `${PREFIX}run-${ymd(order.deliveryDay)}-${truck.license_plate.replace(/\s/g, "")}`;
    const deliveryItemId = `${PREFIX}delivery-item-${key}`;
    const hasInvoice = stage !== "pending";
    const delivered = stage === "delivered";
    const shipped = stage === "delivered" || stage === "in_transit";
    const completedAt = delivered ? completedAtFor(order) : null;
    const runCreatedAt = at(order.deliveryDay - DAY_MS, 16);
    const gross = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    const discountRate = totalDiscountRate(customer.discounts);
    const discount = gross * discountRate;
    const total = gross - discount;
    const unpaidAfterDelivery = delivered && !order.paid;

    bookingRows.push({
      id: bookingId,
      customer_id: customer.id,
      created_by: agent.userId,
      status: bookingStatusFor[stage],
      prepared_delivery_date: stage === "pending" ? null : iso(order.deliveryDay),
      created_at: order.createdAt,
    });

    lines.forEach((line, index) => {
      const bookingItemId = `${PREFIX}booking-item-${key}-${index}`;
      bookingItemRows.push({
        id: bookingItemId,
        booking_id: bookingId,
        product_id: line.product.id,
        qty_ordered: line.qty,
        created_at: order.createdAt,
      });
      reservationRows.push({
        id: `${PREFIX}reservation-${key}-${index}`,
        booking_id: bookingId,
        booking_item_id: bookingItemId,
        product_id: line.product.id,
        qty_reserved: line.qty,
        status: stage === "pending" ? "reserved" : "converted",
        created_by: agent.userId,
        updated_by: agent.userId,
        created_at: order.createdAt,
        updated_at: order.createdAt,
      });
    });

    if (!hasInvoice) continue;

    orderPalletRows.push({
      id: palletId,
      order_id: bookingId,
      truck_id: truck.id,
      status: shipped ? "shipped" : "approved",
      created_at: at(order.orderDay, 10),
      updated_at: shipped ? at(order.deliveryDay, 7) : at(order.orderDay, 10, 30),
    });

    lines.forEach((line, index) => {
      orderPalletItemRows.push({
        id: `${PREFIX}order-pallet-item-${key}-${index}`,
        pallet_id: palletId,
        product_id: line.product.id,
        qty_units: line.qty,
        unit_cost: line.product.price,
        batch_item_id: `${PREFIX}stock-item-${order.monthKey}-${line.productIndex}`,
        created_at: at(order.orderDay, 10),
        updated_at: at(order.orderDay, 10),
      });
    });

    const invoiceCreatedAt = at(order.orderDay, 11);
    invoiceRows.push({
      id: invoiceId,
      booking_id: bookingId,
      agent_id: agent.userId,
      status: order.paid ? "paid" : "issued",
      payment_status: order.paid ? "paid" : "unpaid",
      receipt_number: order.invoiceNumber,
      customer_name: customer.store_name,
      customer_address: formatCustomerAddress(customer),
      customer_payment_type: customer.payment_type,
      discount_rate: String(discountRate),
      gross_amount: money(gross),
      discount_amount: money(discount),
      total_amount: money(total),
      prepared_by: agent.username,
      created_at: invoiceCreatedAt,
      updated_at: completedAt && order.paid ? completedAt : invoiceCreatedAt,
    });

    lines.forEach((line, index) => {
      invoiceItemRows.push({
        id: `${PREFIX}invoice-item-${key}-${index}`,
        invoice_id: invoiceId,
        product_id: line.product.id,
        product_name: line.product.name,
        product_sku: line.product.sku,
        qty_ordered: line.qty,
        unit_price: money(line.unitPrice),
        amount: money(line.qty * line.unitPrice),
        created_at: invoiceCreatedAt,
      });
    });

    deliveryItemRows.push({
      id: deliveryItemId,
      delivery_id: runId,
      invoice_id: invoiceId,
      destination_customer_id: customer.id,
      status: delivered ? "completed" : stage === "in_transit" ? "in_transit" : "pending",
      completed_at: completedAt,
      receipt_number: order.receiptNumber,
      is_paid: order.paid,
      payment_method: order.paymentMethod,
      payment_reference: order.paymentReference,
      paid_at: order.paid ? completedAt : null,
      created_at: runCreatedAt,
      updated_at: completedAt ?? runCreatedAt,
    });

    if (delivered && completedAt && order.receiptNumber) {
      receiptRows.push({
        id: `${PREFIX}receipt-${key}`,
        receipt_number: order.receiptNumber,
        delivery_item_id: deliveryItemId,
        customer_id: customer.id,
        truck_id: truck.id,
        invoice_id: invoiceId,
        confirmed_by: truck.driver?.user_id ?? null,
        payment_reference: order.paymentReference,
        confirmed_at: completedAt,
      });
    }

    if (unpaidAfterDelivery && completedAt) {
      arRows.push({
        id: `${PREFIX}ar-${key}`,
        customer_id: customer.id,
        delivery_item_id: deliveryItemId,
        invoice_id: invoiceId,
        amount_due: money(total),
        status: "outstanding",
        notes: `Delivery confirmed on ${completedAt.toISOString()}. Payment pending.`,
        created_at: completedAt,
        updated_at: completedAt,
      });
    }
  }

  for (const group of runGroups.values()) {
    const [first] = group;
    const stage = first.stage as Exclude<Stage, "pending">;
    const runCreatedAt = at(first.deliveryDay - DAY_MS, 16);
    runRows.push({
      id: `${PREFIX}run-${ymd(first.deliveryDay)}-${first.truck.license_plate.replace(/\s/g, "")}`,
      truck_id: first.truck.id,
      driver_id: first.truck.driver_id,
      agent_id: first.agent.agentId,
      scheduled_date: iso(first.deliveryDay),
      scheduled_time: DISPATCH_TIME,
      status: runStatusFor[stage],
      created_at: runCreatedAt,
      updated_at: stage === "delivered" ? at(first.deliveryDay, 15) : stage === "in_transit" ? at(first.deliveryDay, 8) : runCreatedAt,
    });
  }

  for (const [index, order] of eligibleReturns.entries()) {
    if (index % 10 !== 9) continue;
    const r = Math.floor(index / 10);
    const line = order.lines[index % order.lines.length];
    const qty = Math.min(line.qty, 1 + (r % 2));
    const condition = r % 3 === 2 ? "damaged" : "good";
    const recent = order.deliveryDay >= todayStart - 6 * DAY_MS;
    const status = recent ? "pending" : r % 7 === 6 ? "rejected" : "accepted";
    const returnId = `${PREFIX}return-${order.key}`;
    const createdAt = at(order.deliveryDay + DAY_MS, 10);
    const reviewedAt = status === "pending" ? null : at(order.deliveryDay + DAY_MS, 16);
    const reasons = RETURN_REASONS[condition];
    let reason: string | null = reasons[r % reasons.length];
    let arCreditId: string | null = null;
    let restoredPalletId: string | null = null;

    if (status === "accepted") {
      arCreditId = `${PREFIX}ar-return-${order.key}`;
      if (condition === "good") {
        restoredPalletId = UNPALLETTED_PALLET_ID;
        restockedByProduct[line.productIndex] += qty;
      }
      arRows.push({
        id: arCreditId,
        customer_id: order.customer.id,
        delivery_item_id: null,
        invoice_id: `${PREFIX}invoice-${order.key}`,
        amount_due: `-${money(line.unitPrice * qty)}`,
        status: "outstanding",
        notes: `Return credit: ${qty}x ${line.product.name} (${condition}). Return ID: ${returnId}`,
        created_at: reviewedAt ?? createdAt,
        updated_at: reviewedAt ?? createdAt,
      });
    }
    if (status === "rejected") reason = REJECT_REASON;

    returnRows.push({
      id: returnId,
      invoice_id: `${PREFIX}invoice-${order.key}`,
      customer_id: order.customer.id,
      product_id: line.product.id,
      product_name: line.product.name,
      qty_returned: qty,
      return_type: condition,
      reason,
      status,
      restored_to_pallet_id: restoredPalletId,
      ar_credit_id: arCreditId,
      created_by: order.agent.userId,
      reviewed_by: status === "pending" ? null : admin.id,
      reviewed_at: reviewedAt,
      created_at: createdAt,
      updated_at: reviewedAt ?? createdAt,
    });
  }

  productByIndex.forEach((product, productIndex) => {
    palletItemRows.push({
      id: `${PREFIX}unpalletted-item-${productIndex}`,
      pallet_id: UNPALLETTED_PALLET_ID,
      product_id: product.id,
      qty_units: restockedByProduct[productIndex],
      expiration_date: null,
      created_at: new Date(months[0].start),
      updated_at: now,
    });
  });

  await db.transaction(async (tx) => {
    await tx.delete(agent_returns).where(like(agent_returns.id, `${PREFIX}%`));
    await tx.delete(accounts_receivable).where(like(accounts_receivable.id, `${PREFIX}%`));
    await tx.delete(receipts).where(like(receipts.id, `${PREFIX}%`));
    await tx.delete(delivery_items).where(like(delivery_items.id, `${PREFIX}%`));
    await tx.delete(deliveries).where(like(deliveries.id, `${PREFIX}%`));
    await tx.delete(order_item_reservations).where(like(order_item_reservations.id, `${PREFIX}%`));
    await tx.delete(order_pallet_items).where(like(order_pallet_items.id, `${PREFIX}%`));
    await tx.delete(order_pallets).where(like(order_pallets.id, `${PREFIX}%`));
    await tx.delete(invoice_items).where(like(invoice_items.id, `${PREFIX}%`));
    await tx.delete(invoices).where(like(invoices.id, `${PREFIX}%`));
    await tx.delete(booking_items).where(like(booking_items.id, `${PREFIX}%`));
    await tx.delete(bookings).where(like(bookings.id, `${PREFIX}%`));
    await tx.delete(pallet_items).where(like(pallet_items.id, `${PREFIX}%`));
    await tx.delete(batch_pallets).where(like(batch_pallets.id, `${PREFIX}%`));
    await tx.delete(inventory_batches).where(like(inventory_batches.id, `${PREFIX}%`));

    for (const rows of chunk(batchRows)) await tx.insert(inventory_batches).values(rows);
    for (const rows of chunk(batchPalletRows)) await tx.insert(batch_pallets).values(rows);
    for (const rows of chunk(palletItemRows)) await tx.insert(pallet_items).values(rows);
    for (const rows of chunk(bookingRows)) await tx.insert(bookings).values(rows);
    for (const rows of chunk(bookingItemRows)) await tx.insert(booking_items).values(rows);
    for (const rows of chunk(reservationRows)) await tx.insert(order_item_reservations).values(rows);
    for (const rows of chunk(orderPalletRows)) await tx.insert(order_pallets).values(rows);
    for (const rows of chunk(orderPalletItemRows)) await tx.insert(order_pallet_items).values(rows);
    for (const rows of chunk(invoiceRows)) await tx.insert(invoices).values(rows);
    for (const rows of chunk(invoiceItemRows)) await tx.insert(invoice_items).values(rows);
    for (const rows of chunk(runRows)) await tx.insert(deliveries).values(rows);
    for (const rows of chunk(deliveryItemRows)) await tx.insert(delivery_items).values(rows);
    for (const rows of chunk(receiptRows)) await tx.insert(receipts).values(rows);
    for (const rows of chunk(arRows)) await tx.insert(accounts_receivable).values(rows);
    for (const rows of chunk(returnRows)) await tx.insert(agent_returns).values(rows);
  });

  const countBy = (stage: Stage) => orders.filter((order) => order.stage === stage).length;
  console.log(
    `Seeded ${orders.length} orders across ${months.length} months (${ORDERS_PER_AGENT_PER_MONTH} per agent per month): ` +
      `${countBy("delivered")} delivered, ${countBy("in_transit")} in transit, ${countBy("upcoming")} upcoming, ${countBy("pending")} pending. ` +
      `${runRows.length} delivery runs, ${receiptRows.length} receipts, ${arRows.length} AR entries, ${returnRows.length} returns.`,
  );
}

seedHistory()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("History seed failed:", error);
    process.exit(1);
  });
