// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Expense } from "@shared/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { Expenses } from "./Expenses";

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "exp-1",
  category: "Fuel",
  description: "Diesel for truck 3",
  amount: "1250.50",
  status: "submitted",
  submitted_by: "u-other",
  created_at: "2026-01-02T08:00:00.000Z",
  updated_at: "2026-01-02T08:00:00.000Z",
  submitted_by_name: "olivia",
  ...overrides,
});

const submittedByOther = expense({ id: "exp-submitted", description: "Tyres for van" });
const approvedByAdmin = expense({
  id: "exp-approved",
  description: "Cold room repair",
  status: "approved",
  approved_by: "u-admin",
  approved_by_name: "alice",
  created_at: "2026-01-03T08:00:00.000Z",
});
const rows = [submittedByOther, approvedByAdmin];

const admin: AuthUser = { id: "u-admin", username: "alice", role: "admin" };
const accounting: AuthUser = { id: "u-acct", username: "bob", role: "staff", module_permissions: ["accounting"] };

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Expenses />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function openDetails(description: string) {
  const row = (await screen.findByText(description)).closest("tr") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Details" }));
  return screen.findByRole("dialog");
}

const callTo = (url: string) => fetchMock.mock.calls.find(([called]) => called === url);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    !init?.method || init.method === "GET" ? jsonResponse({ expenses: rows }) : jsonResponse({ expense: {} }, 201),
  );
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  useAuth.setState({ user: admin, token: "tok" });
});

afterEach(() => {
  cleanup();
  useAuth.setState({ user: null, token: null });
  vi.unstubAllGlobals();
});

describe("Expenses list and row actions", () => {
  it("lists the expenses newest first with their status", async () => {
    renderScreen();
    await screen.findByText("Cold room repair");
    const body = screen.getAllByRole("row").slice(1);
    expect(body[0].textContent).toContain("Cold room repair");
    expect(body[1].textContent).toContain("Tyres for van");
    expect(body[0].textContent).toContain("approved");
    expect(body[1].textContent).toContain("submitted");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("lets an admin approve or reject a submission from someone else, and not pay it", async () => {
    renderScreen();
    const dialog = await openDetails("Tyres for van");
    expect(within(dialog).getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Pay" })).toBeNull();
  });

  it("hides Approve and Reject on the admin's own submission", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ expenses: [{ ...submittedByOther, submitted_by: admin.id }] }));
    renderScreen();
    const dialog = await openDetails("Tyres for van");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("hides Pay from an admin who approved the expense themselves", async () => {
    renderScreen();
    const dialog = await openDetails("Cold room repair");
    expect(within(dialog).queryByRole("button", { name: "Pay" })).toBeNull();
  });

  it("lets accounting pay an approved expense but never approve a submitted one", async () => {
    useAuth.setState({ user: accounting });
    renderScreen();

    const approvedDialog = await openDetails("Cold room repair");
    expect(within(approvedDialog).getByRole("button", { name: "Pay" })).toBeTruthy();
    fireEvent.keyDown(approvedDialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const submittedDialog = await openDetails("Tyres for van");
    expect(within(submittedDialog).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(submittedDialog).queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("is read-only for a user who may not act on expenses", async () => {
    useAuth.setState({ user: { id: "u-x", username: "x", role: "staff", module_permissions: ["reports"] } });
    renderScreen();
    expect(screen.queryByRole("button", { name: "New expense" })).toBeNull();
    const dialog = await openDetails("Tyres for van");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Pay" })).toBeNull();
  });

  it("approves with the bearer token and refreshes the list", async () => {
    renderScreen();
    const dialog = await openDetails("Tyres for van");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(callTo("/api/expenses/exp-submitted/approve")).toBeTruthy());
    const call = callTo("/api/expenses/exp-submitted/approve")!;
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.Authorization).toBe("Bearer tok");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/expenses").length).toBeGreaterThan(1));
  });

  it("requires a reason before rejecting", async () => {
    renderScreen();
    const dialog = await openDetails("Tyres for van");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm rejection" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/reason/i);
    expect(callTo("/api/expenses/exp-submitted/reject")).toBeUndefined();

    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Not budgeted" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm rejection" }));
    await waitFor(() => expect(callTo("/api/expenses/exp-submitted/reject")).toBeTruthy());
    expect(JSON.parse(callTo("/api/expenses/exp-submitted/reject")![1].body)).toEqual({ reject_reason: "Not budgeted" });
  });

  it("filters by status", async () => {
    renderScreen();
    await screen.findByText("Cold room repair");
    fireEvent.click(screen.getByRole("radio", { name: /^Approved/ }));
    expect(screen.queryByText("Tyres for van")).toBeNull();
    expect(screen.getByText("Cold room repair")).toBeTruthy();
  });
});

describe("New expense form", () => {
  async function openForm() {
    renderScreen();
    await screen.findByText("Cold room repair");
    fireEvent.click(screen.getByRole("button", { name: "New expense" }));
    return screen.findByRole("dialog");
  }
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

  it("blocks an empty description", async () => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "Fuel" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit expense" }));
    expect(await within(dialog).findByText(/description is required/i)).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it.each(["", "0", "0.00", "-5", "abc", "1.234"])("blocks the amount %j", async (amount) => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "Fuel" } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Diesel" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: amount } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit expense" }));
    expect(await within(dialog).findByText(/amount/i, { selector: "[role=alert]" })).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it("submits a valid expense and refreshes", async () => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "Fuel" } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Diesel" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1250.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit expense" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const [url, init] = posts()[0];
    expect(url).toBe("/api/expenses");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ category: "Fuel", description: "Diesel", amount: "1250.5" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
