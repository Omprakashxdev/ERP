import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/format-money";

describe("formatMoney", () => {
  it("rounds half-up at two decimals instead of truncating", () => {
    expect(formatMoney("49.9994")).toBe("₹50.00");
    expect(formatMoney("2.786")).toBe("₹2.79");
    expect(formatMoney("6.214")).toBe("₹6.21");
  });

  it("pads short fractions to two decimals", () => {
    expect(formatMoney("8.58")).toBe("₹8.58");
    expect(formatMoney("5")).toBe("₹5.00");
    expect(formatMoney("0")).toBe("₹0.00");
  });

  it("carries rounding into the integer part", () => {
    expect(formatMoney("9.999")).toBe("₹10.00");
    expect(formatMoney("999.9999")).toBe("₹1,000.00");
  });

  it("handles negatives and Indian digit grouping", () => {
    expect(formatMoney("-14.396")).toBe("-₹14.40");
    expect(formatMoney("146202.5")).toBe("₹1,46,202.50");
    expect(formatMoney("146202")).toBe("₹1,46,202.00");
  });

  it("keeps up to six decimals when requested", () => {
    expect(formatMoney("49.9994", 6)).toBe("₹49.9994");
    expect(formatMoney("8.58", 6)).toBe("₹8.58");
    expect(formatMoney("8.5800009", 6)).toBe("₹8.580001");
  });

  it("renders null and undefined as an em dash", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});
