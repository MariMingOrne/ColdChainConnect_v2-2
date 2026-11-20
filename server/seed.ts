import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "./db";
import {
  users,
  customers,
  products,
  drivers,
  trucks,
  agents,
} from "./db/schema";
import { hashPassword } from "./auth";
import { seedProducts } from "./seed-products";

async function seed() {
  console.log("🌱 Starting seed...");

  try {
    console.log("📝 Creating admin user...");
    const adminUserId = randomUUID();
    const adminPassword = await hashPassword("admin123");

    await db.insert(users).values({
      id: adminUserId,
      username: "admin",
      password_hash: adminPassword,
      role: "admin",
    }).onConflictDoNothing();

    console.log("📝 Creating agent and driver users...");
    const agentUserIds = [randomUUID(), randomUUID(), randomUUID()];
    const driverUserIds = [randomUUID(), randomUUID(), randomUUID()];

    const staffLogins = [
      ...agentUserIds.map((id, index) => ({ id, username: `agent${index + 1}`, role: "agent" as const })),
      ...driverUserIds.map((id, index) => ({ id, username: `driver${index + 1}`, role: "driver" as const })),
    ];
    await db.insert(users).values(
      await Promise.all(
        staffLogins.map(async ({ id, username, role }) => ({
          id,
          username,
          password_hash: await hashPassword(username),
          role,
        })),
      ),
    ).onConflictDoNothing();

    console.log("📝 Creating products...");
    const productRows = seedProducts.map((product) => ({
      ...product,
      id: randomUUID(),
      batch_tracking_enabled: true,
    }));
    await db.insert(products).values(productRows).onConflictDoNothing();

    console.log("📝 Creating agent profiles...");
    const agentProfileIds = [randomUUID(), randomUUID(), randomUUID()];

    await db.insert(agents).values([
      {
        id: agentProfileIds[0],
        user_id: agentUserIds[0],
        full_name: "Dane Andrea Bautista",
        email: "dane.bautista@coldchain.com",
        contact_info: "09171230101",
        hire_date: "2022-01-15",
        address: "Brgy. Poblacion, Arayat, Pampanga",
        is_active: true,
      },
      {
        id: agentProfileIds[1],
        user_id: agentUserIds[1],
        full_name: "Meiji Zhao",
        email: "meiji.zhao@coldchain.com",
        contact_info: "09171230102",
        hire_date: "2022-03-10",
        address: "Brgy. Poblacion, San Fernando, Pampanga",
        is_active: true,
      },
      {
        id: agentProfileIds[2],
        user_id: agentUserIds[2],
        full_name: "Ryah Carino",
        email: "ryah.carino@coldchain.com",
        contact_info: "09171230103",
        hire_date: "2023-06-01",
        address: "Brgy. Poblacion, Apalit, Pampanga",
        is_active: true,
      },
    ]).onConflictDoNothing();

    console.log("📝 Creating customers...");
    await db.insert(customers).values([
      {
        id: randomUUID(), store_name: "Puregold Bulaon", location: "San Fernando, Pampanga",
        district: "Central Pampanga", street_address: "Bulaon", state: "Pampanga",
        latitude: 15.08421, longitude: 120.66779, contact_person: "Ana Reyes", contact_info: "555-0101", agent_id: agentUserIds[0], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "Puregold Mexico", location: "Mexico, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.06483, longitude: 120.72146, contact_person: "Carlo Santos", contact_info: "555-0102", agent_id: agentUserIds[0], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "Puregold Porac", location: "Porac, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.07143, longitude: 120.5426, contact_person: "Liza Mendoza", contact_info: "555-0103", agent_id: agentUserIds[1], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "Puregold Extra Floridablanca", location: "Floridablanca, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 14.9722, longitude: 120.52757, contact_person: "Marco Dizon", contact_info: "555-0104", agent_id: agentUserIds[1], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "SM City Pampanga", location: "San Fernando, Pampanga",
        district: "Central Pampanga", street_address: "Jose Abad Santos Avenue", state: "Pampanga",
        latitude: 15.0526, longitude: 120.6993, contact_person: "Mia Garcia", contact_info: "555-0105", agent_id: agentUserIds[0], payment_type: "bank_transfer",
      },
      {
        id: randomUUID(), store_name: "SM City Clark", location: "Angeles City, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.16727, longitude: 120.58013, contact_person: "Paolo Cruz", contact_info: "555-0106", agent_id: agentUserIds[1], payment_type: "bank_transfer",
      },
      {
        id: randomUUID(), store_name: "Jumbo Jenra Supermarket", location: "Angeles City, Pampanga",
        district: "Central Pampanga", street_address: "509 Jesus Street", state: "Pampanga",
        latitude: 15.14032, longitude: 120.58824, contact_person: "Janelle Flores", contact_info: "555-0107", agent_id: agentUserIds[2], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "Easy Maxx Supermarket", location: "Angeles City, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.14004, longitude: 120.58747, contact_person: "Joshua Ramos", contact_info: "555-0108", agent_id: agentUserIds[2], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "A Line Supermarket", location: "Angeles City, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.1605, longitude: 120.59198, contact_person: "Sofia Navarro", contact_info: "555-0109", agent_id: agentUserIds[2], payment_type: "cash",
      },
      {
        id: randomUUID(), store_name: "Ves Mart Supermarket", location: "San Fernando, Pampanga",
        district: "Central Pampanga", state: "Pampanga",
        latitude: 15.07782, longitude: 120.6412, contact_person: "Gabriel Bautista", contact_info: "555-0110", agent_id: agentUserIds[2], payment_type: "cash",
      },
    ]).onConflictDoNothing();

    console.log("📝 Creating drivers...");
    const driverProfileIds = [randomUUID(), randomUUID(), randomUUID()];

    await db.insert(drivers).values([
      {
        id: driverProfileIds[0],
        user_id: driverUserIds[0],
        full_name: "Miza Bautista",
        contact_info: "09181230201",
        license: "N01-23-201201",
        hire_date: "2021-05-10",
        employment_type: "full_time",
        is_active: true,
      },
      {
        id: driverProfileIds[1],
        user_id: driverUserIds[1],
        full_name: "Mari Ming Ornette",
        contact_info: "09181230202",
        license: "N01-23-202202",
        hire_date: "2021-08-20",
        employment_type: "full_time",
        is_active: true,
      },
      {
        id: driverProfileIds[2],
        user_id: driverUserIds[2],
        full_name: "Seighart Mundt",
        contact_info: "09181230203",
        license: "N01-23-203203",
        hire_date: "2022-02-14",
        employment_type: "part_time",
        is_active: true,
      },
    ]).onConflictDoNothing();

    console.log("📝 Creating trucks...");
    await db.insert(trucks).values([
      {
        id: randomUUID(),
        license_plate: "PAM 4821",
        district: "Northern Pampanga",
        driver_id: driverProfileIds[0],
        status: "available",
      },
      {
        id: randomUUID(),
        license_plate: "PAM 7315",
        district: "Central Pampanga",
        driver_id: driverProfileIds[1],
        status: "available",
      },
      {
        id: randomUUID(),
        license_plate: "PAM 3186",
        district: "Southern Pampanga",
        driver_id: driverProfileIds[2],
        status: "available",
      },
    ]).onConflictDoNothing();

    console.log("✅ Seed completed successfully!");
    console.log("\n📋 Created data:");
    console.log("   ✓ Admin user (admin/admin123)");
    console.log("   ✓ 3 Agents (agent1-3, password matches username)");
    console.log("   ✓ 3 Drivers (driver1-3, password matches username)");
    console.log(`   ✓ ${seedProducts.length} Products (current Frabelle catalog)`);
    console.log("   ✓ 24 Pampanga customers (Puregold, SM)");
    console.log("   ✓ 3 Trucks (Northern, Central, Southern Pampanga)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
