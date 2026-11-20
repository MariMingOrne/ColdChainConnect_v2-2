import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "./db";
import {
  users,
  customers,
  products,
  agents,
} from "./db/schema";
import { hashPassword } from "./auth";
import { seedProducts } from "./seed-products";

async function seed() {
  console.log("🌱 Starting seed...");

  try {
    // Create admin user
    console.log("📝 Creating admin user...");
    const adminUserId = randomUUID();
    const adminPassword = await hashPassword("admin123");

    await db.insert(users).values({
      id: adminUserId,
      username: "admin",
      password_hash: adminPassword,
      role: "admin",
    }).onConflictDoNothing();

    // Create agent users (account-linked staff)
    console.log("📝 Creating agent users...");
    const agent1UserId = randomUUID();
    const agent2UserId = randomUUID();
    const agent3UserId = randomUUID();

    const agentPassword = await hashPassword("agent123");

    await db.insert(users).values([
      {
        id: agent1UserId,
        username: "agent1",
        password_hash: agentPassword,
        role: "agent",
      },
      {
        id: agent2UserId,
        username: "agent2",
        password_hash: agentPassword,
        role: "agent",
      },
      {
        id: agent3UserId,
        username: "agent3",
        password_hash: agentPassword,
        role: "agent",
      },
    ]).onConflictDoNothing();

    // Create products
    console.log("📝 Creating products...");
    const productRows = seedProducts.map((product) => ({
      ...product,
      id: randomUUID(),
      batch_tracking_enabled: true,
    }));
    await db.insert(products).values(productRows).onConflictDoNothing();

    // Create agent profiles
    console.log("📝 Creating agent profiles...");
    const agentProfile1 = randomUUID();
    const agentProfile2 = randomUUID();
    const agentProfile3 = randomUUID();

    await db.insert(agents).values([
      {
        id: agentProfile1,
        user_id: agent1UserId,
        full_name: "Maria Santos",
        email: "maria.santos@coldchain.com",
        contact_info: "09171234567",
        hire_date: "2022-01-15",
        address: "123 Main St, Makati",
        is_active: true,
      },
      {
        id: agentProfile2,
        user_id: agent2UserId,
        full_name: "Juan Dela Cruz",
        email: "juan.delacruz@coldchain.com",
        contact_info: "09172345678",
        hire_date: "2022-03-10",
        address: "456 BGC Ave, Taguig",
        is_active: true,
      },
      {
        id: agentProfile3,
        user_id: agent3UserId,
        full_name: "Ana Reyes",
        email: "ana.reyes@coldchain.com",
        contact_info: "09173456789",
        hire_date: "2023-06-01",
        address: "789 Tagaytay Rd, Cavite",
        is_active: true,
      },
    ]).onConflictDoNothing();

    // Create customers (linked to agent users)
    console.log("📝 Creating customers...");
    const customer1 = randomUUID();
    const customer2 = randomUUID();
    const customer3 = randomUUID();
    const customer4 = randomUUID();
    const customer5 = randomUUID();
    const customer6 = randomUUID();
    const customer7 = randomUUID();
    const customer8 = randomUUID();

    await db.insert(customers).values([
      {
        id: customer1,
        store_name: "Palengke Fresh Meats - Makati",
        location: "Makati City",
        district: "District A",
        street_number: "123",
        street_address: "Kalayaan Ave, Poblacion",
        state: "Metro Manila",
        postal_code: "1210",
        contact_person: "Rosa Dimaculangan",
        contact_info: "09171234501",
        agent_id: agent1UserId,
        payment_type: "cash",

      },
      {
        id: customer2,
        store_name: "Bonifacio Fresh Market - BGC",
        location: "Taguig City",
        district: "District A",
        street_number: "7",
        street_address: "5th Ave, Bonifacio Global City",
        state: "Metro Manila",
        postal_code: "1634",
        contact_person: "Mark Anthony Cruz",
        contact_info: "09171234502",
        agent_id: agent2UserId,
        payment_type: "bank_transfer",

      },
      {
        id: customer3,
        store_name: "Tagaytay Highlands Grocery - Tagaytay",
        location: "Tagaytay City",
        district: "District C",
        street_number: "45",
        street_address: "Aguinaldo Hwy, Brgy. Sungay",
        state: "Cavite",
        postal_code: "4120",
        contact_person: "Lorna Villanueva",
        contact_info: "09171234503",
        agent_id: agent3UserId,
        payment_type: "cod",

      },
      {
        id: customer4,
        store_name: "Sta. Cruz Sari-Sari Mart - Quiapo",
        location: "Manila City",
        district: "District A",
        street_number: "210",
        street_address: "Quezon Blvd, Quiapo",
        state: "Metro Manila",
        postal_code: "1001",
        contact_person: "Ernesto Bautista",
        contact_info: "09171234504",
        agent_id: agent1UserId,
        payment_type: "cash",

      },
      {
        id: customer5,
        store_name: "Ortigas Center Supermarket - Pasig",
        location: "Pasig City",
        district: "District A",
        street_number: "18",
        street_address: "ADB Ave, Ortigas Center",
        state: "Metro Manila",
        postal_code: "1605",
        contact_person: "Jasmine Lim",
        contact_info: "09171234505",
        agent_id: agent2UserId,
        payment_type: "bank_transfer",

      },
      {
        id: customer6,
        store_name: "Cebu Lechon House Grocers - Cebu",
        location: "Cebu City",
        street_number: "88",
        street_address: "Osmeña Blvd, Capitol Site",
        state: "Cebu",
        postal_code: "6000",
        contact_person: "Ramon Gonzales",
        contact_info: "09171234506",
        agent_id: agent3UserId,
        payment_type: "cod",

      },
      {
        id: customer7,
        store_name: "Davao Fresh Catch Store - Davao",
        location: "Davao City",
        street_number: "32",
        street_address: "J.P. Laurel Ave, Bajada",
        state: "Davao del Sur",
        postal_code: "8000",
        contact_person: "Cherry Ann Macaraeg",
        contact_info: "09171234507",
        agent_id: agent1UserId,
        payment_type: "bank_transfer",

      },
      {
        id: customer8,
        store_name: "Baguio Strawberry Farm Market - Baguio",
        location: "Baguio City",
        street_number: "12",
        street_address: "Session Rd",
        state: "Benguet",
        postal_code: "2600",
        contact_person: "Edgar Dulay",
        contact_info: "09171234508",
        agent_id: agent2UserId,
        payment_type: "cash",

      },
    ]).onConflictDoNothing();

    console.log("✅ Seed completed successfully!");
    console.log("\n📋 Created data:");
    console.log("   ✓ Admin user (admin/admin123)");
    console.log("   ✓ 3 Agent users (agent1-3/agent123) with profiles");
    console.log(`   ✓ ${seedProducts.length} Products (current Frabelle catalog)`);
    console.log("   ✓ 8 Customers");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
