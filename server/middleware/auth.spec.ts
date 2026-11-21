// Read-only: a token must stop working when its account is gone or its role changed.
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { eq } from "drizzle-orm";
import { createServer } from "../index";
import { signToken } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";
import type { AuthRequest } from "./auth";

it("preserves Express request, response, and middleware types", () => {
  expectTypeOf<AuthRequest>().toExtend<Request>();
  expectTypeOf<AuthRequest>().toHaveProperty("body");
  expectTypeOf<AuthRequest>().toHaveProperty("params");
  expectTypeOf<AuthRequest>().toHaveProperty("query");
  expectTypeOf<AuthRequest>().toHaveProperty("headers");
  expectTypeOf<AuthRequest>().toHaveProperty("method");
  expectTypeOf<AuthRequest>().toHaveProperty("path");
  expectTypeOf<AuthRequest>().toHaveProperty("baseUrl");
  expectTypeOf<Response>().toHaveProperty("status").toBeFunction();
  expectTypeOf<Response>().toHaveProperty("json").toBeFunction();
  expectTypeOf<Response>().toHaveProperty("setHeader").toBeFunction();
  expectTypeOf<NextFunction>().toBeFunction();
  expectTypeOf<RequestHandler>().toBeFunction();
});

const hasDb = Boolean(process.env.DATABASE_URL);
let server: Server;
let baseUrl: string;

// Any authenticated read works as the probe; trucks has no columns that need a pending migration.
const getProbe = (token: string) => fetch(`${baseUrl}/api/trucks`, { headers: { Authorization: `Bearer ${token}` } });

beforeAll(async () => {
  if (!hasDb) return;
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe.skipIf(!hasDb)("authMiddleware account check", () => {
  it("rejects a valid-looking token for an account that does not exist", async () => {
    const token = signToken({ userId: "00000000-0000-0000-0000-000000000000", username: "ghost", role: "admin" });
    expect((await getProbe(token)).status).toBe(401);
  });

  it("rejects a token whose role no longer matches the account", async () => {
    const [agent] = await db.select().from(users).where(eq(users.role, "agent")).limit(1);
    if (!agent) return;
    const forged = signToken({ userId: agent.id, username: agent.username, role: "admin" });
    expect((await getProbe(forged)).status).toBe(401);
  });

  it("accepts a token that matches its account", async () => {
    const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    if (!admin) return;
    const token = signToken({ userId: admin.id, username: admin.username, role: "admin" });
    expect((await getProbe(token)).status).toBe(200);
  });
});

describe("driver path allow-list behind the /api mount", () => {
  it("lets a driver reach their schedule when the guard is mounted at /api", async () => {
    const { authMiddleware } = await import("./auth");
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL; // isolate the path rule from the account lookup
    try {
      const token = signToken({ userId: "driver-1", username: "driver", role: "driver" });
      const run = (originalUrl: string) =>
        new Promise<number>((resolve) => {
          const req = { headers: { authorization: `Bearer ${token}` }, baseUrl: "/api", path: originalUrl.replace(/^\/api/, ""), originalUrl } as any;
          const res = { status: (code: number) => ({ json: () => resolve(code) }) } as any;
          void authMiddleware(req, res, () => resolve(200));
        });
      expect(await run("/api/driver-schedule")).toBe(200);
      expect(await run("/api/customers")).toBe(403);
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
