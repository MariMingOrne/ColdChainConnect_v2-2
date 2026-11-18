import { describe, it, expect } from "vitest";
import { cn, formatPeso } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });
});

describe("formatPeso", () => {
  it("adds thousands separators and two decimals", () => {
    expect(formatPeso(191520)).toBe("₱191,520.00");
    expect(formatPeso("3785.5")).toBe("₱3,785.50");
  });

  it("treats missing or invalid values as zero", () => {
    expect(formatPeso(null)).toBe("₱0.00");
    expect(formatPeso("abc")).toBe("₱0.00");
  });
});
