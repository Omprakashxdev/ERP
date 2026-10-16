import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  computeMonthlyBreakdown,
  MonthlyDiscrepancyCode,
  MonthlyBreakdownResult,
} from "./monthly";

// ─── Helpers ──────────────────────────────────────────────────

function dec(value: string | number): Decimal {
  return new Decimal(String(value));
}

function findDiscrepancy(
  result: MonthlyBreakdownResult,
  code: MonthlyDiscrepancyCode
) {
  return result.discrepancies.find((d) => d.code === code);
}

function hasDiscrepancy(result: MonthlyBreakdownResult, code: MonthlyDiscrepancyCode) {
  return result.discrepancies.some((d) => d.code === code);
}

// ─── Fixture factory ───────────────────────────────────────────

function createMonthlySources(
  overrides: {
    project?: Partial<{ id: string; workOrderDate: Date | null }>;
    fundFlow?: { id: string; monthlyData: { id: string; month: number; year: number; income: Decimal; expense: Decimal; net: Decimal; cumulative: Decimal }[] } | null;
    dueBills?: {
      id: string;
      grossAmount: Decimal;
      sgst: Decimal;
      cgst: Decimal;
      billAmount: Decimal;
      chequeAmount: Decimal;
      sd: Decimal;
      itTds: Decimal;
      receivedAmount: Decimal;
      billDate: Date | null;
      receiveDate: Date | null;
      status: string;
    }[];
  } = {}
) {
  const project = {
    id: "proj-1",
    workOrderDate: new Date("2026-01-15"),
    ...overrides.project,
  };

  const fundFlow =
    overrides.fundFlow !== undefined
      ? overrides.fundFlow
      : {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("100000"), expense: dec("20000"), net: dec("80000"), cumulative: dec("80000") },
            { id: "ffm-2", month: 2, year: 2026, income: dec("50000"), expense: dec("10000"), net: dec("40000"), cumulative: dec("120000") },
          ],
        };

  const dueBills =
    overrides.dueBills !== undefined
      ? overrides.dueBills
      : [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ];

  return { project, fundFlow, dueBills };
}

// ─── Tests ────────────────────────────────────────────────────

describe("computeMonthlyBreakdown", () => {
  describe("T18: Month allocation from billDate and receiveDate", () => {
    it("groups invoices by billDate month and receipts by receiveDate month", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-jan",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-02-05"),
            status: "PENDING",
          },
          {
            id: "db-feb",
            grossAmount: dec("50000"),
            sgst: dec("4500"),
            cgst: dec("4500"),
            billAmount: dec("59000"),
            chequeAmount: dec("59000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("59000"),
            billDate: new Date("2026-02-15"),
            receiveDate: new Date("2026-03-10"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(3);

      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.derivedInvoiced?.toString()).toBe("118000");
      expect(jan.invoicedDueBillIds).toContain("db-jan");
      // receipt in Feb
      expect(jan.derivedReceived).toBeNull();

      const feb = result.months.find((m) => m.year === 2026 && m.month === 2)!;
      expect(feb.derivedInvoiced?.toString()).toBe("59000");
      expect(feb.invoicedDueBillIds).toContain("db-feb");
    });

    it("groups receipts in the month of receiveDate, not billDate", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-cross",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-03-05"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(2); // Jan and Mar

      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.derivedInvoiced?.toString()).toBe("118000");
      expect(jan.derivedReceived).toBeNull();
      expect(jan.invoicedDueBillIds).toContain("db-cross");

      const mar = result.months.find((m) => m.year === 2026 && m.month === 3)!;
      expect(mar.derivedReceived?.toString()).toBe("118000");
      expect(mar.receivedDueBillIds).toContain("db-cross");
    });
  });

  describe("T19: Stored FundFlowMonthly sanity checks", () => {
    it("preserves storedIncome and derivedInvoiced as separate figures without flagging mismatch", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("100000"), expense: dec("20000"), net: dec("80000"), cumulative: dec("80000") },
          ],
        },
        dueBills: [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.storedIncome?.toString()).toBe("100000");
      expect(jan.storedIncomeClassification).toBe("UNKNOWN");
      expect(jan.derivedInvoiced?.toString()).toBe("118000");
      // No income mismatch discrepancy emitted — they are different concepts
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.MONTHLY_NET_MISMATCH)).toBe(false);
    });

    it("emits net mismatch when stored net does not equal stored income minus expense", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("100000"), expense: dec("20000"), net: dec("50000"), cumulative: dec("50000") },
          ],
        },
        dueBills: [],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.MONTHLY_NET_MISMATCH)).toBe(true);
      const disc = findDiscrepancy(result, MonthlyDiscrepancyCode.MONTHLY_NET_MISMATCH)!;
      expect(disc.comparedValues?.storedNet.value).toBe("50000");
      expect(disc.comparedValues?.computedNet.value).toBe("80000");
    });

    it("does not emit net mismatch when stored values are consistent", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("118000"), expense: dec("0"), net: dec("118000"), cumulative: dec("118000") },
          ],
        },
        dueBills: [],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.MONTHLY_NET_MISMATCH)).toBe(false);
    });
  });

  describe("T20: Missing FundFlowMonthly records distinguished from zero", () => {
    it("returns null stored values when no FundFlowMonthly record exists for a month", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [],
        },
        dueBills: [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.storedIncome).toBeNull();
      expect(jan.storedExpense).toBeNull();
      expect(jan.derivedInvoiced?.toString()).toBe("118000");
    });

    it("returns zero stored values when FundFlowMonthly explicitly records zero", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("0"), expense: dec("0"), net: dec("0"), cumulative: dec("0") },
          ],
        },
        dueBills: [],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.storedIncome?.toString()).toBe("0");
      expect(jan.storedIncomeClassification).toBe("UNKNOWN");
      expect(jan.storedExpense?.toString()).toBe("0");
    });

    it("emits MISSING_MONTHLY_RECORD when derived activity exists but no stored record", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [],
        },
        dueBills: [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.MISSING_MONTHLY_RECORD)).toBe(true);
    });
  });

  describe("T21: Incomplete schedule (gaps in months)", () => {
    it("only includes months that have either stored or derived data", () => {
      const sources = createMonthlySources({
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("100000"), expense: dec("20000"), net: dec("80000"), cumulative: dec("80000") },
            { id: "ffm-3", month: 3, year: 2026, income: dec("50000"), expense: dec("10000"), net: dec("40000"), cumulative: dec("120000") },
          ],
        },
        dueBills: [
          {
            id: "db-jan",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
          {
            id: "db-mar",
            grossAmount: dec("50000"),
            sgst: dec("4500"),
            cgst: dec("4500"),
            billAmount: dec("59000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-03-15"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(2);
      expect(result.months.map((m) => m.month)).toEqual([1, 3]);
      expect(result.months.some((m) => m.month === 2)).toBe(false);
    });
  });

  describe("T22: Null billDate and receiveDate handling", () => {
    it("excludes invoice with null billDate from monthly grouping and emits UNALLOCATED_INVOICE_DATE", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-null-date",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: null,
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(0);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.UNALLOCATED_INVOICE_DATE)).toBe(true);
    });

    it("excludes receipt with null receiveDate from monthly grouping and emits UNALLOCATED_RECEIPT_DATE", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-null-receive",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      // Invoice is grouped in Jan
      expect(result.months.length).toBe(1);
      expect(result.months[0].derivedInvoiced?.toString()).toBe("118000");
      // But receipt is not grouped
      expect(result.months[0].derivedReceived).toBeNull();
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.UNALLOCATED_RECEIPT_DATE)).toBe(true);
    });

    it("does not emit UNALLOCATED_RECEIPT_DATE when receipt amount is zero", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-zero-receipt",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.UNALLOCATED_RECEIPT_DATE)).toBe(false);
    });
  });

  describe("T23: No double-counting", () => {
    it("assigns each DueBill to exactly one invoice month and one receipt month", () => {
      const sources = createMonthlySources({
        dueBills: [
          {
            id: "db-single",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-02-05"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      const feb = result.months.find((m) => m.year === 2026 && m.month === 2)!;

      expect(jan.invoicedDueBillIds).toEqual(["db-single"]);
      expect(jan.receivedDueBillIds).toEqual([]);

      expect(feb.invoicedDueBillIds).toEqual([]);
      expect(feb.receivedDueBillIds).toEqual(["db-single"]);

      // Count total references across all months
      const allInvoicedIds = result.months.flatMap((m) => m.invoicedDueBillIds);
      const allReceivedIds = result.months.flatMap((m) => m.receivedDueBillIds);
      expect(allInvoicedIds.filter((id) => id === "db-single").length).toBe(1);
      expect(allReceivedIds.filter((id) => id === "db-single").length).toBe(1);
    });

    it("excludes cancelled bills from both invoice and receipt grouping", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-cancelled",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-02-05"),
            status: "CANCELLED",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(0);
      expect(result.summary.totalDerivedInvoiced).toBeNull();
      expect(result.summary.totalDerivedReceived).toBeNull();
    });
  });

  describe("T24: Decimal-safe fractional month totals", () => {
    it("avoids floating-point drift with small fractional amounts", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-frac-1",
            grossAmount: dec("0.01"),
            sgst: dec("0.01"),
            cgst: dec("0.01"),
            billAmount: dec("0.03"),
            chequeAmount: dec("0.01"),
            sd: dec("0.01"),
            itTds: dec("0.01"),
            receivedAmount: dec("0.03"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-01-15"),
            status: "PAID",
          },
          {
            id: "db-frac-2",
            grossAmount: dec("0.02"),
            sgst: dec("0.01"),
            cgst: dec("0.01"),
            billAmount: dec("0.04"),
            chequeAmount: dec("0.02"),
            sd: dec("0.01"),
            itTds: dec("0.01"),
            receivedAmount: dec("0.04"),
            billDate: new Date("2026-01-20"),
            receiveDate: new Date("2026-01-25"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.derivedInvoiced?.toString()).toBe("0.07");
      expect(jan.derivedReceived?.toString()).toBe("0.07");
      expect(jan.derivedCheque?.toString()).toBe("0.03");
    });
  });

  describe("T25: Summary totals preserve null semantics", () => {
    it("returns null summary when no data exists", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.summary.totalStoredIncome).toBeNull();
      expect(result.summary.totalDerivedInvoiced).toBeNull();
      expect(result.summary.totalDerivedReceived).toBeNull();
    });

    it("returns null for stored totals when only derived data exists", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.summary.totalStoredIncome).toBeNull();
      expect(result.summary.totalDerivedInvoiced?.toString()).toBe("118000");
    });
  });

  describe("T27: Negative receipt and cheque amounts", () => {
    it("includes negative receivedAmount in monthly grouping and preserves signed value", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-neg-rec",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("-5000"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-01-15"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.derivedReceived?.toString()).toBe("-5000");
      expect(jan.receivedDueBillIds).toContain("db-neg-rec");
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.NEGATIVE_RECEIPT_AMOUNT)).toBe(true);
    });

    it("includes negative chequeAmount in monthly grouping and preserves signed value", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-neg-chq",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("-3000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-01-15"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      const jan = result.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.derivedCheque?.toString()).toBe("-3000");
      expect(jan.receivedDueBillIds).toContain("db-neg-chq");
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.NEGATIVE_RECEIPT_AMOUNT)).toBe(true);
    });

    it("emits UNALLOCATED_RECEIPT_DATE for negative amounts with null receiveDate", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-neg-unalloc",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("-2000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("-3000"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(1);
      expect(result.months[0].derivedReceived).toBeNull();
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.UNALLOCATED_RECEIPT_DATE)).toBe(true);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.NEGATIVE_RECEIPT_AMOUNT)).toBe(true);
    });

    it("does not emit NEGATIVE_RECEIPT_AMOUNT for positive amounts", () => {
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-pos",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-10"),
            receiveDate: new Date("2026-01-15"),
            status: "PAID",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(hasDiscrepancy(result, MonthlyDiscrepancyCode.NEGATIVE_RECEIPT_AMOUNT)).toBe(false);
    });
  });

  describe("T26: IST month boundary handling", () => {
    it("assigns a UTC late-night date to the correct IST month", () => {
      // 2026-01-31 23:30 UTC = 2026-02-01 05:00 IST
      // Raw getFullYear/getMonth would classify this as January;
      // IST-aware extraction must classify it as February.
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-boundary",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-31T23:30:00Z"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(1);
      expect(result.months[0].year).toBe(2026);
      expect(result.months[0].month).toBe(2);
    });

    it("assigns a UTC early-morning date to the correct IST month", () => {
      // 2026-02-01 04:30 UTC = 2026-02-01 10:00 IST
      const sources = createMonthlySources({
        fundFlow: null,
        dueBills: [
          {
            id: "db-morning",
            grossAmount: dec("50000"),
            sgst: dec("4500"),
            cgst: dec("4500"),
            billAmount: dec("59000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-02-01T04:30:00Z"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = computeMonthlyBreakdown(sources);
      expect(result.months.length).toBe(1);
      expect(result.months[0].year).toBe(2026);
      expect(result.months[0].month).toBe(2);
    });
  });
});
