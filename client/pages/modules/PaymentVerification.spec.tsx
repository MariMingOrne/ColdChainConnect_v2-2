// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UnverifiedPayment } from "@shared/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { PaymentVerification } from "./PaymentVerification";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const payment: UnverifiedPayment = {
  id: "rec-1",
  receipt_number: "OR-0001",
  delivery_item_id: "di-1",
  customer_id: "cust-1",
  invoice_id: "inv-1",
  confirmed_at: "2026-01-02T08:00:00.000Z",
  customer_name: "Corner Store",
  invoice_receipt_number: "INV-0001",
  payment_method: "cash",
  amount: "250.00",
  recorded_by: "u-driver",
  recorded_by_username: "dave_driver",
};

const accounting: AuthUser = { id: "u-acct", username: "bob", role: "staff", module_permissions: ["accounting"] };
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

function renderScreen() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <PaymentVerification />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const verifyCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/verify"));

beforeEach(() => {
  fetchMock.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? json(payment) : json([payment])));
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  useAuth.setState({ user: accounting, token: "tok" });
});

afterEach(() => {
  cleanup();
  useAuth.setState({ user: null, token: null });
  vi.unstubAllGlobals();
});

describe("PaymentVerification", () => {
  it("lists the payments waiting to be verified", async () => {
    renderScreen();
    const row = (await screen.findByText("Corner Store")).closest("tr") as HTMLElement;
    expect(row.textContent).toContain("OR-0001");
    expect(row.textContent).toContain("INV-0001");
    expect(row.textContent).toContain("₱250.00");
    expect(row.textContent).toContain("dave_driver");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/payments/unverified");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("shows an empty state", async () => {
    fetchMock.mockImplementation(async () => json([]));
    renderScreen();
    expect(await screen.findByText(/no payments are waiting/i)).toBeTruthy();
  });

  it("confirms in a modal, then verifies and refreshes", async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /Verify/ }));
    const dialog = await screen.findByRole("dialog");
    expect(verifyCalls()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm payment received/ }));

    await waitFor(() => expect(verifyCalls()).toHaveLength(1));
    expect(verifyCalls()[0][0]).toBe("/api/receipts/rec-1/verify");
    expect(verifyCalls()[0][1].headers.Authorization).toBe("Bearer tok");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/payments/unverified").length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows the server's 409 message as a toast", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ error: "This payment is already verified" }, 409) : json([payment]),
    );
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /Verify/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirm payment received/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This payment is already verified"));
  });

  it("offers no Verify action to a user without payment:verify", async () => {
    useAuth.setState({ user: { id: "u-x", username: "x", role: "staff", module_permissions: ["reports"] } });
    renderScreen();
    await screen.findByText("Corner Store");
    expect(screen.queryByRole("button", { name: /Verify/ })).toBeNull();
  });
});
