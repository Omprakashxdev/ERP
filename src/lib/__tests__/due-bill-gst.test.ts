import { describe, it, expect } from "vitest";
import { calcNinePercentGst } from "@/lib/due-bill-calc";

describe("calcNinePercentGst — workbook SGST/CGST formula (Phase 4A)", () => {
  it("computes 9% of gross, matching =D*9% in Consul Bill rows", () => {
    // workbook row: gross 10000 → sgst/cgst 900
    expect(calcNinePercentGst(10000)).toBe("900.00");
    // workbook row: gross 45000 → 4050
    expect(calcNinePercentGst(45000)).toBe("4050.00");
    // workbook row: gross 75000 → 6750
    expect(calcNinePercentGst(75000)).toBe("6750.00");
    // workbook row: gross 33300 → 2997
    expect(calcNinePercentGst(33300)).toBe("2997.00");
    // workbook row: gross 123900 → 11151
    expect(calcNinePercentGst(123900)).toBe("11151.00");
  });

  it("handles zero and decimal gross", () => {
    expect(calcNinePercentGst(0)).toBe("0.00");
    expect(calcNinePercentGst(123.456)).toBe("11.11"); // 11.111 → rounded to paisa
  });
});
