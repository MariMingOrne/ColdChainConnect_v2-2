import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  accounts_receivable,
  agent_returns,
  agents,
  batch_pallets,
  booking_items,
  bookings,
  customer_discounts,
  customers,
  deliveries,
  delivery_items,
  drivers,
  invoice_items,
  invoices,
  inventory_batches,
  order_pallet_items,
  order_pallets,
  pallet_items,
  products,
  receipts,
  trucks,
  users,
} from "./db/schema";
import { hashPassword } from "./auth";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DISTRICTS = ["North Pampanga", "Central Pampanga", "South Pampanga"] as const;
const STORES = [
  {
    name: "SM Hypermarket - SM City Clark",
    city: "Angeles City",
    address: "M.A. Roxas Highway, Malabanias, Clark Freeport Zone",
    postalCode: "2009",
    latitude: 15.16845,
    longitude: 120.58018,
  },
  {
    name: "Robinsons Supermarket - Robinsons Angeles",
    city: "Angeles City",
    address: "MacArthur Highway, Balibago",
    postalCode: "2009",
    latitude: 15.15712,
    longitude: 120.59184,
  },
  {
    name: "Puregold Dau",
    city: "Mabalacat City",
    address: "MacArthur Highway, Barangay Dau",
    postalCode: "2010",
    latitude: 15.17451,
    longitude: 120.58916,
  },
  {
    name: "Robinsons Supermarket - Robinsons Starmills Pampanga",
    city: "San Fernando City",
    address: "Jose Abad Santos Avenue, Barangay San Jose",
    postalCode: "2000",
    latitude: 15.0499,
    longitude: 120.6993,
  },
  {
    name: "SM Supermarket - SM City San Fernando Downtown",
    city: "San Fernando City",
    address: "V. Tiomico Street corner Consunji Street, Santo Rosario",
    postalCode: "2000",
    latitude: 15.02773,
    longitude: 120.69239,
  },
  {
    name: "Puregold Jr. Fernandino",
    city: "San Fernando City",
    address: "B. Mendoza Street",
    postalCode: "2000",
    latitude: 15.03346,
    longitude: 120.68696,
  },
  {
    name: "Puregold Jr. Guagua",
    city: "Guagua",
    address: "Feeder Road, Santo Niño",
    postalCode: "2003",
    latitude: 14.96245,
    longitude: 120.63066,
  },
  {
    name: "Super 8 Grocery Warehouse Guagua",
    city: "Guagua",
    address: "Senator Gil Puyat Avenue",
    postalCode: "2003",
    latitude: 14.96415,
    longitude: 120.63084,
  },
  {
    name: "Puregold Jr. Lubao",
    city: "Lubao",
    address: "Jose Abad Santos Avenue",
    postalCode: "2005",
    latitude: 14.90744,
    longitude: 120.55721,
  },
] as const;

const PRODUCTS = [
  { name: "Chicken Breast", sku: "CCC-CHKN-001", price: "150.00", reorder_point: 300 },
  { name: "Pork Chops", sku: "CCC-PORK-002", price: "200.00", reorder_point: 250 },
  { name: "Fish Fillet", sku: "CCC-FISH-003", price: "180.00", reorder_point: 200 },
  { name: "Beef Steak", sku: "CCC-BEEF-004", price: "250.00", reorder_point: 150 },
] as const;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const timeAt = (dayStart: number, hours: number, minutes = 0) => new Date(dayStart + hours * HOUR_MS + minutes * 60_000);

async function findOrCreateUser(username: string, role: "admin" | "agent") {
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
    if (existing.role !== role) throw new Error(`The account ${username} already exists with a different role.`);
    return { id: existing.id, password: undefined };
  }

  const password = randomBytes(24).toString("base64url");
  const id = randomUUID();
  await db.insert(users).values({
    id,
    username,
    password_hash: await hashPassword(password),
    role,
  });
  return { id, password };
}

async function seedPampanga() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const admin = await findOrCreateUser("admin", "admin");
  const agentAccounts = await Promise.all(
    DISTRICTS.map((_, index) => findOrCreateUser(`pampanga-agent-${index + 1}`, "agent"))
  );
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const staffRows = DISTRICTS.map((district, index) => ({
    agentId: randomUUID(),
    agentUserId: agentAccounts[index].id,
    driverId: randomUUID(),
    district,
  }));
  const truckIds = DISTRICTS.map(() => randomUUID());
  const productIds = PRODUCTS.map(() => randomUUID());
  const inventoryBatchId = randomUUID();
  const sourcePalletIds = PRODUCTS.map(() => randomUUID());
  const sourceItemIds = PRODUCTS.map(() => randomUUID());
  const customerIds = STORES.map(() => randomUUID());
  const customerRows = STORES.map((store, index) => {
    const districtIndex = Math.floor(index / 3);
    return {
      id: customerIds[index],
      store_name: store.name,
      location: store.city,
      district: DISTRICTS[districtIndex],
      street_address: store.address,
      state: "Pampanga",
      postal_code: store.postalCode,
      latitude: store.latitude,
      longitude: store.longitude,
      agent_id: staffRows[districtIndex].agentUserId,
      payment_type: index % 3 === 0 ? "cash" : "bank_transfer",
      credit_limit: "100000.00",
      credit_terms_days: 30,
      created_at: now,
      updated_at: now,
    };
  });
  const productRows = PRODUCTS.map((product, index) => ({
    id: productIds[index],
    name: product.name,
    sku: product.sku,
    price: product.price,
    batch_tracking_enabled: true,
    reorder_point: product.reorder_point,
    manufacturer: null,
    created_at: now,
    updated_at: now,
  }));

  const bookingRows: (typeof bookings.$inferInsert)[] = [];
  const bookingItemRows: (typeof booking_items.$inferInsert)[] = [];
  const orderPalletRows: (typeof order_pallets.$inferInsert)[] = [];
  const orderPalletItemRows: (typeof order_pallet_items.$inferInsert)[] = [];
  const invoiceRows: (typeof invoices.$inferInsert)[] = [];
  const invoiceItemRows: (typeof invoice_items.$inferInsert)[] = [];
  const deliveryRows: (typeof deliveries.$inferInsert)[] = [];
  const deliveryItemRows: (typeof delivery_items.$inferInsert)[] = [];
  const receiptRows: (typeof receipts.$inferInsert)[] = [];
  const arRows: (typeof accounts_receivable.$inferInsert)[] = [];
  const returnRows: (typeof agent_returns.$inferInsert)[] = [];
  const stockRemaining = PRODUCTS.map(() => 3000);
  let orderCount = 0;
  let receiptCount = 0;
  let arCount = 0;
  let returnCount = 0;

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const dayStart = today.getTime() - daysAgo * DAY_MS;
    const date = isoDate(new Date(dayStart));
    const dateKey = date.replace(/-/g, "");
    const deliveryDate = date;
    const recentStage = daysAgo === 0;
    const isDelivered = daysAgo >= 2;
    const runIds = DISTRICTS.map(() => randomUUID());

    for (let districtIndex = 0; districtIndex < DISTRICTS.length; districtIndex++) {
      if (daysAgo > 0) {
        deliveryRows.push({
          id: runIds[districtIndex],
          truck_id: truckIds[districtIndex],
          driver_id: staffRows[districtIndex].driverId,
          agent_id: staffRows[districtIndex].agentId,
          scheduled_date: deliveryDate,
          scheduled_time: "09:00",
          status: isDelivered ? "completed" : "in_transit",
          created_at: timeAt(dayStart, 8, districtIndex * 10),
          updated_at: isDelivered ? timeAt(dayStart, 12, districtIndex * 10) : timeAt(dayStart, 9, districtIndex * 10),
        });
      }

      for (let storeOffset = 0; storeOffset < 3; storeOffset++) {
        const customerIndex = districtIndex * 3 + storeOffset;
        const createdAt = timeAt(dayStart, 6, customerIndex * 5);
        const preparedAt = new Date(createdAt.getTime() + 30 * 60_000);
        const bookingId = randomUUID();
        const orderPalletId = randomUUID();
        const lineQuantities = PRODUCTS.map((_, productIndex) => 2 + ((daysAgo * 7 + customerIndex * 3 + productIndex * 4) % 7));
        const bookingStatus = recentStage ? "prep" : "ready";
        const palletStatus = recentStage ? "prepared" : "shipped";

        bookingRows.push({
          id: bookingId,
          customer_id: customerIds[customerIndex],
          created_by: staffRows[districtIndex].agentUserId,
          status: bookingStatus,
          prepared_delivery_date: deliveryDate,
          created_at: createdAt,
        });
        orderPalletRows.push({
          id: orderPalletId,
          order_id: bookingId,
          truck_id: truckIds[districtIndex],
          status: palletStatus,
          created_at: preparedAt,
          updated_at: preparedAt,
        });

        const lines = PRODUCTS.map((product, productIndex) => {
          const quantity = lineQuantities[productIndex];
          const unitPrice = Number(product.price);
          return { product, productIndex, quantity, unitPrice, amount: unitPrice * quantity };
        });
        for (const line of lines) {
          bookingItemRows.push({
            id: randomUUID(),
            booking_id: bookingId,
            product_id: productIds[line.productIndex],
            qty_ordered: line.quantity,
            created_at: createdAt,
          });
          orderPalletItemRows.push({
            id: randomUUID(),
            pallet_id: orderPalletId,
            product_id: productIds[line.productIndex],
            qty_units: line.quantity,
            unit_cost: line.product.price,
            batch_item_id: sourceItemIds[line.productIndex],
            created_at: preparedAt,
            updated_at: preparedAt,
          });
          if (palletStatus === "shipped") stockRemaining[line.productIndex] -= line.quantity;
        }
        orderCount++;

        if (recentStage) continue;

        const invoicedAt = new Date(preparedAt.getTime() + 30 * 60_000);
        const grossAmount = lines.reduce((sum, line) => sum + line.amount, 0);
        const isPaid = isDelivered && (daysAgo + customerIndex) % 5 !== 0;
        const invoiceId = randomUUID();
        const paymentType = customerRows[customerIndex].payment_type;
        const discountAmount = 0;
        const totalAmount = grossAmount - discountAmount;
        const invoiceNumber = `INV-${dateKey}-${String(customerIndex + 1).padStart(2, "0")}`;

        invoiceRows.push({
          id: invoiceId,
          booking_id: bookingId,
          agent_id: staffRows[districtIndex].agentUserId,
          status: isPaid ? "paid" : "issued",
          payment_status: isPaid ? "paid" : "unpaid",
          receipt_number: invoiceNumber,
          customer_name: STORES[customerIndex].name,
          customer_address: `${STORES[customerIndex].address}, ${STORES[customerIndex].city}, Pampanga`,
          customer_payment_type: paymentType,
          discount_rate: "0.0000",
          gross_amount: grossAmount.toFixed(2),
          discount_amount: discountAmount.toFixed(2),
          total_amount: totalAmount.toFixed(2),
          prepared_by: `pampanga-agent-${districtIndex + 1}`,
          created_at: invoicedAt,
          updated_at: invoicedAt,
        });
        for (const line of lines) {
          invoiceItemRows.push({
            id: randomUUID(),
            invoice_id: invoiceId,
            product_id: productIds[line.productIndex],
            product_name: line.product.name,
            product_sku: line.product.sku,
            qty_ordered: line.quantity,
            unit_price: line.unitPrice.toFixed(2),
            amount: line.amount.toFixed(2),
            created_at: invoicedAt,
          });
        }

        const deliveryItemId = randomUUID();
        const deliveredAt = timeAt(dayStart, 11, customerIndex * 5);
        const receiptNumber = `OR-${dateKey}-${String(customerIndex + 1).padStart(2, "0")}`;
        const paymentReference = isPaid && paymentType === "bank_transfer" ? `TR-${dateKey}-${customerIndex + 1}` : null;
        deliveryItemRows.push({
          id: deliveryItemId,
          delivery_id: runIds[districtIndex],
          invoice_id: invoiceId,
          destination_customer_id: customerIds[customerIndex],
          status: isDelivered ? "completed" : "in_transit",
          completed_at: isDelivered ? deliveredAt : null,
          receipt_number: isDelivered ? receiptNumber : null,
          is_paid: isPaid,
          payment_method: isPaid ? paymentType : null,
          payment_reference: paymentReference,
          paid_at: isPaid ? deliveredAt : null,
          created_at: timeAt(dayStart, 8, customerIndex * 5),
          updated_at: isDelivered ? deliveredAt : timeAt(dayStart, 9, customerIndex * 5),
        });

        if (isDelivered) {
          receiptRows.push({
            id: randomUUID(),
            receipt_number: receiptNumber,
            delivery_item_id: deliveryItemId,
            customer_id: customerIds[customerIndex],
            truck_id: truckIds[districtIndex],
            invoice_id: invoiceId,
            confirmed_by: admin.id,
            payment_reference: paymentReference,
            confirmed_at: deliveredAt,
          });
          receiptCount++;

          if (!isPaid) {
            arRows.push({
              id: randomUUID(),
              customer_id: customerIds[customerIndex],
              delivery_item_id: deliveryItemId,
              invoice_id: invoiceId,
              amount_due: totalAmount.toFixed(2),
              status: "outstanding",
              notes: "Delivery confirmed; payment is outstanding.",
              created_at: deliveredAt,
              updated_at: deliveredAt,
            });
            arCount++;
          }

          if (daysAgo >= 7 && daysAgo % 7 === 0 && storeOffset === 0) {
            const returnProductIndex = (daysAgo + districtIndex) % PRODUCTS.length;
            const returnedLine = lines[returnProductIndex];
            const goodCondition = districtIndex % 2 === 0;
            const creditId = randomUUID();
            const returnId = randomUUID();
            const returnCreatedAt = new Date(deliveredAt.getTime() + 2 * HOUR_MS);
            returnRows.push({
              id: returnId,
              invoice_id: invoiceId,
              customer_id: customerIds[customerIndex],
              product_id: productIds[returnProductIndex],
              product_name: returnedLine.product.name,
              qty_returned: 1,
              return_type: goodCondition ? "good" : "damaged",
              reason: goodCondition ? "Customer requested a product exchange." : "Packaging was damaged on arrival.",
              status: "accepted",
              restored_to_pallet_id: goodCondition ? sourcePalletIds[returnProductIndex] : null,
              ar_credit_id: creditId,
              created_by: staffRows[districtIndex].agentUserId,
              reviewed_by: admin.id,
              reviewed_at: returnCreatedAt,
              created_at: returnCreatedAt,
              updated_at: returnCreatedAt,
            });
            arRows.push({
              id: creditId,
              customer_id: customerIds[customerIndex],
              delivery_item_id: null,
              invoice_id: invoiceId,
              amount_due: `-${returnedLine.unitPrice.toFixed(2)}`,
              status: "outstanding",
              notes: `Return credit for 1x ${returnedLine.product.name}.`,
              created_at: returnCreatedAt,
              updated_at: returnCreatedAt,
            });
            if (goodCondition) stockRemaining[returnProductIndex]++;
            returnCount++;
          } else if ((daysAgo === 2 || daysAgo === 3) && storeOffset === 1) {
            const returnProductIndex = (customerIndex + daysAgo) % PRODUCTS.length;
            const returnedLine = lines[returnProductIndex];
            const returnCreatedAt = new Date(deliveredAt.getTime() + 2 * HOUR_MS);
            returnRows.push({
              id: randomUUID(),
              invoice_id: invoiceId,
              customer_id: customerIds[customerIndex],
              product_id: productIds[returnProductIndex],
              product_name: returnedLine.product.name,
              qty_returned: 1,
              return_type: "good",
              reason: "Customer requested a product exchange.",
              status: "pending",
              created_by: staffRows[districtIndex].agentUserId,
              created_at: returnCreatedAt,
              updated_at: returnCreatedAt,
            });
            returnCount++;
          }
        }
      }
    }
  }

  const batchCreatedAt = new Date(today.getTime() - 45 * DAY_MS);
  const agentRows = staffRows.map((staff) => ({
    id: staff.agentId,
    user_id: staff.agentUserId,
    full_name: staff.district.replace(" Pampanga", " District Agent"),
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
  const driverRows = staffRows.map((staff, index) => ({
    id: staff.driverId,
    full_name: staff.district.replace(" Pampanga", " District Driver"),
    license: `PMP-${String(3187 + index * 1231).padStart(4, "0")}`,
    hire_date: isoDate(today),
    employment_type: "full_time",
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
  const truckRows = staffRows.map((staff, index) => ({
    id: truckIds[index],
    license_plate: `PMP ${String(3187 + index * 1231)}`,
    district: staff.district,
    driver_id: staff.driverId,
    status: "available" as const,
    created_at: now,
    updated_at: now,
  }));

  await db.transaction(async (tx) => {
    await tx.delete(agent_returns);
    await tx.delete(accounts_receivable);
    await tx.delete(receipts);
    await tx.delete(delivery_items);
    await tx.delete(deliveries);
    await tx.delete(invoice_items);
    await tx.delete(invoices);
    await tx.delete(order_pallet_items);
    await tx.delete(order_pallets);
    await tx.delete(booking_items);
    await tx.delete(bookings);
    await tx.delete(customer_discounts);
    await tx.delete(pallet_items);
    await tx.delete(batch_pallets);
    await tx.delete(inventory_batches);
    await tx.delete(customers);
    await tx.delete(trucks);
    await tx.delete(drivers);
    await tx.delete(agents);
    await tx.delete(products);

    await tx.insert(agents).values(agentRows);
    await tx.insert(drivers).values(driverRows);
    await tx.insert(trucks).values(truckRows);
    await tx.insert(customers).values(customerRows);
    await tx.insert(products).values(productRows);
    await tx.insert(inventory_batches).values({
      id: inventoryBatchId,
      batch_name: "Pampanga Distribution Stock",
      is_archived: false,
      created_at: batchCreatedAt,
      updated_at: batchCreatedAt,
    });
    await tx.insert(batch_pallets).values(PRODUCTS.map((_, index) => ({
      id: sourcePalletIds[index],
      batch_id: inventoryBatchId,
      pallet_id: `PMP-STOCK-${index + 1}`,
      supplier_name: "Cold storage supplier",
      received_date: isoDate(batchCreatedAt),
      storage_zone: `Freezer ${String.fromCharCode(65 + index)}`,
      placement_location: `A-${index + 1}`,
      created_at: batchCreatedAt,
      updated_at: batchCreatedAt,
    })));
    await tx.insert(pallet_items).values(PRODUCTS.map((_, index) => ({
      id: sourceItemIds[index],
      pallet_id: sourcePalletIds[index],
      product_id: productIds[index],
      qty_units: stockRemaining[index],
      expiration_date: "2027-06-30",
      created_at: batchCreatedAt,
      updated_at: now,
    })));
    await tx.insert(bookings).values(bookingRows);
    await tx.insert(booking_items).values(bookingItemRows);
    await tx.insert(order_pallets).values(orderPalletRows);
    await tx.insert(order_pallet_items).values(orderPalletItemRows);
    await tx.insert(invoices).values(invoiceRows);
    await tx.insert(invoice_items).values(invoiceItemRows);
    await tx.insert(deliveries).values(deliveryRows);
    await tx.insert(delivery_items).values(deliveryItemRows);
    await tx.insert(receipts).values(receiptRows);
    await tx.insert(accounts_receivable).values(arRows);
    await tx.insert(agent_returns).values(returnRows);
  });

  console.log(`Seeded ${customerRows.length} Pampanga stores across ${DISTRICTS.length} districts, ${orderCount} orders, ${receiptCount} receipts, ${arCount} outstanding balances, and ${returnCount} returns.`);
  if (admin.password) console.log(`Initial admin login: admin / ${admin.password}`);
  else console.log("Existing admin account preserved; its password was not changed.");
}

seedPampanga()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Pampanga seed failed:", error);
    process.exit(1);
  });
