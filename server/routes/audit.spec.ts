// Read-only: audit log filters must narrow results, not empty them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createServer } from "../index";
import { tokenForRole } from "../test-utils";

const hasDb = Boolean(process.env.DATABASE_URL);
let server: Server;
let baseUrl: string;
let token = "";

const get = async (query: string) => {
  const res = await fetch(`${baseUrl}/api/audit-logs?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as Array<{ action: string; user_id: string }>;
};

beforeAll(async () => {
  if (!hasDb) return;
  token = (await tokenForRole("admin")) ?? "";
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe.skipIf(!hasDb)("GET /api/audit-logs filters", () => {
  it("filters by action", async () => {
    const [sample] = await get("limit=1");
    if (!sample) return; // empty log: nothing to filter
    const rows = await get(`action=${encodeURIComponent(sample.action)}&limit=50`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.action === sample.action)).toBe(true);
  });

  it("filters by user", async () => {
    const [sample] = await get("limit=1");
    if (!sample) return;
    const rows = await get(`user_id=${encodeURIComponent(sample.user_id)}&limit=50`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.user_id === sample.user_id)).toBe(true);
  });
});
