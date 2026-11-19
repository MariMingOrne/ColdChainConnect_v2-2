// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agents, drivers, users } from "../db/schema";
import type { AuthRequest } from "../middleware/auth";
import { seedUsers } from "../test/test-db";
import { setAgentArchived } from "./agents";
import { setDriverArchived } from "./drivers";

vi.mock("../db", async () => {
  const { createTestDb } = await import("../test/test-db");
  return { db: (await createTestDb()).db };
});

let seeded: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  seeded = await seedUsers(db as never);
  await db.insert(agents).values({ id: "agent-profile", user_id: seeded.agent.id, full_name: "Alice Agent" });
  await db.insert(drivers).values([
    { id: "driver-profile", user_id: seeded.driver.id, full_name: "Dave Driver" },
    { id: "driver-no-login", full_name: "Standalone Driver" },
  ]);
});

afterAll(() => vi.unstubAllEnvs());

async function run(handler: RequestHandler, id: string, is_archived: unknown) {
  let status = 200;
  let body: unknown;
  const res = {
    status(code: number) { status = code; return res; },
    json(payload: unknown) { body = payload; return res; },
  } as unknown as Response;
  const req = { user: { userId: seeded.admin.id, username: "test_admin", role: "admin" }, params: { id }, body } as unknown as AuthRequest;
  (req as unknown as { body: unknown }).body = { is_archived };
  await handler(req, res, () => undefined);
  return { status, body };
}

describe("employee archive endpoints", () => {
  it("archives and restores agent profiles together with their login", async () => {
    const archived = await run(setAgentArchived, "agent-profile", true);
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: "agent-profile", is_archived: true });
    expect(await db.query.users.findFirst({ where: eq(users.id, seeded.agent.id) })).toMatchObject({ is_archived: true });

    await run(setAgentArchived, "agent-profile", false);
    expect(await db.query.agents.findFirst({ where: eq(agents.id, "agent-profile") })).toMatchObject({ is_archived: false });
    expect(await db.query.users.findFirst({ where: eq(users.id, seeded.agent.id) })).toMatchObject({ is_archived: false });
  });

  it("archives drivers with and without linked logins", async () => {
    expect((await run(setDriverArchived, "driver-profile", true)).status).toBe(200);
    expect(await db.query.users.findFirst({ where: eq(users.id, seeded.driver.id) })).toMatchObject({ is_archived: true });

    expect((await run(setDriverArchived, "driver-no-login", true)).status).toBe(200);
    expect(await db.query.drivers.findFirst({ where: eq(drivers.id, "driver-no-login") })).toMatchObject({ is_archived: true });
  });

  it("validates archive status and record IDs", async () => {
    expect((await run(setAgentArchived, "agent-profile", "true")).status).toBe(400);
    expect((await run(setDriverArchived, "missing", true)).status).toBe(404);
  });
});
