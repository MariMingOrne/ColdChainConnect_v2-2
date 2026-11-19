// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAuth, type AuthUser } from "./useAuth";
import { useCan } from "./useCan";

function signIn(user: AuthUser | null) {
  act(() => useAuth.setState({ user }));
}

afterEach(() => signIn(null));

describe("useCan", () => {
  it("is false when nobody is signed in", () => {
    const { result } = renderHook(() => useCan("payment:verify"));
    expect(result.current).toBe(false);
  });

  it("denies payment:verify to staff without the accounting module", () => {
    signIn({ id: "1", username: "s", role: "staff", module_permissions: ["order-fulfillment"] });
    const { result } = renderHook(() => useCan("payment:verify"));
    expect(result.current).toBe(false);
  });

  it("allows payment:verify to staff with accounting and to admin", () => {
    signIn({ id: "1", username: "s", role: "staff", module_permissions: ["accounting"] });
    const staff = renderHook(() => useCan("payment:verify"));
    expect(staff.result.current).toBe(true);

    signIn({ id: "2", username: "a", role: "admin" });
    const admin = renderHook(() => useCan("payment:verify"));
    expect(admin.result.current).toBe(true);
  });

  it("follows the signed-in user as it changes", () => {
    signIn({ id: "2", username: "a", role: "admin" });
    const { result } = renderHook(() => useCan("booking:approve"));
    expect(result.current).toBe(true);
    signIn({ id: "1", username: "s", role: "staff", module_permissions: ["accounting"] });
    expect(result.current).toBe(false);
  });

  it("keeps server admin-only mutations hidden from staff, including accounting", () => {
    signIn({ id: "1", username: "s", role: "staff", module_permissions: ["accounting", "delivery-operations", "product-customer"] });
    for (const action of [
      "invoice:update",
      "receivable:update",
      "delivery:update",
      "agentReturn:decide",
      "customer:manage",
      "product:manage",
      "batch:manage",
      "driver:manage",
      "agent:manage",
      "truck:manage",
    ] as const) {
      const { result } = renderHook(() => useCan(action));
      expect(result.current, action).toBe(false);
    }
  });
});
