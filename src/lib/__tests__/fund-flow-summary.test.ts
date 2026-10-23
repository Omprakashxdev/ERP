import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMonthlyReport } from "../fund-flow-summary";
import { MONTHLY_ALLOCATION_WINDOW } from "../fund-flow-window";

const idx = (month: number, year: number) => (year - 2026) * 12 + (month - 4);
const emptyIncome = new Map<
  string,
  { total: Decimal; projectCount: number; unavailableCount: number }
>();
const inc = (month: number, year: number, amount: string, extra?: Partial<{ projectCount: number; unavailableCount: number }>) =>
  new Map([
    [
      `${year}-${month}`,
      { total: new Decimal(amount), projectCount: 1, unavailableCount: 0, ...extra },
    ],
  ]);

describe("computeMonthlyReport — confirmed Rows 12/14/16/18", () => {
  it("customer example: overlapping A (1.60×18 from Jul26) + B (0.90×4 from Sep26)", () => {
    const r = computeMonthlyReport(
      [
        { name: "A", staffExp: "1.60", startMonth: 7, startYear: 2026, targetTimeLimitMonths: 18 },
        { name: "B", staffExp: "0.90", startMonth: 9, startYear: 2026, targetTimeLimitMonths: 4 },
      ],
      emptyIncome
    );
    const at = (m: number, y: number) => r.months[idx(m, y)];
    expect(at(7, 2026).expense).toBe("1.6");
    expect(at(8, 2026).expense).toBe("1.6");
    expect(at(9, 2026).expense).toBe("2.5");
    expect(at(12, 2026).expense).toBe("2.5");
    expect(at(1, 2027).expense).toBe("1.6");
    expect(at(12, 2027).expense).toBe("1.6");
    expect(at(1, 2028).expense).toBe("0");
    expect(r.totalExpense).toBe("32.4"); // 1.6×18 + 0.9×4
  });

  it("Row 16/18: income − expense, carry-forward, negatives", () => {
    const income = new Map([
      ...inc(7, 2026, "5.31"),
      ...inc(8, 2026, "2.00"),
    ]);
    const r = computeMonthlyReport(
      [{ name: "A", staffExp: "2.50", startMonth: 7, startYear: 2026, targetTimeLimitMonths: 2 }],
      income
    );
    const at = (m: number, y: number) => r.months[idx(m, y)];
    expect(at(7, 2026).net).toBe("2.81");
    expect(at(7, 2026).cumulativeBalance).toBe("2.81");
    expect(at(8, 2026).net).toBe("-0.5");
    expect(at(8, 2026).cumulativeBalance).toBe("2.31");
    expect(at(9, 2026).net).toBeNull();
    expect(at(9, 2026).cumulativeBalance).toBe("2.31"); // carries
  });

  it("legacy rows without timing are excluded and flagged — never invented", () => {
    const r = computeMonthlyReport(
      [
        { name: "Legacy", staffExp: "2000", startMonth: null, startYear: null, targetTimeLimitMonths: null },
        { name: "Half", staffExp: "5", startMonth: 4, startYear: 2026, targetTimeLimitMonths: null },
      ],
      emptyIncome
    );
    expect(r.missingExpenseConfig).toEqual([
      { projectName: "Legacy", missing: ["Start month", "Target Time Limit (In Month)"] },
      { projectName: "Half", missing: ["Target Time Limit (In Month)"] },
    ]);
    expect(r.months.every((m) => m.expense === "0")).toBe(true);
    expect(r.months.every((m) => m.incomplete)).toBe(true);
  });

  it("unavailable income records flag the month incomplete", () => {
    const income = new Map([
      [`2026-4`, { total: new Decimal("10"), projectCount: 1, unavailableCount: 2 }],
    ]);
    const r = computeMonthlyReport([], income);
    expect(r.months[0].income).toBe("10");
    expect(r.months[0].incomeUnavailableCount).toBe(2);
    expect(r.months[0].incomplete).toBe(true);
    expect(r.months[1].incomplete).toBe(false);
  });

  it("project ending outside the window only contributes inside it", () => {
    const r = computeMonthlyReport(
      [{ name: "Late", staffExp: "1", startMonth: 2, startYear: 2028, targetTimeLimitMonths: 6 }],
      emptyIncome
    );
    expect(r.months[idx(2, 2028)].expense).toBe("1");
    expect(r.months[idx(3, 2028)].expense).toBe("1"); // window edge
    expect(r.months.length).toBe(MONTHLY_ALLOCATION_WINDOW.length);
  });

  it("project starting before the window contributes from Apr 2026", () => {
    const r = computeMonthlyReport(
      [{ name: "Early", staffExp: "1", startMonth: 1, startYear: 2026, targetTimeLimitMonths: 6 }],
      emptyIncome
    );
    expect(r.months[0].expense).toBe("1"); // Apr 2026 in span Jan–Jun
    expect(r.months[idx(6, 2026)].expense).toBe("1");
    expect(r.months[idx(7, 2026)].expense).toBe("0");
  });
});
