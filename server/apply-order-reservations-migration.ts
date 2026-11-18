import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const migration = await readFile(new URL("../drizzle/0017_order_item_reservations.sql", import.meta.url), "utf8");

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(migration);
  await client.query("COMMIT");
  console.log("Order item reservation migration applied.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
