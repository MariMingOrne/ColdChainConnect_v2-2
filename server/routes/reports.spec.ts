import { describe, expect, it } from "vitest";
import { buildProfitReport, parseReportRange } from "./reports";

describe("parseReportRange", () => {
  it("is null when no range is given", () => {
    expect(parseReportRange({})).toBeNull();
    expect(parseReportRange({ from: "", to: "" })).toBeNull();
  });

  it("makes 'to' inclusive by moving the bound to the next day", () => {
    const range = parseReportRange({ from: "2026-11-01", to: "2026-11-30" });
    expect(range && range !== "invalid" ? range.to?.toISOString() : null).toBe("2026-12-01T00:00:00.000Z");
  });

  it("accepts a one-sided range", () => {
    const range = parseReportRange({ from: "2026-11-01" });
    expect(range && range !== "invalid" ? range.to : "x").toBeNull();
  });

  it.each([
    { from: "11/01/2026" },
    { from: "2026-13-45" },
    { from: "2026-11-30", to: "2026-11-01" },
    { to: ["2026-11-01"] },
  ])("rejects %j", (query) => {
    expect(parseReportRange(query)).toBe("invalid");
  });
});

describe("buildProfitReport", () => {
  const line = (productId: string, qty: number, amount: string, gross = "100.00", total = "98.00") => ({
    productId,
    productName: productId.toUpperCase(),
    qty,
    amount,
    invoiceGross: gross,
    invoiceTotal: total,
  });

  it("computes margin on revenue net of the invoice discount", () => {
    const report = buildProfitReport([line("a", 10, "100.00")], new Map([["a", 6]]));
    expect(report.rows[0]).toMatchObject({ revenue: 98, cost: 60, profit: 38, marginPercent: 38.8 });
  });

  it("leaves products without a cost out of profit and totals, and counts them", () => {
    const report = buildProfitReport(
      [line("a", 10, "100.00"), line("b", 5, "50.00", "50.00", "50.00")],
      new Map([["a", 6]]),
    );
    expect(report.rows.find((row) => row.productId === "b")).toMatchObject({ cost: null, profit: null, marginPercent: null });
    expect(report.productsMissingCost).toBe(1);
    expect(report.totals).toMatchObject({ revenue: 98, cost: 60, profit: 38 });
  });

  it("sums several lines of one product", () => {
    const report = buildProfitReport(
      [line("a", 4, "40.00", "40.00", "40.00"), line("a", 6, "60.00", "60.00", "60.00")],
      new Map([["a", 5]]),
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ unitsSold: 10, revenue: 100, cost: 50, profit: 50, marginPercent: 50 });
  });

  it("shows a loss as a negative margin", () => {
    const report = buildProfitReport([line("a", 1, "10.00", "10.00", "10.00")], new Map([["a", 15]]));
    expect(report.rows[0]).toMatchObject({ profit: -5, marginPercent: -50 });
  });

  it("handles an empty period", () => {
    expect(buildProfitReport([], new Map())).toEqual({
      rows: [],
      totals: { revenue: 0, cost: 0, profit: 0, marginPercent: null },
      productsMissingCost: 0,
    });
  });
});
