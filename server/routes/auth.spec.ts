import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createServer } from "../index";
import { signMfaChallenge, signToken, verifyToken } from "../auth";
import { loginLimiter, mfaLimiter } from "../middleware/rate-limit";
import { tokenForRole } from "../test-utils";

let server: Server;
let baseUrl: string;

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  server = createServer().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  loginLimiter.clear();
  mfaLimiter.clear();
});

afterAll(() => server.close());

describe("demo login", () => {
  it("does not hand out admin tokens just because DATABASE_URL is missing", async () => {
    const saved = { url: process.env.DATABASE_URL, demo: process.env.DEMO_MODE };
    delete process.env.DATABASE_URL;
    delete process.env.DEMO_MODE;
    try {
      const res = await post("/api/auth/login", { username: "anyone", password: "anything" });
      expect(res.status).toBe(503);
      expect(await res.json()).not.toHaveProperty("token");
    } finally {
      process.env.DATABASE_URL = saved.url;
      if (saved.demo !== undefined) process.env.DEMO_MODE = saved.demo;
    }
  });
});

describe("brute-force protection", () => {
  it("blocks a username after repeated wrong passwords", async () => {
    const username = `nobody-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const res = await post("/api/auth/login", { username, password: "wrong" });
      expect(res.status).toBe(401);
    }
    const blocked = await post("/api/auth/login", { username, password: "wrong" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("blocks MFA codes for an account after repeated wrong guesses", async () => {
    // Unknown user id: each attempt fails, and the limiter must still count it.
    const challenge = signMfaChallenge("00000000-0000-0000-0000-000000000000");
    for (let i = 0; i < 5; i++) {
      const res = await post("/api/auth/mfa/verify", { challenge_token: challenge, code: "123456" });
      expect(res.status).toBe(401);
    }
    const blocked = await post("/api/auth/mfa/verify", { challenge_token: challenge, code: "123456" });
    expect(blocked.status).toBe(429);
  });
});

describe("token refresh", () => {
  it("issues a new valid token instead of crashing", async () => {
    const token = await tokenForRole("agent");
    if (!token) return;
    const res = await post("/api/auth/refresh", {}, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(verifyToken(body.token)).toMatchObject({ role: "agent", userId: verifyToken(token)!.userId });
  });
});
