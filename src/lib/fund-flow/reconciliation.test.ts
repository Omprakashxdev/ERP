import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  reconcileProject,
  DiscrepancyCode,
  ReconciliationSourceRecords,
  ReconciliationResult,
} from "./reconciliation";

// ─── Helpers ──────────────────────────────────────────────────

function dec(value: string | number): Decimal {
  return new Decimal(String(value));
}

function cloneSources(
  sources: ReconciliationSourceRecords
): ReconciliationSourceRecords {
  return JSON.parse(JSON.stringify(sources, (_k, v) => {
    if (v && typeof v === "object" && "toFixed" in v) {
      return v.toString();
    }
    if (v instanceof Date) {
      return v.toISOString();
    }
    return v;
  })) as ReconciliationSourceRecords;
}

function createSources(
  overrides: Partial<ReconciliationSourceRecords> = {}
): ReconciliationSourceRecords {
  const project = overrides.project !== undefined ? overrides.project : {
    id: "proj-1",
    estimatedCost: dec("500000"),
    totalFee: dec("600000"),
  };

  const fundFlow =
    overrides.fundFlow !== undefined ? overrides.fundFlow : {
      id: "ff-1",
      miscExp: dec("0"),
      staffExp: dec("0"),
      totalProjectCost: dec("500000"),
      completedWorkAmt: dec("200000"),
      proposedDueBillAmount: dec("0"),
      feeReceived: dec("0"),
    };

  const dueBills =
    overrides.dueBills !== undefined ? overrides.dueBills : [
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
        billDate: new Date("2026-01-15"),
        receiveDate: null,
        status: "PENDING",
      },
    ];

  const wip =
    overrides.wip !== undefined ? overrides.wip : {
      id: "wip-1",
      amountOfWorkDone: dec("200000"),
      finalProgressAmount: null,
      raBill1Amount: dec("50000"),
      raBill2Amount: dec("50000"),
      raBill3Amount: dec("50000"),
      raBill4Amount: dec("50000"),
      raBill1SaecFee: dec("10000"),
      raBill2SaecFee: dec("10000"),
      raBill3SaecFee: dec("10000"),
      raBill4SaecFee: dec("10000"),
      raBill1ProjectExpense: dec("5000"),
      raBill2ProjectExpense: dec("5000"),
      raBill3ProjectExpense: dec("5000"),
      raBill4ProjectExpense: dec("5000"),
    };

  const feeStages =
    overrides.feeStages !== undefined ? overrides.feeStages : [
      { id: "fs-1", amount: dec("300000"), percentage: dec("50") },
      { id: "fs-2", amount: dec("300000"), percentage: dec("50") },
    ];

  return { project, fundFlow, dueBills, wip, feeStages };
}

function findDiscrepancy(
  result: ReconciliationResult,
  code: DiscrepancyCode
) {
  return result.discrepancies.find((d) => d.code === code);
}

function hasDiscrepancy(result: ReconciliationResult, code: DiscrepancyCode) {
  return result.discrepancies.some((d) => d.code === code);
}

// ─── Pure function tests ─────────────────────────────────────

describe("reconcileProject", () => {
  describe("T01: Invoice total with GST", () => {
    it("computes invoice total 118,000 from gross 100,000 + SGST 9,000 + CGST 9,000", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t01",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-15"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(result.invoiceSettlementTotals.grossTotal.toString()).toBe("100000");
      expect(result.invoiceSettlementTotals.sgstTotal.toString()).toBe("9000");
      expect(result.invoiceSettlementTotals.cgstTotal.toString()).toBe("9000");
      expect(result.invoiceSettlementTotals.invoiceTotal.toString()).toBe("118000");
    });
  });

  describe("T02: Settlement components and recorded cheque", () => {
    it("reports settlement 118,000 and recorded cheque 90,000 without asserting verified cash", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t02",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("90000"),
            sd: dec("18000"),
            itTds: dec("10000"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(result.invoiceSettlementTotals.settlementTotal.toString()).toBe("118000");
      expect(result.recordedCash.chequeTotal.toString()).toBe("90000");
      expect(result.recordedCash.withLimitation).toBe(true);
      expect(result.recordedCash.explanation).toContain("does not confirm");
    });
  });

  describe("T03: Partial invoice settlement", () => {
    it("calculates correct outstanding balance for a partially settled bill", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t03",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("50000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("50000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PARTIAL",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(result.invoiceSettlementTotals.settlementTotal.toString()).toBe("50000");
      expect(result.invoiceSettlementTotals.outstandingTotal.toString()).toBe("68000");
    });
  });

  describe("T04: Multiple invoices for one project", () => {
    it("aggregates correctly without double counting", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t04a",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
          {
            id: "db-t04b",
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

      const result = reconcileProject(sources);
      expect(result.invoiceSettlementTotals.grossTotal.toString()).toBe("150000");
      expect(result.invoiceSettlementTotals.invoiceTotal.toString()).toBe("177000");
      expect(result.invoiceSettlementTotals.settlementTotal.toString()).toBe("118000");
      expect(result.invoiceSettlementTotals.outstandingTotal.toString()).toBe("59000");
    });
  });

  describe("T05: Legacy FundFlow receipt mismatch", () => {
    it("emits discrepancy when FundFlow.feeReceived differs from aggregated settlements", () => {
      const sources = createSources({
        fundFlow: {
          id: "ff-t05",
          miscExp: dec("0"),
          staffExp: dec("0"),
          totalProjectCost: dec("500000"),
          completedWorkAmt: dec("200000"),
          proposedDueBillAmount: dec("0"),
          feeReceived: dec("200000"),
        },
        dueBills: [
          {
            id: "db-t05",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.LEGACY_FEE_RECEIVED_MISMATCH)).toBe(true);
      const disc = findDiscrepancy(result, DiscrepancyCode.LEGACY_FEE_RECEIVED_MISMATCH)!;
      expect(disc.comparedValues?.fundFlowFeeReceived.value).toBe("200000");
      expect(disc.comparedValues?.aggregatedSettlement.value).toBe("118000");
    });
  });

  describe("T06: Completed work greater than project value", () => {
    it("preserves negative remaining work and flags discrepancy", () => {
      const sources = createSources({
        project: {
          id: "proj-t06",
          estimatedCost: dec("100000"),
          totalFee: dec("120000"),
        },
        fundFlow: {
          id: "ff-t06",
          miscExp: dec("0"),
          staffExp: dec("0"),
          totalProjectCost: dec("100000"),
          completedWorkAmt: dec("150000"),
          proposedDueBillAmount: dec("0"),
          feeReceived: dec("0"),
        },
      });

      const result = reconcileProject(sources);
      expect(result.projectWorkTotals.completedExceedsTotal).toBe(true);
      expect(result.projectWorkTotals.remainingWork?.toString()).toBe("-50000");
      expect(hasDiscrepancy(result, DiscrepancyCode.COMPLETED_WORK_EXCEEDS_TOTAL)).toBe(true);
    });
  });

  describe("T07: Missing WIP and/or FundFlow", () => {
    it("flags missing FundFlow record", () => {
      const sources = createSources({ fundFlow: null });
      const result = reconcileProject(sources);
      expect(result.calculationIndicators.missingFundFlow).toBe(true);
      expect(hasDiscrepancy(result, DiscrepancyCode.MISSING_FUND_FLOW)).toBe(true);
    });

    it("flags missing WIP record", () => {
      const sources = createSources({ wip: null });
      const result = reconcileProject(sources);
      expect(result.calculationIndicators.missingWip).toBe(true);
      expect(hasDiscrepancy(result, DiscrepancyCode.MISSING_WIP)).toBe(true);
    });

    it("emits UNSUPPORTED_CALCULATION when contract value cannot be determined", () => {
      const sources = createSources({
        project: {
          id: "proj-t07u",
          estimatedCost: null,
          totalFee: dec("600000"),
        },
        fundFlow: null,
      });
      const result = reconcileProject(sources);
      expect(result.projectWorkTotals.contractValue).toBeNull();
      expect(hasDiscrepancy(result, DiscrepancyCode.UNSUPPORTED_CALCULATION)).toBe(true);
      const disc = findDiscrepancy(result, DiscrepancyCode.UNSUPPORTED_CALCULATION)!;
      expect(disc.message).toContain("Cannot determine project contract value");
    });
  });

  describe("T08: Receipt amount without valid required date", () => {
    it("emits date discrepancy when receiveDate is null", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t08",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("50000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("50000"),
            billDate: new Date("2026-01-15"),
            receiveDate: null,
            status: "PARTIAL",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.RECEIPT_WITHOUT_DATE)).toBe(true);
    });
  });

  describe("T09: Cancelled invoice with payment details", () => {
    it("excludes cancelled bill from totals and detects contradiction", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t09-active",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("118000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("118000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
          {
            id: "db-t09-cancelled",
            grossAmount: dec("50000"),
            sgst: dec("4500"),
            cgst: dec("4500"),
            billAmount: dec("59000"),
            chequeAmount: dec("59000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("59000"),
            billDate: new Date("2026-03-15"),
            receiveDate: new Date("2026-04-01"),
            status: "CANCELLED",
          },
        ],
      });

      const result = reconcileProject(sources);
      // Cancelled bill excluded from totals
      expect(result.invoiceSettlementTotals.grossTotal.toString()).toBe("100000");
      expect(result.invoiceSettlementTotals.settlementTotal.toString()).toBe("118000");
      // But contradiction still detected
      expect(hasDiscrepancy(result, DiscrepancyCode.CANCELLED_BILL_WITH_PAYMENT)).toBe(true);
    });

    it("detects cancelled bill with negative payment components", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t09-neg",
            grossAmount: dec("50000"),
            sgst: dec("4500"),
            cgst: dec("4500"),
            billAmount: dec("59000"),
            chequeAmount: dec("-5000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("-5000"),
            billDate: new Date("2026-03-15"),
            receiveDate: new Date("2026-04-01"),
            status: "CANCELLED",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.CANCELLED_BILL_WITH_PAYMENT)).toBe(true);
      const disc = findDiscrepancy(result, DiscrepancyCode.CANCELLED_BILL_WITH_PAYMENT)!;
      expect(disc.comparedValues?.chequeAmount.value).toBe("-5000");
    });
  });

  describe("T10: Fractional financial amounts", () => {
    it("avoids binary floating-point drift with small fractions", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t10",
            grossAmount: dec("0.01"),
            sgst: dec("0.01"),
            cgst: dec("0.01"),
            billAmount: dec("0.03"),
            chequeAmount: dec("0.01"),
            sd: dec("0.01"),
            itTds: dec("0.01"),
            receivedAmount: dec("0.03"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
        ],
      });

      const result = reconcileProject(sources);
      // If using JS floating point, 0.01 + 0.01 + 0.01 could be 0.030000000000000002
      expect(result.invoiceSettlementTotals.invoiceTotal.toString()).toBe("0.03");
      expect(result.invoiceSettlementTotals.settlementTotal.toString()).toBe("0.03");
      expect(result.invoiceSettlementTotals.outstandingTotal.toString()).toBe("0");
    });
  });

  describe("T11: Fee stages do not equal contract fee", () => {
    it("emits discrepancy when fee stage sum differs from contract fee", () => {
      const sources = createSources({
        project: {
          id: "proj-t11",
          estimatedCost: dec("500000"),
          totalFee: dec("600000"),
        },
        feeStages: [
          { id: "fs-t11a", amount: dec("200000"), percentage: dec("33.33") },
          { id: "fs-t11b", amount: dec("200000"), percentage: dec("33.33") },
        ],
      });

      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.FEE_STAGES_MISMATCH)).toBe(true);
      expect(result.contractFeeTotals.feeStageDiscrepancy?.toString()).toBe("200000");
    });
  });

  describe("T12: Settlement exceeds invoice total", () => {
    it("emits over-settlement discrepancy", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t12",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("120000"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("120000"),
            billDate: new Date("2026-01-15"),
            receiveDate: new Date("2026-02-01"),
            status: "PAID",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.SETTLEMENT_EXCEEDS_INVOICE)).toBe(true);
    });
  });

  describe("T13: Missing or ambiguous source fields", () => {
    it("distinguishes unknown from zero when gross is positive but GST is zero", () => {
      const sources = createSources({
        dueBills: [
          {
            id: "db-t13",
            grossAmount: dec("100000"),
            sgst: dec("0"),
            cgst: dec("0"),
            billAmount: dec("100000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-15"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      });

      const result = reconcileProject(sources);
      expect(result.calculationIndicators.ambiguousGstData).toBe(true);
      expect(hasDiscrepancy(result, DiscrepancyCode.MISSING_AMBIGUOUS_SOURCE_DATA)).toBe(true);
    });

    it("flags missing DueBill records", () => {
      const sources = createSources({ dueBills: [] });
      const result = reconcileProject(sources);
      expect(hasDiscrepancy(result, DiscrepancyCode.MISSING_AMBIGUOUS_SOURCE_DATA)).toBe(true);
    });
  });

  describe("T15: Read-only behavior", () => {
    it("does not mutate input fixtures", () => {
      const sources = createSources();
      const original = cloneSources(sources);

      reconcileProject(sources);

      // Verify all monetary values are unchanged
      expect(sources.project.estimatedCost?.toString()).toBe(
        original.project.estimatedCost?.toString()
      );
      expect(sources.project.totalFee.toString()).toBe(original.project.totalFee.toString());
      expect(sources.fundFlow?.totalProjectCost.toString()).toBe(
        original.fundFlow?.totalProjectCost.toString()
      );
      expect(sources.dueBills[0].billAmount.toString()).toBe(
        original.dueBills[0].billAmount.toString()
      );
      expect(sources.wip?.amountOfWorkDone?.toString()).toBe(
        original.wip?.amountOfWorkDone?.toString()
      );
    });
  });
});
