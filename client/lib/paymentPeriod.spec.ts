import { describe, expect, it } from "vitest";
import { formatPeriod, parsePeriod, periodBounds } from "./paymentPeriod";

// 2026-01-07 is a Wednesday.
const WED = "2026-01-07";

describe("periodBounds", () => {
  it("covers today and yesterday as single business days", () => {
    expect(periodBounds("today", WED)).toEqual({ from: "2026-01-07", to: "2026-01-07" });
    expect(periodBounds("yesterday", WED)).toEqual({ from: "2026-01-06", to: "2026-01-06" });
  });

  it("steps back over a month boundary for yesterday", () => {
    expect(periodBounds("yesterday", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });

  it("starts the week on Monday, including on a Sunday", () => {
    expect(periodBounds("thisWeek", WED)).toEqual({ from: "2026-01-05", to: "2026-01-11" });
    expect(periodBounds("thisWeek", "2026-01-04")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });

  it("counts the last 7 and 30 days inclusive of today", () => {
    expect(periodBounds("last7", WED)).toEqual({ from: "2026-01-01", to: "2026-01-07" });
    expect(periodBounds("last30", WED)).toEqual({ from: "2025-12-09", to: "2026-01-07" });
  });

  it("covers the month to date", () => {
    expect(periodBounds("thisMonth", WED)).toEqual({ from: "2026-01-01", to: "2026-01-07" });
  });

  it("uses a specific day as its own bounds and returns null for all dates", () => {
    expect(periodBounds("2026-01-02", WED)).toEqual({ from: "2026-01-02", to: "2026-01-02" });
    expect(periodBounds("all", WED)).toBeNull();
  });
});

describe("parsePeriod", () => {
  it("keeps known presets and specific days, and falls back to all dates otherwise", () => {
    expect(parsePeriod("yesterday")).toBe("yesterday");
    expect(parsePeriod("2026-01-02")).toBe("2026-01-02");
    expect(parsePeriod("bogus")).toBe("all");
    expect(parsePeriod(null)).toBe("all");
  });
});

describe("formatPeriod", () => {
  it("labels all dates and ranges", () => {
    expect(formatPeriod(null)).toBe("All dates");
    expect(formatPeriod({ from: "2026-01-05", to: "2026-01-05" })).toContain("2026");
    expect(formatPeriod({ from: "2026-01-05", to: "2026-01-11" })).toContain("–");
  });
});
