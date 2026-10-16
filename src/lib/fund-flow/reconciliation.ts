import { Decimal } from "@prisma/client/runtime/library";

// ─── Decimal helpers ──────────────────────────────────────────

function d(value: Decimal | string | number | null | undefined): Decimal {
  if (value == null) return new Decimal("0.00");
  if (value instanceof Decimal) return new Decimal(value.toString());
  return new Decimal(String(value));
}

function dNull(value: Decimal | string | number | null | undefined): Decimal | null {
  if (value == null) return null;
  if (value instanceof Decimal) return new Decimal(value.toString());
  return new Decimal(String(value));
}

function eq(a: Decimal | null, b: Decimal | null): boolean {
  if (a == null || b == null) return false;
  return new Decimal(a.toString()).equals(new Decimal(b.toString()));
}

function gt(a: Decimal | null, b: Decimal | null): boolean {
  if (a == null || b == null) return false;
  return new Decimal(a.toString()).greaterThan(new Decimal(b.toString()));
}

function gte(a: Decimal | null, b: Decimal | null): boolean {
  if (a == null || b == null) return false;
  return new Decimal(a.toString()).greaterThanOrEqualTo(new Decimal(b.toString()));
}

function lt(a: Decimal | null, b: Decimal | null): boolean {
  if (a == null || b == null) return false;
  return new Decimal(a.toString()).lessThan(new Decimal(b.toString()));
}

function minus(a: Decimal | null, b: Decimal | null): Decimal | null {
  if (a == null || b == null) return null;
  return new Decimal(a.toString()).minus(new Decimal(b.toString()));
}

function plus(a: Decimal | null, b: Decimal | null): Decimal | null {
  if (a == null || b == null) return null;
  return new Decimal(a.toString()).plus(new Decimal(b.toString()));
}

function sum(values: (Decimal | null | undefined)[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal("0.00"));
}

// ─── Discrepancy codes ────────────────────────────────────────

export enum DiscrepancyCode {
  COMPLETED_WORK_EXCEEDS_TOTAL = "COMPLETED_WORK_EXCEEDS_TOTAL",
  PROJECT_FUND_FLOW_MISMATCH = "PROJECT_FUND_FLOW_MISMATCH",
  LEGACY_FEE_RECEIVED_MISMATCH = "LEGACY_FEE_RECEIVED_MISMATCH",
  SETTLEMENT_COMPONENTS_MISMATCH = "SETTLEMENT_COMPONENTS_MISMATCH",
  SETTLEMENT_EXCEEDS_INVOICE = "SETTLEMENT_EXCEEDS_INVOICE",
  FEE_STAGES_MISMATCH = "FEE_STAGES_MISMATCH",
  WIP_FUND_FLOW_DISAGREEMENT = "WIP_FUND_FLOW_DISAGREEMENT",
  RECEIPT_WITHOUT_DATE = "RECEIPT_WITHOUT_DATE",
  MISSING_FUND_FLOW = "MISSING_FUND_FLOW",
  MISSING_WIP = "MISSING_WIP",
  CANCELLED_BILL_WITH_PAYMENT = "CANCELLED_BILL_WITH_PAYMENT",
  CONTRADICTORY_PAYMENT_DETAILS = "CONTRADICTORY_PAYMENT_DETAILS",
  MISSING_AMBIGUOUS_SOURCE_DATA = "MISSING_AMBIGUOUS_SOURCE_DATA",
  UNSUPPORTED_CALCULATION = "UNSUPPORTED_CALCULATION",
}

export type DiscrepancySeverity = "CRITICAL" | "WARNING" | "INFO";

export interface ComparedValue {
  value: string | number | null;
  source: string;
}

export interface Discrepancy {
  code: DiscrepancyCode;
  severity: DiscrepancySeverity;
  message: string;
  projectId: string;
  sourceModel: string;
  sourceRecordIds: string[];
  comparedValues?: Record<string, ComparedValue>;
  explanation: string;
}

// ─── Source record types ─────────────────────────────────────

export interface SourceProject {
  id: string;
  estimatedCost: Decimal | null;
  totalFee: Decimal;
}

export interface SourceFundFlow {
  id: string;
  miscExp: Decimal;
  staffExp: Decimal;
  totalProjectCost: Decimal;
  completedWorkAmt: Decimal;
  proposedDueBillAmount: Decimal;
  feeReceived: Decimal;
}

export interface SourceDueBill {
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
}

export interface SourceWip {
  id: string;
  amountOfWorkDone: Decimal | null;
  finalProgressAmount: Decimal | null;
  raBill1Amount: Decimal | null;
  raBill2Amount: Decimal | null;
  raBill3Amount: Decimal | null;
  raBill4Amount: Decimal | null;
  raBill1SaecFee: Decimal | null;
  raBill2SaecFee: Decimal | null;
  raBill3SaecFee: Decimal | null;
  raBill4SaecFee: Decimal | null;
  raBill1ProjectExpense: Decimal | null;
  raBill2ProjectExpense: Decimal | null;
  raBill3ProjectExpense: Decimal | null;
  raBill4ProjectExpense: Decimal | null;
}

export interface SourceFeeStage {
  id: string;
  amount: Decimal;
  percentage: Decimal | null;
}

export interface ReconciliationSourceRecords {
  project: SourceProject;
  fundFlow: SourceFundFlow | null;
  dueBills: SourceDueBill[];
  wip: SourceWip | null;
  feeStages: SourceFeeStage[];
}

// ─── Result types ─────────────────────────────────────────────

export interface ProjectWorkTotals {
  contractValue: Decimal | null;
  contractValueSource: string;
  completedWork: Decimal | null;
  remainingWork: Decimal | null;
  completedExceedsTotal: boolean;
}

export interface ContractFeeTotals {
  contractFee: Decimal;
  feeStageSum: Decimal;
  feeStageDiscrepancy: Decimal | null;
}

export interface LegacyFundFlowTotals {
  totalProjectCost: Decimal | null;
  completedWorkAmt: Decimal | null;
  feeReceived: Decimal | null;
  proposedDueBillAmount: Decimal | null;
}

export interface InvoiceSettlementTotals {
  grossTotal: Decimal;
  sgstTotal: Decimal;
  cgstTotal: Decimal;
  invoiceTotal: Decimal;
  chequeTotal: Decimal;
  sdTotal: Decimal;
  tdsTotal: Decimal;
  settlementTotal: Decimal;
  outstandingTotal: Decimal;
}

export interface RecordedCash {
  chequeTotal: Decimal;
  withLimitation: boolean;
  explanation: string;
}

export interface WipComparison {
  amountOfWorkDone: Decimal | null;
  raBillAmountSum: Decimal | null;
  finalProgressAmount: Decimal | null;
  totalSaecFee: Decimal | null;
  totalProjectExpense: Decimal | null;
  balanceWorkAmount: Decimal | null;
}

export interface CalculationIndicators {
  missingFundFlow: boolean;
  missingWip: boolean;
  missingFeeStages: boolean;
  ambiguousGstData: boolean;
}

export type OverallStatus = "RECONCILED" | "DISCREPANCIES_FOUND" | "INSUFFICIENT_DATA";

export interface ReconciliationResult {
  projectId: string;
  sourceRecordIds: {
    projectId: string;
    fundFlowId?: string;
    wipId?: string;
    dueBillIds: string[];
    feeStageIds: string[];
  };
  projectWorkTotals: ProjectWorkTotals;
  contractFeeTotals: ContractFeeTotals;
  legacyFundFlowTotals: LegacyFundFlowTotals;
  invoiceSettlementTotals: InvoiceSettlementTotals;
  recordedCash: RecordedCash;
  wipComparison: WipComparison;
  discrepancies: Discrepancy[];
  calculationIndicators: CalculationIndicators;
  overallStatus: OverallStatus;
}

// ─── Reconciliation engine ────────────────────────────────────

export function reconcileProject(
  sources: ReconciliationSourceRecords
): ReconciliationResult {
  const { project, fundFlow, dueBills, wip, feeStages } = sources;
  const discrepancies: Discrepancy[] = [];

  // ── Missing record indicators ──
  const missingFundFlow = fundFlow == null;
  const missingWip = wip == null;
  const missingFeeStages = feeStages.length === 0;
  let ambiguousGstData = false;

  if (missingFundFlow) {
    discrepancies.push({
      code: DiscrepancyCode.MISSING_FUND_FLOW,
      severity: "WARNING",
      message: "No FundFlow record found for this project.",
      projectId: project.id,
      sourceModel: "FundFlow",
      sourceRecordIds: [],
      explanation:
        "FundFlow is expected for project-level cost and work tracking. Comparisons relying on FundFlow fields are unavailable.",
    });
  }

  if (missingWip) {
    discrepancies.push({
      code: DiscrepancyCode.MISSING_WIP,
      severity: "WARNING",
      message: "No WorkInProgress record found for this project.",
      projectId: project.id,
      sourceModel: "WorkInProgress",
      sourceRecordIds: [],
      explanation:
        "WIP tracks work performed and RA bill details. Comparisons relying on WIP fields are unavailable.",
    });
  }

  // ── Project work totals ──
  const contractValue = project.estimatedCost ?? fundFlow?.totalProjectCost ?? null;
  const contractValueSource = project.estimatedCost != null ? "Project.estimatedCost" : fundFlow != null ? "FundFlow.totalProjectCost" : "unknown";

  if (contractValue == null) {
    discrepancies.push({
      code: DiscrepancyCode.UNSUPPORTED_CALCULATION,
      severity: "INFO",
      message: "Cannot determine project contract value from available sources.",
      projectId: project.id,
      sourceModel: "Project / FundFlow",
      sourceRecordIds: [project.id],
      explanation:
        "Both Project.estimatedCost and FundFlow.totalProjectCost are null or missing. Work-value comparisons and remaining-work calculations cannot be performed.",
    });
  }

  const completedWork = fundFlow?.completedWorkAmt ?? null;
  let remainingWork: Decimal | null = null;
  let completedExceedsTotal = false;

  if (contractValue != null && completedWork != null) {
    remainingWork = minus(contractValue, completedWork);
    if (gt(completedWork, contractValue)) {
      completedExceedsTotal = true;
      discrepancies.push({
        code: DiscrepancyCode.COMPLETED_WORK_EXCEEDS_TOTAL,
        severity: "CRITICAL",
        message: "Completed work amount exceeds total project value.",
        projectId: project.id,
        sourceModel: "FundFlow",
        sourceRecordIds: fundFlow ? [fundFlow.id] : [],
        comparedValues: {
          completedWork: { value: completedWork.toString(), source: "FundFlow.completedWorkAmt" },
          contractValue: { value: contractValue.toString(), source: contractValueSource },
        },
        explanation:
          "Completed work should not exceed the total project value. Verify data entry or project scope.",
      });
    }
  }

  if (
    project.estimatedCost != null &&
    fundFlow != null &&
    !eq(project.estimatedCost, fundFlow.totalProjectCost)
  ) {
    discrepancies.push({
      code: DiscrepancyCode.PROJECT_FUND_FLOW_MISMATCH,
      severity: "WARNING",
      message: "Project estimated cost does not match FundFlow total project cost.",
      projectId: project.id,
      sourceModel: "Project / FundFlow",
      sourceRecordIds: [project.id, fundFlow.id],
      comparedValues: {
        projectEstimatedCost: {
          value: project.estimatedCost.toString(),
          source: "Project.estimatedCost",
        },
        fundFlowTotalProjectCost: {
          value: fundFlow.totalProjectCost.toString(),
          source: "FundFlow.totalProjectCost",
        },
      },
      explanation:
        "The project-level estimated cost and FundFlow total project cost should agree. Investigate which is authoritative.",
    });
  }

  // ── Contract fee and fee stages ──
  const contractFee = project.totalFee;
  const feeStageSum = sum(feeStages.map((s) => s.amount));
  let feeStageDiscrepancy: Decimal | null = null;

  if (feeStages.length > 0) {
    feeStageDiscrepancy = minus(contractFee, feeStageSum);
    if (feeStageDiscrepancy != null && !feeStageDiscrepancy.equals(new Decimal("0.00"))) {
      discrepancies.push({
        code: DiscrepancyCode.FEE_STAGES_MISMATCH,
        severity: "WARNING",
        message: "Sum of fee stages does not equal the contract fee.",
        projectId: project.id,
        sourceModel: "ProjectFeeStage",
        sourceRecordIds: feeStages.map((s) => s.id),
        comparedValues: {
          contractFee: { value: contractFee.toString(), source: "Project.totalFee" },
          feeStageSum: { value: feeStageSum.toString(), source: "sum(ProjectFeeStage.amount)" },
        },
        explanation:
          "Fee stage allocations should sum to the total contract fee. Review stage definitions or amounts.",
      });
    }
  }

  // ── DueBill aggregation and per-bill checks ──
  let grossTotal = new Decimal("0.00");
  let sgstTotal = new Decimal("0.00");
  let cgstTotal = new Decimal("0.00");
  let invoiceTotal = new Decimal("0.00");
  let chequeTotal = new Decimal("0.00");
  let sdTotal = new Decimal("0.00");
  let tdsTotal = new Decimal("0.00");
  let settlementTotal = new Decimal("0.00");
  let outstandingTotal = new Decimal("0.00");

  for (const bill of dueBills) {
    const computedBillAmount = d(bill.grossAmount).plus(d(bill.sgst)).plus(d(bill.cgst));
    const computedReceivedAmount = d(bill.chequeAmount).plus(d(bill.sd)).plus(d(bill.itTds));

    // Contradictory stored vs computed values
    if (!eq(bill.billAmount, computedBillAmount)) {
      discrepancies.push({
        code: DiscrepancyCode.CONTRADICTORY_PAYMENT_DETAILS,
        severity: "CRITICAL",
        message: "Stored billAmount does not match computed gross + SGST + CGST.",
        projectId: project.id,
        sourceModel: "DueBill",
        sourceRecordIds: [bill.id],
        comparedValues: {
          storedBillAmount: { value: bill.billAmount.toString(), source: "DueBill.billAmount" },
          computedBillAmount: { value: computedBillAmount.toString(), source: "gross + sgst + cgst" },
        },
        explanation:
          "The stored invoice total differs from the arithmetic sum of its components. This may indicate a data integrity issue.",
      });
    }

    if (!eq(bill.receivedAmount, computedReceivedAmount)) {
      discrepancies.push({
        code: DiscrepancyCode.CONTRADICTORY_PAYMENT_DETAILS,
        severity: "CRITICAL",
        message: "Stored receivedAmount does not match computed cheque + SD + TDS.",
        projectId: project.id,
        sourceModel: "DueBill",
        sourceRecordIds: [bill.id],
        comparedValues: {
          storedReceivedAmount: {
            value: bill.receivedAmount.toString(),
            source: "DueBill.receivedAmount",
          },
          computedReceivedAmount: {
            value: computedReceivedAmount.toString(),
            source: "cheque + sd + itTds",
          },
        },
        explanation:
          "The stored settlement total differs from the arithmetic sum of its components. This may indicate a data integrity issue.",
      });
    }

    // GST ambiguity: if gross > 0 and both sgst and cgst are 0, flag ambiguity
    if (gt(bill.grossAmount, new Decimal("0")) && eq(bill.sgst, new Decimal("0")) && eq(bill.cgst, new Decimal("0"))) {
      ambiguousGstData = true;
      discrepancies.push({
        code: DiscrepancyCode.MISSING_AMBIGUOUS_SOURCE_DATA,
        severity: "INFO",
        message: "Invoice has a positive gross amount but zero GST components.",
        projectId: project.id,
        sourceModel: "DueBill",
        sourceRecordIds: [bill.id],
        comparedValues: {
          grossAmount: { value: bill.grossAmount.toString(), source: "DueBill.grossAmount" },
          sgst: { value: bill.sgst.toString(), source: "DueBill.sgst" },
          cgst: { value: bill.cgst.toString(), source: "DueBill.cgst" },
        },
        explanation:
          "GST components are zero despite a positive gross amount. Verify whether the invoice is GST-exempt or whether tax data is missing.",
      });
    }

    // Cancelled bill checks
    if (bill.status === "CANCELLED") {
      if (
        !eq(bill.chequeAmount, new Decimal("0")) ||
        !eq(bill.receivedAmount, new Decimal("0")) ||
        !eq(bill.sd, new Decimal("0")) ||
        !eq(bill.itTds, new Decimal("0"))
      ) {
        discrepancies.push({
          code: DiscrepancyCode.CANCELLED_BILL_WITH_PAYMENT,
          severity: "WARNING",
          message: "Cancelled invoice contains settlement or receipt amounts.",
          projectId: project.id,
          sourceModel: "DueBill",
          sourceRecordIds: [bill.id],
          comparedValues: {
            chequeAmount: { value: bill.chequeAmount.toString(), source: "DueBill.chequeAmount" },
            receivedAmount: { value: bill.receivedAmount.toString(), source: "DueBill.receivedAmount" },
            sd: { value: bill.sd.toString(), source: "DueBill.sd" },
            itTds: { value: bill.itTds.toString(), source: "DueBill.itTds" },
          },
          explanation:
            "A cancelled bill should not have payment or settlement entries. Review whether the cancellation was correctly applied or whether payments need to be reversed.",
        });
      }
      // Do not include cancelled bills in active totals
      continue;
    }

    // Receipt without date
    if (
      (gt(bill.chequeAmount, new Decimal("0")) || gt(bill.receivedAmount, new Decimal("0"))) &&
      bill.receiveDate == null
    ) {
      discrepancies.push({
        code: DiscrepancyCode.RECEIPT_WITHOUT_DATE,
        severity: "WARNING",
        message: "Receipt or settlement amount recorded without a receive date.",
        projectId: project.id,
        sourceModel: "DueBill",
        sourceRecordIds: [bill.id],
        comparedValues: {
          chequeAmount: { value: bill.chequeAmount.toString(), source: "DueBill.chequeAmount" },
          receivedAmount: { value: bill.receivedAmount.toString(), source: "DueBill.receivedAmount" },
          receiveDate: { value: null, source: "DueBill.receiveDate" },
        },
        explanation:
          "A payment amount is present but the receive date is missing. This limits audit traceability and cash-flow dating.",
      });
    }

    // Over-settlement
    if (gt(bill.receivedAmount, bill.billAmount)) {
      discrepancies.push({
        code: DiscrepancyCode.SETTLEMENT_EXCEEDS_INVOICE,
        severity: "CRITICAL",
        message: "Settlement amount exceeds invoice total.",
        projectId: project.id,
        sourceModel: "DueBill",
        sourceRecordIds: [bill.id],
        comparedValues: {
          receivedAmount: { value: bill.receivedAmount.toString(), source: "DueBill.receivedAmount" },
          billAmount: { value: bill.billAmount.toString(), source: "DueBill.billAmount" },
        },
        explanation:
          "The settlement total is greater than the invoice total. Verify whether an overpayment, duplicate entry, or credit note exists.",
      });
    }

    grossTotal = grossTotal.plus(d(bill.grossAmount));
    sgstTotal = sgstTotal.plus(d(bill.sgst));
    cgstTotal = cgstTotal.plus(d(bill.cgst));
    invoiceTotal = invoiceTotal.plus(d(bill.billAmount));
    chequeTotal = chequeTotal.plus(d(bill.chequeAmount));
    sdTotal = sdTotal.plus(d(bill.sd));
    tdsTotal = tdsTotal.plus(d(bill.itTds));
    settlementTotal = settlementTotal.plus(d(bill.receivedAmount));
    outstandingTotal = outstandingTotal.plus(
      d(bill.billAmount).minus(d(bill.receivedAmount))
    );
  }

  // ── Legacy FundFlow feeReceived comparison ──
  if (fundFlow != null) {
    const aggregatedReceived = settlementTotal;
    if (!eq(fundFlow.feeReceived, aggregatedReceived)) {
      discrepancies.push({
        code: DiscrepancyCode.LEGACY_FEE_RECEIVED_MISMATCH,
        severity: "WARNING",
        message: "Legacy FundFlow feeReceived does not match aggregated DueBill settlement.",
        projectId: project.id,
        sourceModel: "FundFlow / DueBill",
        sourceRecordIds: [fundFlow.id],
        comparedValues: {
          fundFlowFeeReceived: {
            value: fundFlow.feeReceived.toString(),
            source: "FundFlow.feeReceived",
          },
          aggregatedSettlement: {
            value: aggregatedReceived.toString(),
            source: "sum(DueBill.receivedAmount) excluding cancelled",
          },
        },
        explanation:
          "FundFlow.feeReceived is a legacy single-field summary. It may differ from aggregated DueBill settlements due to timing, cancelled bills, or manual adjustments. These fields may represent different accounting concepts.",
      });
    }
  }

  // ── WIP comparison ──
  let wipAmountOfWorkDone: Decimal | null = null;
  let wipRaBillAmountSum: Decimal | null = null;
  let wipFinalProgressAmount: Decimal | null = null;
  let wipTotalSaecFee: Decimal | null = null;
  let wipTotalProjectExpense: Decimal | null = null;
  let wipBalanceWorkAmount: Decimal | null = null;

  if (wip != null) {
    wipAmountOfWorkDone = dNull(wip.amountOfWorkDone);
    wipFinalProgressAmount = dNull(wip.finalProgressAmount);

    wipRaBillAmountSum = sum([
      wip.raBill1Amount,
      wip.raBill2Amount,
      wip.raBill3Amount,
      wip.raBill4Amount,
    ]);

    wipTotalSaecFee = sum([
      wip.raBill1SaecFee,
      wip.raBill2SaecFee,
      wip.raBill3SaecFee,
      wip.raBill4SaecFee,
    ]);

    wipTotalProjectExpense = sum([
      wip.raBill1ProjectExpense,
      wip.raBill2ProjectExpense,
      wip.raBill3ProjectExpense,
      wip.raBill4ProjectExpense,
    ]);

    if (wipAmountOfWorkDone != null && wipRaBillAmountSum != null) {
      wipBalanceWorkAmount = wipAmountOfWorkDone.minus(wipRaBillAmountSum);
    }

    // Compare WIP amountOfWorkDone with FundFlow completedWorkAmt
    if (wipAmountOfWorkDone != null && fundFlow != null) {
      if (!eq(wipAmountOfWorkDone, fundFlow.completedWorkAmt)) {
        discrepancies.push({
          code: DiscrepancyCode.WIP_FUND_FLOW_DISAGREEMENT,
          severity: "WARNING",
          message: "WIP amount of work done differs from FundFlow completed work amount.",
          projectId: project.id,
          sourceModel: "WorkInProgress / FundFlow",
          sourceRecordIds: [wip.id, fundFlow.id],
          comparedValues: {
            wipAmountOfWorkDone: {
              value: wipAmountOfWorkDone.toString(),
              source: "WorkInProgress.amountOfWorkDone",
            },
            fundFlowCompletedWorkAmt: {
              value: fundFlow.completedWorkAmt.toString(),
              source: "FundFlow.completedWorkAmt",
            },
          },
          explanation:
            "WIP and FundFlow track completed work using different fields. These may differ legitimately (e.g., billed vs performed), but the difference should be understood.",
        });
      }
    }
  }

  // ── Missing/ambiguous data catch-all ──
  if (dueBills.length === 0) {
    discrepancies.push({
      code: DiscrepancyCode.MISSING_AMBIGUOUS_SOURCE_DATA,
      severity: "INFO",
      message: "No DueBill records found for this project.",
      projectId: project.id,
      sourceModel: "DueBill",
      sourceRecordIds: [],
      explanation:
        "Without DueBill records, invoice-level settlement and cash receipt reconciliation cannot be performed.",
    });
  }

  // ── Unsupported calculation note ──
  // Schema does not contain a "totalFee" on FundFlow, so legacy FundFlow total fee comparison is unsupported.
  // We emit nothing here because the absence of the field is handled by omission, but if the prompt expects
  // an explicit unsupported flag when a requested comparison is impossible, we can add one. For now we document
  // it in the report explanation.

  // ── Overall status ──
  const hasCritical = discrepancies.some((d) => d.severity === "CRITICAL");
  const hasWarning = discrepancies.some((d) => d.severity === "WARNING");
  let overallStatus: OverallStatus;
  if (hasCritical || hasWarning) {
    overallStatus = "DISCREPANCIES_FOUND";
  } else if (missingFundFlow || missingWip || dueBills.length === 0) {
    overallStatus = "INSUFFICIENT_DATA";
  } else {
    overallStatus = "RECONCILED";
  }

  return {
    projectId: project.id,
    sourceRecordIds: {
      projectId: project.id,
      fundFlowId: fundFlow?.id,
      wipId: wip?.id,
      dueBillIds: dueBills.map((b) => b.id),
      feeStageIds: feeStages.map((s) => s.id),
    },
    projectWorkTotals: {
      contractValue,
      contractValueSource,
      completedWork,
      remainingWork,
      completedExceedsTotal,
    },
    contractFeeTotals: {
      contractFee,
      feeStageSum,
      feeStageDiscrepancy,
    },
    legacyFundFlowTotals: {
      totalProjectCost: fundFlow?.totalProjectCost ?? null,
      completedWorkAmt: fundFlow?.completedWorkAmt ?? null,
      feeReceived: fundFlow?.feeReceived ?? null,
      proposedDueBillAmount: fundFlow?.proposedDueBillAmount ?? null,
    },
    invoiceSettlementTotals: {
      grossTotal,
      sgstTotal,
      cgstTotal,
      invoiceTotal,
      chequeTotal,
      sdTotal,
      tdsTotal,
      settlementTotal,
      outstandingTotal,
    },
    recordedCash: {
      chequeTotal,
      withLimitation: true,
      explanation:
        "The schema does not confirm whether chequeAmount represents a cleared receipt or merely an entered figure. Actual cash received may differ. SD and IT/TDS are non-cash deductions and are not included in cash received.",
    },
    wipComparison: {
      amountOfWorkDone: wipAmountOfWorkDone,
      raBillAmountSum: wipRaBillAmountSum,
      finalProgressAmount: wipFinalProgressAmount,
      totalSaecFee: wipTotalSaecFee,
      totalProjectExpense: wipTotalProjectExpense,
      balanceWorkAmount: wipBalanceWorkAmount,
    },
    discrepancies,
    calculationIndicators: {
      missingFundFlow,
      missingWip,
      missingFeeStages,
      ambiguousGstData,
    },
    overallStatus,
  };
}
