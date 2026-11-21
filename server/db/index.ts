import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

export const db = drizzle(pool, { schema });

// Lets the test setup know a real pool exists to close (see server/test-setup.ts).
(globalThis as { __coldchainPoolOpen?: boolean }).__coldchainPoolOpen = true;

/** Close the connection pool (tests, graceful shutdown). */
export const closeDb = () => pool.end();
