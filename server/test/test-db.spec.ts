import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, seedUsers } from "./test-db";
import { users } from "../db/schema";

describe("in-memory Postgres harness", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates the schema and round-trips one seeded user per role", async () => {
    const seeded = await seedUsers(ctx.db);
    expect(Object.keys(seeded).sort()).toEqual(["admin", "agent", "driver", "staff"]);

    const rows = await ctx.db.select().from(users);
    expect(rows).toHaveLength(4);
    for (const role of ["admin", "staff", "agent", "driver"] as const) {
      expect(seeded[role].role).toBe(role);
      expect(rows.find((r) => r.id === seeded[role].id)?.role).toBe(role);
    }

    const viaQueryApi = await ctx.db.query.users.findFirst();
    expect(viaQueryApi).toBeDefined();
  });
});
