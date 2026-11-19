import { describe, expect, it } from "vitest";
import { dueInfo, isReceivableCollectable } from "./receivables";

describe("dueInfo", () => {
  const created = "2026-11-01T08:00:00";

  it("is not overdue on the due day", () => {
    const info = dueInfo(created, 30, new Date("2026-12-01T20:00:00"));
    expect(info.daysOverdue).toBe(0);
    expect(info.overdue).toBe(false);
  });

  it("is overdue the day after the due date", () => {
    const info = dueInfo(created, 30, new Date("2026-12-02T01:00:00"));
    expect(info.daysOverdue).toBe(1);
    expect(info.overdue).toBe(true);
  });

  it("counts down before the due date", () => {
    expect(dueInfo(created, 30, new Date("2026-11-20T09:00:00")).daysOverdue).toBeLessThan(0);
  });

  it("falls back to 30 days when the customer has no terms", () => {
    expect(dueInfo(created, undefined, new Date("2026-12-02T01:00:00")).overdue).toBe(true);
    expect(dueInfo(created, 0, new Date("2026-11-20T09:00:00")).overdue).toBe(false);
  });
});

describe("isReceivableCollectable", () => {
  it("excludes paid records and credits", () => {
    expect(isReceivableCollectable("outstanding", "100.00")).toBe(true);
    expect(isReceivableCollectable("paid", "100.00")).toBe(false);
    expect(isReceivableCollectable("outstanding", "-50.00")).toBe(false);
    expect(isReceivableCollectable("outstanding", "0")).toBe(false);
  });
});

import { summarizeOverdue } from "./receivables";

describe("summarizeOverdue", () => {
  const now = new Date("2026-12-20T09:00:00");
  const customers = [
    { id: "c1", store_name: "Alpha Mart", credit_terms_days: 15 },
    { id: "c2", store_name: "Beta Store" },
  ];

  it("groups overdue balances per customer, worst first", () => {
    const result = summarizeOverdue([
      { customer_id: "c1", status: "outstanding", amount_due: "100.00", created_at: "2026-11-20T08:00:00" },
      { customer_id: "c1", status: "outstanding", amount_due: "50.00", created_at: "2026-11-25T08:00:00" },
      { customer_id: "c2", status: "outstanding", amount_due: "70.00", created_at: "2026-10-01T08:00:00" },
    ], customers, now);

    expect(result.map((row) => row.customerName)).toEqual(["Beta Store", "Alpha Mart"]);
    expect(result[1]).toMatchObject({ count: 2, total: 150 });
  });

  it("ignores paid, credit and not-yet-due records", () => {
    const result = summarizeOverdue([
      { customer_id: "c1", status: "paid", amount_due: "100.00", created_at: "2026-10-01T08:00:00" },
      { customer_id: "c1", status: "outstanding", amount_due: "-20.00", created_at: "2026-10-01T08:00:00" },
      { customer_id: "c1", status: "outstanding", amount_due: "30.00", created_at: "2026-12-15T08:00:00" },
    ], customers, now);
    expect(result).toEqual([]);
  });
});
