import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { can, type Action } from "../../shared/permissions";
import { requirePermission, staffModuleGuard } from "./permissions";
import type { AuthRequest } from "./auth";

function run(handler: (req: Request, res: Response, next: () => void) => unknown, req: Partial<AuthRequest>) {
  const next = vi.fn();
  const status = vi.fn();
  const res = { status: status.mockReturnValue({ json: vi.fn() }) } as unknown as Response;
  handler(req as Request, res, next);
  return { next, status: status.mock.calls[0]?.[0] as number | undefined };
}

const staff = (path: string, modulePermissions: string[]): Partial<AuthRequest> => ({
  path,
  user: { userId: "u", username: "s", role: "staff" },
  modulePermissions,
});

describe("staffModuleGuard", () => {
  it("lets staff with order-fulfillment reach /bookings", () => {
    expect(run(staffModuleGuard, staff("/bookings", ["order-fulfillment"])).next).toHaveBeenCalled();
    expect(run(staffModuleGuard, staff("/bookings/abc/approve", ["order-fulfillment"])).next).toHaveBeenCalled();
  });

  it("denies staff without order-fulfillment on /bookings", () => {
    const result = run(staffModuleGuard, staff("/bookings", ["dashboard"]));
    expect(result.status).toBe(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("denies staff on an unmapped /api path", () => {
    expect(run(staffModuleGuard, staff("/something-new", ["order-fulfillment", "dashboard"])).status).toBe(403);
  });

  it("always lets admin through", () => {
    const admin: Partial<AuthRequest> = { path: "/anything", user: { userId: "u", username: "a", role: "admin" } };
    expect(run(staffModuleGuard, admin).next).toHaveBeenCalled();
  });
});

/** Mutations the server guards with requireRole("admin"); the client hides them with useCan. */
const ADMIN_ONLY_MUTATIONS: Action[] = [
  "invoice:update", "receivable:update", "delivery:update", "agentReturn:decide",
  "customer:manage", "product:manage", "batch:manage", "driver:manage", "agent:manage", "truck:manage",
];

describe("can", () => {
  const actions: Action[] = [
    "booking:approve", "invoice:markPaid", "payment:verify", "expense:submit",
    "expense:approve", "expense:pay", "return:decide", "delivery:confirm",
    ...ADMIN_ONLY_MUTATIONS,
  ];

  it("allows admin everything", () => {
    for (const action of actions) expect(can({ role: "admin" }, action)).toBe(true);
  });

  it("denies agent invoice:markPaid", () => {
    expect(can({ role: "agent" }, "invoice:markPaid")).toBe(false);
  });

  it("gates accounting actions on the accounting module for staff", () => {
    for (const action of ["payment:verify", "expense:submit", "expense:pay", "invoice:markPaid", "return:decide"] as Action[]) {
      expect(can({ role: "staff", module_permissions: ["accounting"] }, action)).toBe(true);
      expect(can({ role: "staff", module_permissions: ["order-fulfillment"] }, action)).toBe(false);
    }
  });

  it("keeps expense:approve and booking:approve admin only", () => {
    const accountant = { role: "staff" as const, module_permissions: ["accounting"] };
    expect(can(accountant, "expense:approve")).toBe(false);
    expect(can(accountant, "booking:approve")).toBe(false);
  });

  it("keeps the admin-only server mutations closed to every other role and module", () => {
    const everything = ["accounting", "order-fulfillment", "delivery-operations", "product-customer", "manage-accounts"];
    for (const action of ADMIN_ONLY_MUTATIONS) {
      expect(can({ role: "staff", module_permissions: everything }, action), action).toBe(false);
      expect(can({ role: "agent" }, action), action).toBe(false);
      expect(can({ role: "driver" }, action), action).toBe(false);
    }
  });

  it("lets admin, agent and driver confirm deliveries but not staff", () => {
    expect(can({ role: "agent" }, "delivery:confirm")).toBe(true);
    expect(can({ role: "driver" }, "delivery:confirm")).toBe(true);
    expect(can({ role: "staff", module_permissions: ["accounting", "delivery-operations"] }, "delivery:confirm")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns 401 without a user, 403 when denied, and continues when allowed", () => {
    expect(run(requirePermission("expense:approve"), {}).status).toBe(401);
    expect(run(requirePermission("expense:approve"), staff("/x", ["accounting"])).status).toBe(403);
    const admin: Partial<AuthRequest> = { user: { userId: "u", username: "a", role: "admin" } };
    expect(run(requirePermission("expense:approve"), admin).next).toHaveBeenCalled();
  });
});
