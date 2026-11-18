import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { existsSync, rmSync } from "fs";
import path from "path";
import { createServer } from "../index";
import { signToken } from "../auth";

let server: Server;
let baseUrl: string;
const created: string[] = [];

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(body: FormData, token?: string) {
  return fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function imageForm(name = "photo.png", bytes: Uint8Array<ArrayBuffer> = PNG_BYTES, type = "image/png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}

const adminToken = () => signToken({ userId: "test-admin", username: "admin", role: "admin" });
const agentToken = () => signToken({ userId: "test-agent", username: "agent", role: "agent" });

beforeAll(async () => {
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  for (const file of created) rmSync(path.join(process.cwd(), "public", "uploads", file), { force: true });
});

describe("POST /api/upload", () => {
  it("rejects requests without a login token", async () => {
    const res = await upload(imageForm());
    expect(res.status).toBe(401);
  });

  it("rejects non-admin roles", async () => {
    const res = await upload(imageForm(), agentToken());
    expect(res.status).toBe(403);
  });

  it("rejects files whose content is not an image, even with an image extension", async () => {
    const res = await upload(imageForm("evil.png", new TextEncoder().encode("<html>hi</html>"), "image/png"), adminToken());
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("stores a real image for admins under a random server-chosen name", async () => {
    const res = await upload(imageForm("../../my photo.png"), adminToken());
    expect(res.status).toBe(200);
    const { filename } = (await res.json()) as { filename: string };
    created.push(filename);
    expect(filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(existsSync(path.join(process.cwd(), "public", "uploads", filename))).toBe(true);
  });
});
