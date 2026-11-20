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
        id: randomUUID(),
        store_name: "Puregold Price Club Arayat",
        location: "Arayat, Pampanga",
        district: "Northern Pampanga",
        street_address: "Olongapo-Gapan Road, Brgy. Plazang Luma",
        state: "Pampanga",
        postal_code: "2012",
        contact_person: "Jerome Pangan",
        contact_info: "09171230001",
        agent_id: agentUserIds[0],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Price Club Candaba",
        location: "Candaba, Pampanga",
        district: "Northern Pampanga",
        street_address: "Poblacion, Brgy. Buas",
        state: "Pampanga",
        postal_code: "2013",
        contact_person: "Analyn Santos",
        contact_info: "09171230002",
        agent_id: agentUserIds[0],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Minimart Pandacaqui",
        location: "Mexico, Pampanga",
        district: "Northern Pampanga",
        street_address: "Brgy. Pandacaqui",
        state: "Pampanga",
        postal_code: "2021",
        contact_person: "Eduardo Lacson",
        contact_info: "09171230003",
        agent_id: agentUserIds[0],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Magalang",
        location: "Magalang, Pampanga",
        district: "Northern Pampanga",
        street_address: "Angeles Road",
        state: "Pampanga",
        postal_code: "2011",
        contact_person: "Gina Tuazon",
        contact_info: "09171230004",
        agent_id: agentUserIds[0],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Price Club Angeles",
        location: "Angeles City, Pampanga",
        district: "Central Pampanga",
        street_address: "Miranda St., Brgy. San Nicolas",
        state: "Pampanga",
        postal_code: "2009",
        contact_person: "Joey Manalo",
        contact_info: "09171230005",
        agent_id: agentUserIds[1],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Dau",
        location: "Mabalacat, Pampanga",
        district: "Central Pampanga",
        street_address: "MacArthur Highway, Brgy. Dau",
        state: "Pampanga",
        postal_code: "2010",
        contact_person: "Lourdes Sison",
        contact_info: "09171230006",
        agent_id: agentUserIds[1],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Price Club Mabalacat",
        location: "Mabalacat, Pampanga",
        district: "Central Pampanga",
        street_address: "MacArthur Highway, Brgy. San Francisco",
        state: "Pampanga",
        postal_code: "2010",
        contact_person: "Ricky Hernandez",
        contact_info: "09171230007",
        agent_id: agentUserIds[1],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Extra Floridablanca",
        location: "Floridablanca, Pampanga",
        district: "Central Pampanga",
        street_address: "Brgy. San Antonio",
        state: "Pampanga",
        postal_code: "2006",
        contact_person: "Melanie Gatchalian",
        contact_info: "09171230008",
        agent_id: agentUserIds[1],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "SM City Pampanga",
        location: "San Fernando City, Pampanga",
        district: "Central Pampanga",
        street_address: "Jose Abad Santos Avenue, Brgy. San Jose",
        state: "Pampanga",
        postal_code: "2000",
        contact_person: "Paolo Reyes",
        contact_info: "09171230009",
        agent_id: agentUserIds[1],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "SM City San Fernando Downtown",
        location: "San Fernando City, Pampanga",
        district: "Central Pampanga",
        street_address: "V. Tiomico St., Brgy. Santo Rosario",
        state: "Pampanga",
        postal_code: "2000",
        contact_person: "Carmela Ocampo",
        contact_info: "09171230010",
        agent_id: agentUserIds[1],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Extra Apalit",
        location: "Apalit, Pampanga",
        district: "Southern Pampanga",
        street_address: "MacArthur Highway, Brgy. San Vicente",
        state: "Pampanga",
        postal_code: "2016",
        contact_person: "Ramon Cunanan",
        contact_info: "09171230011",
        agent_id: agentUserIds[2],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Price Club Macabebe",
        location: "Macabebe, Pampanga",
        district: "Southern Pampanga",
        street_address: "Masantol Road",
        state: "Pampanga",
        postal_code: "2014",
        contact_person: "Corazon Dela Cruz",
        contact_info: "09171230012",
        agent_id: agentUserIds[2],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Santa Ana",
        location: "Santa Ana, Pampanga",
        district: "Northern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Dennis Macaraeg",
        contact_info: "09171230013",
        agent_id: agentUserIds[0],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold San Luis",
        location: "San Luis, Pampanga",
        district: "Northern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Marites Bautista",
        contact_info: "09171230014",
        agent_id: agentUserIds[0],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Lubao",
        location: "Lubao, Pampanga",
        district: "Northern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Rolando Pineda",
        contact_info: "09171230015",
        agent_id: agentUserIds[0],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Porac",
        location: "Porac, Pampanga",
        district: "Northern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Nenita Flores",
        contact_info: "09171230016",
        agent_id: agentUserIds[0],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "SM City Clark",
        location: "Mabalacat, Pampanga",
        district: "Central Pampanga",
        street_address: "Clark Freeport Zone",
        state: "Pampanga",
        contact_person: "Angelo Mercado",
        contact_info: "09171230017",
        agent_id: agentUserIds[1],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Bacolor",
        location: "Bacolor, Pampanga",
        district: "Central Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Cynthia Galang",
        contact_info: "09171230018",
        agent_id: agentUserIds[1],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Guagua",
        location: "Guagua, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Edwin Dizon",
        contact_info: "09171230019",
        agent_id: agentUserIds[2],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Masantol",
        location: "Masantol, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Josefina Tolentino",
        contact_info: "09171230020",
        agent_id: agentUserIds[2],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Minalin",
        location: "Minalin, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Arnel Valdez",
        contact_info: "09171230021",
        agent_id: agentUserIds[2],
        payment_type: "bank_transfer",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Sasmuan",
        location: "Sasmuan, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Luz Panganiban",
        contact_info: "09171230022",
        agent_id: agentUserIds[2],
        payment_type: "cash",
      },
      {
        id: randomUUID(),
        store_name: "Puregold Sexmoan",
        location: "Sexmoan, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Benjamin Castro",
        contact_info: "09171230023",
        agent_id: agentUserIds[2],
        payment_type: "cod",
      },
      {
        id: randomUUID(),
        store_name: "Puregold San Simon",
        location: "San Simon, Pampanga",
        district: "Southern Pampanga",
        street_address: "Brgy. Poblacion",
        state: "Pampanga",
        contact_person: "Rowena Soriano",
        contact_info: "09171230024",
        agent_id: agentUserIds[2],
        payment_type: "bank_transfer",
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
