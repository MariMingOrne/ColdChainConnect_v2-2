import { describe, expect, it } from "vitest";
import { applyReservationsToSourceItems } from "./reservation-allocation";

describe("applyReservationsToSourceItems", () => {
  it("subtracts pallet allocations before distributing order holds by oldest stock", () => {
    const stockItems = [
      { id: "newer", product_id: "product-a", qty_units: 6, created_at: "2025-02-01" },
      { id: "older", product_id: "product-a", qty_units: 4, created_at: "2025-01-01" },
      { id: "other", product_id: "product-b", qty_units: 3, created_at: "2025-01-01" },
    ];

    const available = applyReservationsToSourceItems(
      stockItems,
      new Map([["older", 1]]),
      new Map([["product-a", 5], ["product-b", 2]]),
    );

    expect(available).toEqual(new Map([
      ["older", 0],
      ["newer", 4],
      ["other", 1],
    ]));
  });

  it("does not make stock negative when reservations exceed on-hand stock", () => {
    const available = applyReservationsToSourceItems(
      [{ id: "only", product_id: "product-a", qty_units: 2, created_at: "2025-01-01" }],
      new Map(),
      new Map([["product-a", 5]]),
    );

    expect(available.get("only")).toBe(0);
  });
});
