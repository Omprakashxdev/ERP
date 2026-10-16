import { Decimal } from "@prisma/client/runtime/library";

// ─── Decimal helpers (same patterns as reconciliation.ts) ─────

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

// ─── Discrepancy codes ────────────────────────────────────────

export enum MonthlyDiscrepancyCode {
  MONTHLY_INCOME_MISMATCH = "MONTHLY_INCOME_MISMATCH",
  MONTHLY_NET_MISMATCH = "MONTHLY_NET_MISMATCH",
  MISSING_MONTHLY_RECORD = "MISSING_MONTHLY_RECORD",
  UNALLOCATED_INVOICE_DATE = "UNALLOCATED_INVOICE_DATE",
  UNALLOCATED_RECEIPT_DATE = "UNALLOCATED_RECEIPT_DATE",
}

export type MonthlyDiscrepancySeverity = "CRITICAL" | "WARNING" | "INFO";

export interface MonthlyComparedValue {
  value: string | number | null;
  source: string;
}

export interface MonthlyDiscrepancy {
  code: MonthlyDiscrepancyCode;
  severity: MonthlyDiscrepancySeverity;
  message: string;
  projectId: string;
  sourceModel: string;
  sourceRecordIds: string[];
  comparedValues?: Record<string, MonthlyComparedValue>;
  explanation: string;
}

// ─── Source record types ─────────────────────────────────────

export interface MonthlySourceProject {
  id: string;
  workOrderDate: Date | null;
}

export interface MonthlySourceFundFlowMonthly {
  id: string;
  month: number;
  year: number;
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  cumulative: Decimal;
}

export interface MonthlySourceFundFlow {
  id: string;
  monthlyData: MonthlySourceFundFlowMonthly[];
}

export interface MonthlySourceDueBill {
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

export interface MonthlyBreakdownSources {
  project: MonthlySourceProject;
  fundFlow: MonthlySourceFundFlow | null;
  dueBills: MonthlySourceDueBill[];
}

// ─── Result types ────────────────────────────────────────────

export interface MonthRecord {
  year: number;
  month: number;
  storedIncome: Decimal | null;
  storedExpense: Decimal | null;
  storedNet: Decimal | null;
  storedCumulative: Decimal | null;
  derivedInvoiced: Decimal | null;
  derivedReceived: Decimal | null;
  derivedCheque: Decimal | null;
  fundFlowMonthlyId: string | null;
  invoicedDueBillIds: string[];
  receivedDueBillIds: string[];
}

export interface MonthlySummary {
  totalStoredIncome: Decimal | null;
  totalStoredExpense: Decimal | null;
  totalStoredNet: Decimal | null;
  totalDerivedInvoiced: Decimal | null;
  totalDerivedReceived: Decimal | null;
  totalDerivedCheque: Decimal | null;
}

export interface MonthlyCalculationIndicators {
  hasFundFlowMonthlyData: boolean;
  hasBillDates: boolean;
  hasReceiveDates: boolean;
  missingDates: boolean;
}

export type MonthlyOverallStatus = "RECONCILED" | "DISCREPANCIES_FOUND" | "INSUFFICIENT_DATA";

export interface MonthlyBreakdownResult {
  projectId: string;
  fundFlowId: string | null;
  months: MonthRecord[];
  summary: MonthlySummary;
  discrepancies: MonthlyDiscrepancy[];
  calculationIndicators: MonthlyCalculationIndicators;
  overallStatus: MonthlyOverallStatus;
}

// ─── Key helpers ────────────────────────────────────────────

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function sumNullable(values: (Decimal | null | undefined)[]): Decimal | null {
  const hasValue = values.some((v) => v != null);
  if (!hasValue) return null;
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal("0.00"));
}

// ─── Monthly breakdown engine ────────────────────────────────

export function computeMonthlyBreakdown(
  sources: MonthlyBreakdownSources
): MonthlyBreakdownResult {
  const { project, fundFlow, dueBills } = sources;
  const discrepancies: MonthlyDiscrepancy[] = [];

  // ── Build FundFlowMonthly lookup ──
  const monthlyMap = new Map<string, MonthlySourceFundFlowMonthly>();
  if (fundFlow != null) {
    for (const m of fundFlow.monthlyData) {
      monthlyMap.set(monthKey(m.year, m.month), m);
    }
  }

  // ── Group DueBills by month ──
  const invoicedByMonth = new Map<string, { total: Decimal; ids: string[] }>();
  const receivedByMonth = new Map<string, { total: Decimal; chequeTotal: Decimal; ids: string[] }>();

  let hasBillDates = false;
  let hasReceiveDates = false;
  let missingDates = false;

  for (const bill of dueBills) {
    // Invoice grouping (active bills only, non-null billDate)
    if (bill.status !== "CANCELLED") {
      if (bill.billDate != null) {
        hasBillDates = true;
        const key = monthKey(bill.billDate.getFullYear(), bill.billDate.getMonth() + 1);
        const existing = invoicedByMonth.get(key);
        if (existing) {
          existing.total = existing.total.plus(d(bill.billAmount));
          existing.ids.push(bill.id);
        } else {
          invoicedByMonth.set(key, { total: d(bill.billAmount), ids: [bill.id] });
        }
      } else {
        // Active bill with null billDate is unallocated
        missingDates = true;
        discrepancies.push({
          code: MonthlyDiscrepancyCode.UNALLOCATED_INVOICE_DATE,
          severity: "WARNING",
          message: "Active invoice has no bill date and cannot be allocated to a month.",
          projectId: project.id,
          sourceModel: "DueBill",
          sourceRecordIds: [bill.id],
          comparedValues: {
            billAmount: { value: bill.billAmount.toString(), source: "DueBill.billAmount" },
            billDate: { value: null, source: "DueBill.billDate" },
          },
          explanation:
            "The invoice amount exists but the billing date is missing, so monthly invoiced totals cannot include this bill.",
        });
      }
    }

    // Receipt grouping (non-cancelled, non-null receiveDate, positive amounts)
    if (bill.status !== "CANCELLED") {
      const hasReceipt = gt(bill.receivedAmount, new Decimal("0")) || gt(bill.chequeAmount, new Decimal("0"));
      if (hasReceipt) {
        if (bill.receiveDate != null) {
          hasReceiveDates = true;
          const key = monthKey(bill.receiveDate.getFullYear(), bill.receiveDate.getMonth() + 1);
          const existing = receivedByMonth.get(key);
          if (existing) {
            existing.total = existing.total.plus(d(bill.receivedAmount));
            existing.chequeTotal = existing.chequeTotal.plus(d(bill.chequeAmount));
            existing.ids.push(bill.id);
          } else {
            receivedByMonth.set(key, {
              total: d(bill.receivedAmount),
              chequeTotal: d(bill.chequeAmount),
              ids: [bill.id],
            });
          }
        } else {
          // Positive receipt with null receiveDate is unallocated
          missingDates = true;
          discrepancies.push({
            code: MonthlyDiscrepancyCode.UNALLOCATED_RECEIPT_DATE,
            severity: "WARNING",
            message: "Receipt amount recorded without a receive date and cannot be allocated to a month.",
            projectId: project.id,
            sourceModel: "DueBill",
            sourceRecordIds: [bill.id],
            comparedValues: {
              receivedAmount: { value: bill.receivedAmount.toString(), source: "DueBill.receivedAmount" },
              chequeAmount: { value: bill.chequeAmount.toString(), source: "DueBill.chequeAmount" },
              receiveDate: { value: null, source: "DueBill.receiveDate" },
            },
            explanation:
              "A payment amount is present but the receive date is missing, so monthly receipt totals cannot include this bill.",
          });
        }
      }
    }
  }

  // ── Build union of all months ──
  const allKeys = new Set<string>([
    ...monthlyMap.keys(),
    ...invoicedByMonth.keys(),
    ...receivedByMonth.keys(),
  ]);

  const sortedKeys = Array.from(allKeys).sort((a, b) => a.localeCompare(b));

  // ── Build month records ──
  const months: MonthRecord[] = [];
  for (const key of sortedKeys) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const stored = monthlyMap.get(key) ?? null;
    const invoiced = invoicedByMonth.get(key) ?? null;
    const received = receivedByMonth.get(key) ?? null;

    const monthRecord: MonthRecord = {
      year,
      month,
      storedIncome: stored ? dNull(stored.income) : null,
      storedExpense: stored ? dNull(stored.expense) : null,
      storedNet: stored ? dNull(stored.net) : null,
      storedCumulative: stored ? dNull(stored.cumulative) : null,
      derivedInvoiced: invoiced ? dNull(invoiced.total) : null,
      derivedReceived: received ? dNull(received.total) : null,
      derivedCheque: received ? dNull(received.chequeTotal) : null,
      fundFlowMonthlyId: stored ? stored.id : null,
      invoicedDueBillIds: invoiced ? invoiced.ids : [],
      receivedDueBillIds: received ? received.ids : [],
    };

    months.push(monthRecord);

    // Variance: stored income vs derived invoiced
    if (monthRecord.storedIncome != null && monthRecord.derivedInvoiced != null) {
      if (!eq(monthRecord.storedIncome, monthRecord.derivedInvoiced)) {
        discrepancies.push({
          code: MonthlyDiscrepancyCode.MONTHLY_INCOME_MISMATCH,
          severity: "WARNING",
          message: `Monthly stored income does not match derived invoiced amount for ${key}.`,
          projectId: project.id,
          sourceModel: "FundFlowMonthly / DueBill",
          sourceRecordIds: [stored?.id ?? "", ...(invoiced ? invoiced.ids : [])].filter(Boolean),
          comparedValues: {
            storedIncome: {
              value: monthRecord.storedIncome.toString(),
              source: "FundFlowMonthly.income",
            },
            derivedInvoiced: {
              value: monthRecord.derivedInvoiced.toString(),
              source: "sum(DueBill.billAmount)",
            },
          },
          explanation:
            "The stored monthly income from FundFlowMonthly differs from the actual invoiced amounts aggregated from DueBills for this month.",
        });
      }
    }

    // Sanity check: stored net should equal stored income minus stored expense
    if (
      monthRecord.storedNet != null &&
      monthRecord.storedIncome != null &&
      monthRecord.storedExpense != null
    ) {
      const computedNet = monthRecord.storedIncome.minus(monthRecord.storedExpense);
      if (!eq(monthRecord.storedNet, computedNet)) {
        discrepancies.push({
          code: MonthlyDiscrepancyCode.MONTHLY_NET_MISMATCH,
          severity: "WARNING",
          message: `Monthly stored net does not equal stored income minus expense for ${key}.`,
          projectId: project.id,
          sourceModel: "FundFlowMonthly",
          sourceRecordIds: [stored?.id ?? ""].filter(Boolean),
          comparedValues: {
            storedNet: {
              value: monthRecord.storedNet.toString(),
              source: "FundFlowMonthly.net",
            },
            computedNet: {
              value: computedNet.toString(),
              source: "FundFlowMonthly.income - expense",
            },
          },
          explanation:
            "The stored net value is inconsistent with the stored income and expense values for this month.",
        });
      }
    }

    // Missing monthly record for a month with derived activity
    if (stored == null && (invoiced != null || received != null)) {
      discrepancies.push({
        code: MonthlyDiscrepancyCode.MISSING_MONTHLY_RECORD,
        severity: "INFO",
        message: `No FundFlowMonthly record found for ${key} but DueBill activity exists.`,
        projectId: project.id,
        sourceModel: "FundFlowMonthly",
        sourceRecordIds: [],
        comparedValues: {
          derivedInvoiced: {
            value: invoiced ? invoiced.total.toString() : null,
            source: "sum(DueBill.billAmount)",
          },
          derivedReceived: {
            value: received ? received.total.toString() : null,
            source: "sum(DueBill.receivedAmount)",
          },
        },
        explanation:
          "DueBills have dates falling in this month, but no corresponding FundFlowMonthly record exists. Monthly planning data may be incomplete.",
      });
    }
  }

  // ── Summary totals ──
  const totalStoredIncome = sumNullable(months.map((m) => m.storedIncome));
  const totalStoredExpense = sumNullable(months.map((m) => m.storedExpense));
  const totalStoredNet = sumNullable(months.map((m) => m.storedNet));
  const totalDerivedInvoiced = sumNullable(months.map((m) => m.derivedInvoiced));
  const totalDerivedReceived = sumNullable(months.map((m) => m.derivedReceived));
  const totalDerivedCheque = sumNullable(months.map((m) => m.derivedCheque));

  // ── Overall status ──
  const hasCritical = discrepancies.some((d) => d.severity === "CRITICAL");
  const hasWarning = discrepancies.some((d) => d.severity === "WARNING");
  const hasInfo = discrepancies.some((d) => d.severity === "INFO");
  let overallStatus: MonthlyOverallStatus;
  if (hasCritical || hasWarning) {
    overallStatus = "DISCREPANCIES_FOUND";
  } else if (missingDates || !hasBillDates || !hasReceiveDates || fundFlow?.monthlyData.length === 0) {
    overallStatus = "INSUFFICIENT_DATA";
  } else if (hasInfo) {
    // INFO-only discrepancies (like MISSING_MONTHLY_RECORD) still mean data is present but incomplete
    overallStatus = "INSUFFICIENT_DATA";
  } else {
    overallStatus = "RECONCILED";
  }

  return {
    projectId: project.id,
    fundFlowId: fundFlow?.id ?? null,
    months,
    summary: {
      totalStoredIncome,
      totalStoredExpense,
      totalStoredNet,
      totalDerivedInvoiced,
      totalDerivedReceived,
      totalDerivedCheque,
    },
    discrepancies,
    calculationIndicators: {
      hasFundFlowMonthlyData: fundFlow != null && fundFlow.monthlyData.length > 0,
      hasBillDates,
      hasReceiveDates,
      missingDates,
    },
    overallStatus,
  };
}
