// Confirmed Fund Flow monthly summary — Excel rows 12, 14, 16, 18.
//
// Row 12  Total Income per Month  = Σ saved project allocations for the month
// Row 14  Monthly expense (yellow) = Σ Staff Exp. of every project whose
//         [Start month … Start month + Target Time Limit − 1] span covers the
//         month. Fully derived — never manually entered, never persisted.
// Row 16  Monthly Net             = Row 12 − Row 14 (missing side counts as 0)
// Row 18  Cumulative Balance      = prev + Row 12 − Row 14, opening baseline 0
//
// Planned Fund Flow only — Row 18 is not a verified bank balance.

import { Decimal } from "@prisma/client/runtime/library";
import { MONTHLY_ALLOCATION_WINDOW } from "@/lib/fund-flow-window";
import type { MonthWindow } from "@/lib/fund-flow-window";

export interface ExpenseSourceProject {
  name: string;
  staffExp: Decimal | string | number | null;
  startMonth: number | null;
  startYear: number | null;
  targetTimeLimitMonths: Decimal | string | number | null;
}

export interface MissingExpenseConfig {
  projectName: string;
  /** Workbook headings for the absent/invalid timing values */
  missing: string[];
}

export interface ExpenseContributor {
  projectName: string;
  /** Serialized decimal string */
  staffExp: string;
}

export interface MonthlyReportRow {
  month: number;
  year: number;
  label: string;
  /** Row 12 — null when the month has no verified saved allocations */
  income: string | null;
  incomeUnavailableCount: number;
  /** Row 14 — derived expense; "0" when no project is in-span */
  expense: string;
  expenseContributors: ExpenseContributor[];
  /** Row 16 — income − expense; null only when both sides are empty */
  net: string | null;
  /** Row 18 — running balance from a zero baseline; defined for every month */
  cumulativeBalance: string;
  /** source data incomplete: projects lack timing config or income records
      were excluded — the expense figure may be understated */
  incomplete: boolean;
}

export interface ExpenseSpanWarning {
  projectName: string;
  targetTimeLimitMonths: string;
  monthsUsed: number;
  note: string;
}

export interface MonthlyReportComputation {
  months: MonthlyReportRow[];
  /** configured projects whose expense could not be scheduled */
  missingExpenseConfig: MissingExpenseConfig[];
  /**
   * Projects with a fractional Target Time Limit — the workbook establishes
   * no general rule for expense spans, so the span is rounded to the nearest
   * whole month and flagged here for confirmation rather than silently used.
   */
  expenseSpanWarnings: ExpenseSpanWarning[];
  /** Σ Row 12 over the window; null when no verified income exists */
  totalIncome: string | null;
  /** Σ Row 14 over the window */
  totalExpense: string;
}

const absMonth = (year: number, month: number) => year * 12 + (month - 1);

function toDecimal(v: Decimal | string | number | null | undefined): Decimal {
  if (v == null) return new Decimal("0");
  return v instanceof Decimal ? v : new Decimal(v.toString());
}

/**
 * Whole-window report computation — the single source for Rows 12–18.
 *
 * @param projects      fund-flow projects (name, Staff Exp., Start month,
 *                      Target Time Limit). Projects lacking timing config are
 *                      excluded from expenses and reported as missing —
 *                      timing values are never invented.
 * @param incomeByMonth verified Row 12 aggregates keyed "YYYY-M"
 * @param window        reporting months (default Apr 2026 – Mar 2028)
 */
export function computeMonthlyReport(
  projects: ExpenseSourceProject[],
  incomeByMonth: Map<
    string,
    { total: Decimal; projectCount: number; unavailableCount: number }
  >,
  window: MonthWindow[] = MONTHLY_ALLOCATION_WINDOW
): MonthlyReportComputation {
  const missingExpenseConfig: MissingExpenseConfig[] = [];
  const expenseSpanWarnings: ExpenseSpanWarning[] = [];

  // Resolve each project's expense span once
  const spans: {
    name: string;
    staffExp: Decimal;
    start: number;
    end: number; // inclusive absolute month index
  }[] = [];

  for (const p of projects) {
    const missing: string[] = [];
    if (
      p.startMonth == null ||
      p.startYear == null ||
      p.startMonth < 1 ||
      p.startMonth > 12
    ) {
      missing.push("Start month");
    }
    const rawTtl =
      p.targetTimeLimitMonths == null
        ? null
        : Number(p.targetTimeLimitMonths.toString());
    const ttl = rawTtl == null ? null : Math.round(rawTtl);
    if (ttl == null || ttl < 1) {
      missing.push("Target Time Limit (In Month)");
    }
    if (missing.length > 0) {
      missingExpenseConfig.push({ projectName: p.name, missing });
      continue;
    }
    if (rawTtl != null && !Number.isInteger(rawTtl)) {
      expenseSpanWarnings.push({
        projectName: p.name,
        targetTimeLimitMonths: p.targetTimeLimitMonths!.toString(),
        monthsUsed: ttl!,
        note:
          `fractional duration — expense applied over ${ttl} whole months ` +
          `(nearest); confirm the intended span`,
      });
    }
    const start = absMonth(p.startYear!, p.startMonth!);
    spans.push({
      name: p.name,
      staffExp: toDecimal(p.staffExp),
      start,
      end: start + ttl! - 1,
    });
  }

  const months: MonthlyReportRow[] = [];
  let running = new Decimal("0");
  let incomeTotal: Decimal | null = null;
  let expenseTotal = new Decimal("0");

  for (const { year, month, label } of window) {
    const here = absMonth(year, month);

    // Row 14 — every in-span project contributes its full Staff Exp.
    let expense = new Decimal("0");
    const contributors: ExpenseContributor[] = [];
    for (const s of spans) {
      if (here >= s.start && here <= s.end) {
        expense = expense.plus(s.staffExp);
        contributors.push({
          projectName: s.name,
          staffExp: s.staffExp.toString(),
        });
      }
    }

    // Row 12 — saved verified allocations only
    const agg = incomeByMonth.get(`${year}-${month}`);
    const income =
      agg && agg.projectCount > 0 ? agg.total : null;
    const incomeUnavailable = agg?.unavailableCount ?? 0;

    // Row 16 = Row 12 − Row 14; a missing side counts as 0 (Excel blank-cell
    // semantics). null only when neither side has any data.
    const hasIncome = income != null;
    const hasExpense = expense.gt(0);
    const net =
      hasIncome || hasExpense
        ? (income ?? new Decimal("0")).minus(expense)
        : null;

    // Row 18 — cumulative from zero baseline; defined every month
    running = running.plus(net ?? new Decimal("0"));

    if (income != null) {
      incomeTotal = (incomeTotal ?? new Decimal("0")).plus(income);
    }
    expenseTotal = expenseTotal.plus(expense);

    months.push({
      month,
      year,
      label,
      income: income != null ? income.toString() : null,
      incomeUnavailableCount: incomeUnavailable,
      expense: expense.toString(),
      expenseContributors: contributors,
      net: net != null ? net.toString() : null,
      cumulativeBalance: running.toString(),
      incomplete:
        missingExpenseConfig.length > 0 || incomeUnavailable > 0,
    });
  }

  return {
    months,
    missingExpenseConfig,
    expenseSpanWarnings,
    totalIncome: incomeTotal != null ? incomeTotal.toString() : null,
    totalExpense: expenseTotal.toString(),
  };
}
