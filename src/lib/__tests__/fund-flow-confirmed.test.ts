import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { addExcelMonths } from "../date-utils";
import {
  computeStaffExp,
  computeRemainingWorkAmt,
  computeTotalFee,
  computeRemainingFee,
  computeMonthlyDistribution,
  computeEqualInstallments,
} from "../fund-flow-calcs";
import { wholeMonthPlanCount } from "../fund-flow-window";

// First Excel row: WO 1 Apr 2026, TL 12, Grace 6 → Stipulated 31 Mar 2027,
// Target 30 Sep 2027, Target TL 18.
describe("confirmed Fund Flow date method (×30.416 days)", () => {
  const WO = new Date(Date.UTC(2026, 3, 1)); // 01 Apr 2026

  it("Stipulated Date of Completion = WO + TL×30.416", () => {
    const d = addExcelMonths(WO, 12);
    expect(d.toISOString().slice(0, 10)).toBe("2027-03-31");
  });

  it("Target Date of Completion = WO + (TL+Grace)×30.416", () => {
    const d = addExcelMonths(WO, 18);
    expect(d.toISOString().slice(0, 10)).toBe("2027-09-30");
  });

  it("Target Time Limit = TL + Grace", () => {
    expect(12 + 6).toBe(18);
  });

  it("works with Decimal months and fractional input", () => {
    const d = addExcelMonths(WO, new Decimal(12));
    expect(d.toISOString().slice(0, 10)).toBe("2027-03-31");
  });
});

describe("confirmed Fund Flow calculations", () => {
  it("Staff Exp. = 0.50+0.40+0.30+0.35+0.05 = 1.60", () => {
    const s = computeStaffExp({
      teamLeaderExp: "0.50",
      residentialEngineerExp: "0.40",
      designEngineerExp: "0.30",
      siteEngineerExp: "0.35",
      miscExp: "0.05",
    });
    expect(s.toString()).toBe("1.6");
  });

  it("remaining work amt = 22000 − 15000 = 7000", () => {
    expect(computeRemainingWorkAmt(22000, 15000).toString()).toBe("7000");
  });

  it("Total Fee = 22000 × 0.22727 / 100 = 49.9994 (exact)", () => {
    const fee = computeTotalFee(22000, "0.22727");
    expect(fee.toString()).toBe("49.9994");
  });

  it("remaing fee = Total Fee − fee recvd", () => {
    expect(computeRemainingFee("49.9994", 0).toString()).toBe("49.9994");
    expect(computeRemainingFee("49.9994", 10).toString()).toBe("39.9994");
  });

  it("second example: 22000 × 0.2% = 44.00 → 18 × 2.444444", () => {
    expect(computeTotalFee(22000, "0.2").toString()).toBe("44");
    expect(computeRemainingFee("44", 0).toString()).toBe("44");
    const m = computeMonthlyDistribution("44", 18);
    expect(m.toString()).toBe("2.444444"); // 44/18 = 2.4444444… → 6dp
    const residual = new Decimal("44").minus(m.mul(18));
    expect(residual.toString()).toBe("0.000008");
  });

  it("monthly distribution = remaing fee ÷ Target TL, 6dp", () => {
    const m = computeMonthlyDistribution("49.9994", 18);
    // 49.9994/18 = 2.777744444… → 2.777744
    expect(m.toString()).toBe("2.777744");
    // all 18 allocations accounted: residual reported, not hidden
    const total = m.mul(18);
    const residual = new Decimal("49.9994").minus(total);
    expect(residual.toString()).toBe("0.000008");
  });
});

describe("whole-month plan count + exact installment split", () => {
  it("workbook example: Target Time Limit 4.5 resolves to 4 whole months", () => {
    expect(wholeMonthPlanCount(4.5)).toBe(4);
    expect(wholeMonthPlanCount("4.5")).toBe(4);
    expect(wholeMonthPlanCount(new Decimal(4.5))).toBe(4);
    expect(wholeMonthPlanCount(18)).toBe(18);
    expect(wholeMonthPlanCount(0.4)).toBe(1);
    expect(wholeMonthPlanCount(0)).toBeNull();
    expect(wholeMonthPlanCount(null)).toBeNull();
    expect(wholeMonthPlanCount(undefined)).toBeNull();
  });

  it("installments always sum to the remaining fee exactly (residual last)", () => {
    const four = computeEqualInstallments("10.11048", 4);
    expect(four.map((d) => d.toString())).toEqual([
      "2.52762",
      "2.52762",
      "2.52762",
      "2.52762",
    ]);
    expect(
      four.reduce((a, d) => a.plus(d), new Decimal(0)).toString()
    ).toBe("10.11048");

    const three = computeEqualInstallments("10", 3);
    expect(three.map((d) => d.toString())).toEqual([
      "3.333333",
      "3.333333",
      "3.333334",
    ]);
    expect(
      three.reduce((a, d) => a.plus(d), new Decimal(0)).toString()
    ).toBe("10");

    const eighteen = computeEqualInstallments("49.9994", 18);
    expect(eighteen[17].toString()).toBe("2.777752");
    expect(
      eighteen.reduce((a, d) => a.plus(d), new Decimal(0)).toString()
    ).toBe("49.9994");
  });

  it("rejects non-whole or non-positive counts", () => {
    expect(() => computeEqualInstallments("10", 4.5)).toThrow();
    expect(() => computeEqualInstallments("10", 0)).toThrow();
  });
});
