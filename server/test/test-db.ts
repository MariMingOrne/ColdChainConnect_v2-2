// In-memory Postgres (PGlite) harness for server specs. The shared Neon database is never touched.
// Specs swap it in with: vi.mock("../db", async () => ({ db: (await createTestDb()).db, ... })).
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../db/schema";
import { users } from "../db/schema";

export type TestDb = PgliteDatabase<typeof schema>;

export interface TestDbHandle {
  db: TestDb;
  close(): Promise<void>;
}

/** A fresh in-memory database with every table in server/db/schema.ts created. */
export async function createTestDb(): Promise<TestDbHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Diff an empty schema against the real one and run the resulting DDL. (pushSchema does the same
  // but prints a progress spinner to stdout, which would pollute test output.)
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const statement of statements) await client.exec(statement);
  return { db, close: () => client.close() };
}

type Role = "admin" | "staff" | "agent" | "driver";
type UserRow = typeof users.$inferSelect;

/** Inserts one user per role and returns the rows keyed by role. */
export async function seedUsers(db: TestDb): Promise<Record<Role, UserRow>> {
  const roles: Role[] = ["admin", "staff", "agent", "driver"];
  const rows = await db
    .insert(users)
    .values(
      roles.map((role) => ({
        id: `test-${role}`,
        username: `test_${role}`,
        password_hash: "not-a-real-hash",
        role,
        mfa_required: false,
      })),
    )
    .returning();
  const byRole = Object.fromEntries(rows.map((r) => [r.role, r])) as Record<Role, UserRow>;
  return byRole;
}
