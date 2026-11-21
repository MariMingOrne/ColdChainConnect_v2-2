import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import { DrizzleQueryError } from "drizzle-orm";
import { hashPassword, signMfaChallenge } from "../auth";
import { loginIpLimiter, loginLimiter, mfaLimiter } from "../middleware/rate-limit";
import { handleLogin, handleMfaSetup, handleMfaVerify } from "./auth";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateWhere: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    query: { users: { findFirst: mocks.findFirst } },
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
  },
}));

vi.mock("otplib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("otplib")>()),
  verify: mocks.verify,
}));

let passwordHash: string;
const userId = "test-user";
const user = () => ({
  id: userId,
  username: "test-user",
  password_hash: passwordHash,
  role: "admin",
  module_permissions: [],
  is_archived: false,
  mfa_required: true,
  mfa_enabled: false,
  mfa_secret: "test-secret",
});

async function run(handler: RequestHandler, body: unknown) {
  let status = 200;
  let response: any;
  const res = {
    status(code: number) { status = code; return res; },
    json(payload: unknown) { response = payload; return res; },
  } as unknown as Response;
  await handler({ body, ip: "127.0.0.1" } as Request, res, () => undefined);
  return { status, body: response };
}

function databaseError() {
  const cause = Object.assign(new Error("database quota exceeded"), { code: "53300" });
  return new DrizzleQueryError("update users set mfa_secret = $1", ["private-secret"], cause);
}

beforeAll(async () => {
  passwordHash = await hashPassword("correct-password");
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
  mocks.findFirst.mockReset();
  mocks.updateWhere.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockResolvedValue({ valid: true });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  loginLimiter.clear();
  loginIpLimiter.clear();
  mfaLimiter.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sign-in database errors", () => {
  it("reports an account lookup failure without exposing query parameters or counting it as a bad password", async () => {
    mocks.findFirst.mockRejectedValue(databaseError());
    const result = await run(handleLogin, { username: "test-user", password: "correct-password" });

    expect(result).toEqual({ status: 503, body: { error: "Sign-in database error while looking up the account. Please try again later." } });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (account lookup):", { message: "database quota exceeded", code: "53300" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-secret");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await run(handleLogin, { username: "test-user", password: "correct-password" })).status).toBe(503);
    }
    expect(loginLimiter.retryAfter("user:test-user")).toBe(0);
    expect(loginIpLimiter.retryAfter("127.0.0.1")).toBe(0);
  });

  it("explains when the database rejects its connection credentials", async () => {
    const cause = Object.assign(new Error("password authentication failed for database user"), { code: "28P01" });
    mocks.findFirst.mockRejectedValue(new DrizzleQueryError("select ...", ["private-secret"], cause));
    const result = await run(handleLogin, { username: "test-user", password: "correct-password" });
    expect(result).toEqual({
      status: 503,
      body: { error: "Sign-in database error while looking up the account. The database rejected its connection credentials. Contact an administrator." },
    });
    expect(JSON.stringify(result.body)).not.toContain("private-secret");
  });

  it("redacts database URLs from logged errors", async () => {
    mocks.findFirst.mockRejectedValue(new Error("Could not connect to postgresql://dbuser:dbpassword@example.com/database"));
    await run(handleLogin, { username: "test-user", password: "correct-password" });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (account lookup):", {
      message: "Could not connect to [redacted database URL]",
      code: undefined,
    });
  });

  it("distinguishes an MFA setup lookup failure", async () => {
    mocks.findFirst.mockRejectedValue(databaseError());
    const result = await run(handleMfaSetup, { challenge_token: signMfaChallenge(userId) });
    expect(result).toEqual({ status: 503, body: { error: "Sign-in database error while loading MFA setup. Please try again later." } });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (MFA setup account lookup):", expect.anything());
  });

  it("distinguishes a failure saving the MFA setup secret", async () => {
    mocks.findFirst.mockResolvedValue(user());
    mocks.updateWhere.mockRejectedValue(databaseError());
    const result = await run(handleMfaSetup, { challenge_token: signMfaChallenge(userId) });
    expect(result).toEqual({ status: 503, body: { error: "Sign-in database error while saving MFA setup. Please try again later." } });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (MFA setup secret save):", expect.anything());
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-secret");
  });

  it("distinguishes an MFA verification lookup failure", async () => {
    mocks.findFirst.mockRejectedValue(databaseError());
    const result = await run(handleMfaVerify, { challenge_token: signMfaChallenge(userId), code: "123456" });
    expect(result).toEqual({ status: 503, body: { error: "Sign-in database error while loading MFA verification. Please try again later." } });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (MFA verification account lookup):", expect.anything());
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await run(handleMfaVerify, { challenge_token: signMfaChallenge(userId), code: "123456" })).status).toBe(503);
    }
    expect(mfaLimiter.retryAfter(`mfa:${userId}`)).toBe(0);
  });

  it("distinguishes a failure activating MFA", async () => {
    mocks.findFirst.mockResolvedValue(user());
    mocks.updateWhere.mockRejectedValue(databaseError());
    const result = await run(handleMfaVerify, { challenge_token: signMfaChallenge(userId), code: "123456" });
    expect(result).toEqual({ status: 503, body: { error: "Sign-in database error while activating MFA. Please try again later." } });
    expect(console.error).toHaveBeenCalledWith("Sign-in database error (MFA activation):", expect.anything());
  });

  it("preserves successful sign-in and invalid-password behavior", async () => {
    mocks.findFirst.mockResolvedValue({ ...user(), mfa_required: false });
    const success = await run(handleLogin, { username: "test-user", password: "correct-password" });
    expect(success.status).toBe(200);
    expect(success.body).toMatchObject({ token: expect.any(String), user: { id: userId } });
    const invalid = await run(handleLogin, { username: "test-user", password: "wrong-password" });
    expect(invalid).toEqual({ status: 401, body: { error: "Invalid credentials" } });
  });

  it("preserves successful MFA verification", async () => {
    mocks.findFirst.mockResolvedValue(user());
    const result = await run(handleMfaVerify, { challenge_token: signMfaChallenge(userId), code: "123456" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ token: expect.any(String), user: { id: userId } });
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
  });
});
