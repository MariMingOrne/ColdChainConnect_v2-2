// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DriverScheduleStop } from "@shared/api";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { DriverStopCard } from "./DriverStopCard";

const stop = (overrides: Partial<DriverScheduleStop> = {}): DriverScheduleStop => ({
  id: "item-1",
  delivery_id: "del-1",
  status: "pending",
  is_paid: false,
  outstanding_amount: 0,
  destination_customer: {
    id: "cust-1",
    store_name: "Corner Store",
    location: "Manila",
    street_address: "1 Main St",
    latitude: null,
    longitude: null,
    contact_person: null,
    contact_info: null,
  },
  invoice: {
    id: "inv-1",
    receipt_number: "INV-1",
    total_amount: "250.00",
    payment_status: "unpaid",
    invoice_items: [{ id: "ii-1", product_name: "Ice cream", qty_ordered: 5 }],
  },
  ...overrides,
});

const driver: AuthUser = { id: "u1", username: "driver", role: "driver" };

function signIn(user: AuthUser | null, token: string | null) {
  useAuth.setState({ user, token });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  signIn(driver, "driver-token");
});

afterEach(() => {
  cleanup();
  signIn(null, null);
  vi.unstubAllGlobals();
});

describe("DriverStopCard actions", () => {
  it("offers to confirm a pending stop and not to record payment yet", () => {
    render(<DriverStopCard stop={stop()} index={1} onChanged={() => {}} />);
    expect(screen.getByRole("button", { name: "Confirm delivery" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("confirms the delivery with the bearer token and refreshes", async () => {
    const onChanged = vi.fn();
    render(<DriverStopCard stop={stop()} index={1} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm delivery" }));
    const dialog = await screen.findByRole("dialog");
    // The modal opens on "Not paid", so this confirms with nothing collected.
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delivery" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/deliveries/del-1/items/item-1/confirm");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer driver-token");
    expect(JSON.parse(init.body)).toEqual({ is_paid: false, payment_amount: 0 });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends the collected amount and method when the customer paid in full", async () => {
    render(<DriverStopCard stop={stop()} index={1} onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm delivery" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Paid" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delivery" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      is_paid: true,
      payment_amount: 250,
      payment_method: "cash",
      payment_reference: "",
    });
  });

  it("shows the server's reason inside the modal and does not refresh when confirming fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "All pallets for this order must be shipped before delivery confirmation" }),
    });
    const onChanged = vi.fn();
    render(<DriverStopCard stop={stop()} index={1} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm delivery" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delivery" }));

    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/pallets/);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("records payment on a delivered, unpaid stop using the outstanding balance", async () => {
    const onChanged = vi.fn();
    render(
      <DriverStopCard stop={stop({ status: "completed", outstanding_amount: 100 })} index={1} onChanged={onChanged} />,
    );
    expect(screen.queryByRole("button", { name: "Confirm delivery" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/deliveries/del-1/items/item-1/payment");
    expect(init.headers.Authorization).toBe("Bearer driver-token");
    expect(JSON.parse(init.body)).toEqual({ payment_amount: 100, payment_method: "cash", payment_reference: "" });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("offers no action on a stop that is delivered and paid", () => {
    render(<DriverStopCard stop={stop({ status: "completed", is_paid: true })} index={1} onChanged={() => {}} />);
    expect(screen.queryByRole("button", { name: /Confirm delivery|Record payment/ })).toBeNull();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("hides the actions from a role that cannot confirm deliveries", () => {
    signIn({ id: "u2", username: "staff", role: "staff", module_permissions: [] }, "staff-token");
    render(<DriverStopCard stop={stop()} index={1} onChanged={() => {}} />);
    expect(screen.queryByRole("button", { name: "Confirm delivery" })).toBeNull();
  });
});
