import { randomUUID } from "crypto";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db, closeDb } from "./db";
import { customers } from "./db/schema";

const customerData = [
  ["Puregold Bulaon", "San Fernando, Pampanga", "Central Pampanga", 15.08421, 120.66779, "Ana Reyes", "0917 000 0001", "Bulaon", "cash"],
  ["Puregold Mexico", "Mexico, Pampanga", "Central Pampanga", 15.06483, 120.72146, "Carlo Santos", "0917 000 0002", null, "cash"],
  ["SM City Pampanga", "San Fernando, Pampanga", "Central Pampanga", 15.0526, 120.6993, "Mia Garcia", "0917 000 0005", "Jose Abad Santos Avenue", "bank_transfer"],
  ["Jumbo Jenra Supermarket", "Angeles City, Pampanga", "Central Pampanga", 15.14032, 120.58824, "Janelle Flores", "0917 000 0007", "509 Jesus Street", "cash"],
  ["Easy Maxx Supermarket", "Angeles City, Pampanga", "Central Pampanga", 15.14004, 120.58747, "Joshua Ramos", "0917 000 0008", null, "cash"],
  ["A Line Supermarket", "Angeles City, Pampanga", "Central Pampanga", 15.1605, 120.59198, "Sofia Navarro", "0917 000 0009", null, "cash"],
  ["Ves Mart Supermarket", "San Fernando, Pampanga", "Central Pampanga", 15.07782, 120.6412, "Gabriel Bautista", "0917 000 0010", null, "cash"],
  ["San Fernando Community Mart", "San Fernando, Pampanga", "Central Pampanga", 15.0301, 120.6844, "Rina Valdez", "0917 000 0011", null, "cash"],
  ["SM City Clark", "Angeles City, Pampanga", "Northern Pampanga", 15.16727, 120.58013, "Paolo Cruz", "0917 000 0006", null, "bank_transfer"],
  ["Apalit Family Grocery", "Apalit, Pampanga", "Northern Pampanga", 14.9537, 120.7585, "Noel Santiago", "0917 000 0012", null, "cash"],
  ["Mabalacat Town Market Store", "Mabalacat City, Pampanga", "Northern Pampanga", 15.2231, 120.5742, "Celia Aquino", "0917 000 0013", null, "cash"],
  ["Magalang Corner Grocery", "Magalang, Pampanga", "Northern Pampanga", 15.2155, 120.6606, "Edgar David", "0917 000 0014", null, "cash"],
  ["Candaba Freshmart", "Candaba, Pampanga", "Northern Pampanga", 15.0956, 120.8267, "Mylene Torres", "0917 000 0015", null, "cash"],
  ["San Luis Neighborhood Store", "San Luis, Pampanga", "Northern Pampanga", 15.0405, 120.7895, "Rodel Flores", "0917 000 0016", null, "cash"],
  ["Sto. Tomas General Store", "Sto. Tomas, Pampanga", "Northern Pampanga", 14.9998, 120.7118, "Lorna Mercado", "0917 000 0017", null, "cash"],
  ["Macabebe Bayan Grocery", "Macabebe, Pampanga", "Northern Pampanga", 14.9085, 120.7152, "Jun Reyes", "0917 000 0018", null, "cash"],
  ["Puregold Porac", "Porac, Pampanga", "Southern Pampanga", 15.07143, 120.5426, "Liza Mendoza", "0917 000 0003", null, "cash"],
  ["Puregold Extra Floridablanca", "Floridablanca, Pampanga", "Southern Pampanga", 14.9722, 120.52757, "Marco Dizon", "0917 000 0004", null, "cash"],
  ["Guagua Market Grocery", "Guagua, Pampanga", "Southern Pampanga", 14.9656, 120.6321, "Aileen Cruz", "0917 000 0019", null, "cash"],
  ["Lubao Community Store", "Lubao, Pampanga", "Southern Pampanga", 14.9261, 120.6003, "Dante Garcia", "0917 000 0020", null, "cash"],
  ["Sasmuan Corner Mart", "Sasmuan, Pampanga", "Southern Pampanga", 14.8804, 120.6252, "Nina Ramos", "0917 000 0021", null, "cash"],
  ["Bacolor Town Grocery", "Bacolor, Pampanga", "Southern Pampanga", 15.0008, 120.6528, "Oscar Mendoza", "0917 000 0022", null, "cash"],
  ["Masantol Riverside Store", "Masantol, Pampanga", "Southern Pampanga", 14.8967, 120.7107, "Grace Bautista", "0917 000 0023", null, "cash"],
  ["Minalin Family Mart", "Minalin, Pampanga", "Southern Pampanga", 14.9676, 120.6828, "Victor Navarro", "0917 000 0024", null, "cash"],
] as const;

async function reseedCustomers() {
  try {
    await db.transaction(async (tx) => {
      const pampangaFilter = or(eq(customers.state, "Pampanga"), ilike(customers.location, "%Pampanga%"));
      const linked = await tx.execute(sql`
        SELECT
          (SELECT count(*) FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE c.state = 'Pampanga' OR c.location ILIKE '%Pampanga%') +
          (SELECT count(*) FROM delivery_items d JOIN customers c ON c.id = d.destination_customer_id WHERE c.state = 'Pampanga' OR c.location ILIKE '%Pampanga%') +
          (SELECT count(*) FROM receipts r JOIN customers c ON c.id = r.customer_id WHERE c.state = 'Pampanga' OR c.location ILIKE '%Pampanga%') +
          (SELECT count(*) FROM accounts_receivable a JOIN customers c ON c.id = a.customer_id WHERE c.state = 'Pampanga' OR c.location ILIKE '%Pampanga%') +
          (SELECT count(*) FROM agent_returns x JOIN customers c ON c.id = x.customer_id WHERE c.state = 'Pampanga' OR c.location ILIKE '%Pampanga%') AS total
      `);
      if (Number(linked.rows[0]?.total ?? 0) !== 0) {
        throw new Error("Pampanga customers have linked transactions; no customer data was changed.");
      }

      await tx.delete(customers).where(pampangaFilter);
      await tx.insert(customers).values(customerData.map(([store_name, location, district, latitude, longitude, contact_person, contact_info, street_address, payment_type]) => ({
        id: randomUUID(),
        store_name,
        location,
        district,
        latitude,
        longitude,
        contact_person,
        contact_info,
        street_address,
        state: "Pampanga",
        payment_type,
      })));
    });
    console.log("Replaced Pampanga customers with 24 records: 8 per district.");
  } finally {
    await closeDb();
  }
}

void reseedCustomers();
