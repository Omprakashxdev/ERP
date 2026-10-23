"use server";

import { Decimal } from "@prisma/client/runtime/library";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

// ─── 24-month window matching Excel V–AS (Apr 2026 – Mar 2028) ──
// NOTE: Workbook formulas (e.g., remainingFee / N) are not reproduced here.
//       Every value is explicitly entered by the user.

// MonthWindow / MONTHLY_ALLOCATION_WINDOW live in @/lib/fund-flow-window so
// client components can use them without importing a "use server" module.
export type { MonthWindow } from "@/lib/fund-flow-window";
import { MONTHLY_ALLOCATION_WINDOW } from "@/lib/fund-flow-window";

import {
  computeMonthlyReport,
  type ExpenseSourceProject,
  type MissingExpenseConfig,
  type ExpenseContributor,
  type ExpenseSpanWarning,
} from "@/lib/fund-flow-summary";
import { computeEqualInstallments } from "@/lib/fund-flow-calcs";

const windowKeySet = new Set(
  MONTHLY_ALLOCATION_WINDOW.map((m) => `${m.year}-${m.month}`)
);

// ─── Types ──────────────────────────────────────────────────────

export interface MonthlyAllocation {
  month: number;
  year: number;
  /** Serialized decimal string — class instances cannot cross the RSC boundary. */
  amount: string | null;
  /** true if a record exists but its meaning is ambiguous (no audit provenance) */
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface MonthlyAllocationResult {
  allocations: MonthlyAllocation[];
  /** Serialized decimal string — class instances cannot cross the RSC boundary. */
  total: string | null;
}

export interface MonthlyIncomeSummary {
  month: number;
  year: number;
  label: string;
  /** The confirmed report covers every month of the Apr 2026 – Mar 2028
      window — kept for interface compatibility, always true. */
  formulaCovered: boolean;
  /** Serialized decimal string — class instances cannot cross the RSC boundary. */
  totalIncome: string | null;
  /** Number of projects with valid allocations for this month */
  projectCount: number;
  /** Number of projects with ambiguous/unavailable allocations for this month */
  unavailableCount: number;
}

// ─── Schemas ────────────────────────────────────────────────────

const upsertSchema = z.object({
  projectId: z.string().cuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  amount: z.string().nullable(),
});

// ─── Helpers ────────────────────────────────────────────────────

function isSafeWorkbookRecord(m: {
  expense: Decimal | null;
  net: Decimal | null;
  cumulative: Decimal | null;
}): boolean {
  const exp = dZero(m.expense);
  const net = dZero(m.net);
  const cum = dZero(m.cumulative);
  return exp.equals(0) && net.equals(0) && cum.equals(0);
}

function dZero(v: Decimal | null | undefined): Decimal {
  if (v == null) return new Decimal("0");
  return new Decimal(v.toString());
}

async function fetchProvenanceSet(
  recordIds: string[],
  entity: string = "FundFlowMonthly",
  source: string = "ff-01k-workbook-allocation"
): Promise<Set<string>> {
  if (recordIds.length === 0) return new Set();
  const entries = await prisma.auditLog.findMany({
    where: {
      entity,
      entityId: { in: recordIds },
      action: "create",
      metadata: {
        path: ["source"],
        equals: source,
      },
    },
    select: { entityId: true },
  });
  return new Set(
    entries.map((e) => e.entityId).filter(Boolean) as string[]
  );
}

// ─── Read ───────────────────────────────────────────────────────

export async function getMonthlyAllocations(
  projectId: string
): Promise<ActionResult<MonthlyAllocationResult>> {
  return withPermission("fundFlow", "read", async () => {
    const parsedId = z.string().cuid().parse(projectId);

    const fundFlow = await prisma.fundFlow.findUnique({
      where: { projectId: parsedId },
      include: { monthlyData: true },
    });

    if (!fundFlow) {
      return {
        allocations: MONTHLY_ALLOCATION_WINDOW.map(({ year, month }) => ({
          month,
          year,
          amount: null,
        })),
        total: null,
      };
    }

    const recordIds = fundFlow.monthlyData.map((m) => m.id);
    const provenanceSet = await fetchProvenanceSet(recordIds);

    const allocationMap = new Map<string, MonthlyAllocation>();
    for (const m of fundFlow.monthlyData) {
      const key = `${m.year}-${String(m.month).padStart(2, "0")}`;

      // Non-zero expense/net/cumulative means the record was created with a
      // different meaning — ignore entirely (treated as missing).
      if (!isSafeWorkbookRecord(m)) continue;

      // Zero expense/net/cumulative is necessary but not sufficient.
      // Without audit provenance the record's origin is ambiguous.
      if (!provenanceSet.has(m.id)) {
        allocationMap.set(key, {
          month: m.month,
          year: m.year,
          amount: null,
          unavailable: true,
          unavailableReason:
            "Historical record without audit provenance — unavailable for editing",
        });
        continue;
      }

      allocationMap.set(key, {
        month: m.month,
        year: m.year,
        amount: m.income.toString(),
      });
    }

    const allocations: MonthlyAllocation[] = MONTHLY_ALLOCATION_WINDOW.map(
      ({ year, month }) => {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        return allocationMap.get(key) ?? { month, year, amount: null };
      }
    );

    const total = allocations.reduce<Decimal | null>((acc, a) => {
      if (a.amount == null) return acc;
      return acc ? acc.plus(a.amount) : new Decimal(a.amount);
    }, null);

    return { allocations, total: total != null ? total.toString() : null };
  });
}

// ─── Write ──────────────────────────────────────────────────────

export async function upsertMonthlyAllocation(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return withPermission("fundFlow", "update", async (user) => {
    const parsed = upsertSchema.parse(input);
    await checkRateLimit(user.id);

    // Reject out-of-window writes
    const reqKey = `${parsed.year}-${parsed.month}`;
    if (!windowKeySet.has(reqKey)) {
      throw new Error(
        `Month ${parsed.month}/${parsed.year} is outside the supported 24-month allocation window.`
      );
    }

    const fundFlow = await prisma.fundFlow.findUnique({
      where: { projectId: parsed.projectId },
    });

    if (!fundFlow) {
      throw new Error("FundFlow not found for project");
    }

    // Find existing record
    const existing = await prisma.fundFlowMonthly.findUnique({
      where: {
        fundFlowId_month_year: {
          fundFlowId: fundFlow.id,
          month: parsed.month,
          year: parsed.year,
        },
      },
    });

    // Blank input is a no-op: never delete existing data.
    if (parsed.amount == null || parsed.amount.trim() === "") {
      return { id: existing?.id ?? "" };
    }

    // Validate amount is a valid decimal with at most 6 fractional digits
    // (income column is DECIMAL(23,6)); Postgres would silently round
    // beyond that, so reject explicitly instead.
    let amountDecimal: Decimal;
    try {
      amountDecimal = new Decimal(parsed.amount);
      if (!amountDecimal.isFinite()) throw new Error();
    } catch {
      throw new Error("Invalid monetary amount.");
    }
    if (amountDecimal.decimalPlaces() > 6) {
      throw new Error("Amount must have up to 6 decimal places.");
    }

    if (existing) {
      // Safety: do not overwrite records whose expense/net/cumulative are non-zero.
      // Those records may have been created with a different meaning.
      if (!isSafeWorkbookRecord(existing)) {
        throw new Error(
          "Cannot update existing FundFlowMonthly record: non-zero expense/net/cumulative indicates it was created with a different meaning."
        );
      }

      // Provenance: zero EDC alone is not sufficient. Without an audit trail
      // we cannot confirm the record was created by FF-01K.
      const provenance = await fetchProvenanceSet([existing.id]);
      if (!provenance.has(existing.id)) {
        throw new Error(
          "Cannot update existing FundFlowMonthly record: audit provenance missing — the record's meaning is ambiguous."
        );
      }

      // Update ONLY income; never touch expense, net, or cumulative.
      await prisma.fundFlowMonthly.update({
        where: { id: existing.id },
        data: { income: amountDecimal },
      });

      await audit(user.id, "update", "FundFlowMonthly", existing.id, {
        source: "ff-01k-workbook-allocation",
        input: await sanitizeForAudit({
          projectId: parsed.projectId,
          month: parsed.month,
          year: parsed.year,
          amount: parsed.amount,
        }),
      });

      return { id: existing.id };
    }

    // Create new record
    const record = await prisma.fundFlowMonthly.create({
      data: {
        fundFlowId: fundFlow.id,
        month: parsed.month,
        year: parsed.year,
        income: amountDecimal,
        expense: new Decimal("0.00"),
        net: new Decimal("0.00"),
        cumulative: new Decimal("0.00"),
      },
    });

    await audit(user.id, "create", "FundFlowMonthly", record.id, {
      source: "ff-01k-workbook-allocation",
      input: await sanitizeForAudit({
        projectId: parsed.projectId,
        month: parsed.month,
        year: parsed.year,
        amount: parsed.amount,
      }),
    });

    return { id: record.id };
  });
}

// ─── Monthly Income Summary (FF-01L: Excel Row 12) ───────────────

interface IncomeMonthAggregate {
  total: Decimal;
  projectCount: number;
  unavailableCount: number;
}

interface FundFlowReportRow {
  staffExp: Decimal;
  distributionStartMonth: number | null;
  distributionStartYear: number | null;
  project: { name: string; targetTimeLimitMonths: Decimal | null } | null;
  monthlyData: {
    id: string;
    month: number;
    year: number;
    income: Decimal;
    expense: Decimal | null;
    net: Decimal | null;
    cumulative: Decimal | null;
  }[];
}

/**
 * Single report query — Row 12 income aggregates + Row 14 expense sources.
 * One findMany serves both sides so income and expenses cannot diverge.
 */
async function loadReportComputation() {
  const allFundFlows = (await prisma.fundFlow.findMany({
    select: {
      staffExp: true,
      distributionStartMonth: true,
      distributionStartYear: true,
      project: { select: { name: true, targetTimeLimitMonths: true } },
      monthlyData: {
        select: {
          id: true,
          month: true,
          year: true,
          income: true,
          expense: true,
          net: true,
          cumulative: true,
        },
      },
    },
  })) as FundFlowReportRow[];

  const incomeByMonth = await aggregateIncomeByMonth(allFundFlows);

  const projects: ExpenseSourceProject[] = allFundFlows.map((ff) => ({
    name: ff.project?.name ?? "Unknown project",
    staffExp: ff.staffExp,
    startMonth: ff.distributionStartMonth,
    startYear: ff.distributionStartYear,
    targetTimeLimitMonths: ff.project?.targetTimeLimitMonths ?? null,
  }));

  return computeMonthlyReport(projects, incomeByMonth);
}

interface FundFlowWithMonthlyData {
  monthlyData: {
    id: string;
    month: number;
    year: number;
    income: Decimal;
    expense: Decimal | null;
    net: Decimal | null;
    cumulative: Decimal | null;
  }[];
}

/** Verified workbook income aggregated per month key "YYYY-M". */
async function aggregateIncomeByMonth(
  allFundFlows: FundFlowWithMonthlyData[]
): Promise<Map<string, IncomeMonthAggregate>> {
  // Fetch all audit provenance for all monthly records in one query
  const allMonthlyIds = allFundFlows.flatMap((ff) => ff.monthlyData.map((m) => m.id));
  const provenanceSet = await fetchProvenanceSet(allMonthlyIds);

  const monthlyAggregates = new Map<string, IncomeMonthAggregate>();

  for (const fundFlow of allFundFlows) {
    for (const m of fundFlow.monthlyData) {
      const key = `${m.year}-${m.month}`;

      // Skip if outside 24-month window
      if (!windowKeySet.has(key)) continue;

      // Skip records with non-zero expense/net/cumulative (different meaning)
      if (!isSafeWorkbookRecord(m)) continue;

      const existing = monthlyAggregates.get(key) ?? {
        total: new Decimal("0"),
        projectCount: 0,
        unavailableCount: 0,
      };

      if (!provenanceSet.has(m.id)) {
        // Ambiguous record - count as unavailable
        existing.unavailableCount += 1;
        monthlyAggregates.set(key, existing);
        continue;
      }

      existing.total = existing.total.plus(new Decimal(m.income.toString()));
      existing.projectCount += 1;
      monthlyAggregates.set(key, existing);
    }
  }

  return monthlyAggregates;
}

export async function getMonthlyIncomeSummary(): Promise<ActionResult<MonthlyIncomeSummary[]>> {
  return withPermission("fundFlow", "read", async () => {
    // Confirmed rule: Row 12 = Σ saved allocations — the whole Apr 2026 –
    // Mar 2028 window is covered, not the workbook's old 15-column boundary.
    const monthlyAggregates = await aggregateIncomeByMonth(
      (await prisma.fundFlow.findMany({
        select: {
          monthlyData: {
            select: {
              id: true,
              month: true,
              year: true,
              income: true,
              expense: true,
              net: true,
              cumulative: true,
            },
          },
        },
      })) as FundFlowWithMonthlyData[]
    );

    const summary: MonthlyIncomeSummary[] = MONTHLY_ALLOCATION_WINDOW.map(
      ({ year, month, label }) => {
        const key = `${year}-${month}`;
        const agg = monthlyAggregates.get(key);

        return {
          month,
          year,
          label,
          formulaCovered: true,
          totalIncome:
            agg && agg.projectCount > 0 ? agg.total.toString() : null,
          projectCount: agg?.projectCount ?? 0,
          unavailableCount: agg?.unavailableCount ?? 0,
        };
      }
    );

    return summary;
  });
}

// ─── Derived Monthly Expenses (confirmed Excel Row 14) ──────────
// Row 14 is AUTOMATIC: each project contributes its saved Staff Exp. in
// every month of [Start month … Start month + Target Time Limit − 1].
// It is never entered manually and never persisted. Projects missing a
// Start month or Target Time Limit are excluded and flagged — timing is
// never invented for legacy rows.

export interface MonthlyExpense {
  month: number;
  year: number;
  /** Serialized decimal string — derived expense ("0" when nothing applies) */
  amount: string;
  /** in-span projects contributing their Staff Exp. this month */
  contributors: ExpenseContributor[];
}

export interface MonthlyExpenseResult {
  expenses: MonthlyExpense[];
  /** Serialized decimal sum of derived monthly expenses across the window */
  total: string;
  /** projects excluded from Row 14 for missing timing configuration */
  missingExpenseConfig: MissingExpenseConfig[];
  /** projects with a fractional Target Time Limit — span is rounded and flagged */
  expenseSpanWarnings: ExpenseSpanWarning[];
}

export async function getMonthlyExpenses(): Promise<ActionResult<MonthlyExpenseResult>> {
  return withPermission("fundFlow", "read", async () => {
    const report = await loadReportComputation();

    return {
      expenses: report.months.map((m) => ({
        month: m.month,
        year: m.year,
        amount: m.expense,
        contributors: m.expenseContributors,
      })),
      total: report.totalExpense,
      missingExpenseConfig: report.missingExpenseConfig,
      expenseSpanWarnings: report.expenseSpanWarnings,
    };
  });
}

// ─── Write ──────────────────────────────────────────────────────
// Row 14 is now DERIVED from each project's Staff Exp. and schedule —
// manual monthly-expense entry no longer exists. Legacy
// FundFlowMonthlyExpense records are preserved untouched; the calculated
// report never reads them, so they can neither be edited nor double-counted.

export async function upsertMonthlyExpense(
  _input: unknown
): Promise<ActionResult<{ id: string }>> {
  return withPermission("fundFlow", "update", async () => {
    throw new Error(
      "Monthly expense (Row 14) is calculated automatically from each project's Staff Exp. across its Start month and Target Time Limit — it cannot be entered manually. Set the project's Staff Exp., Start month and Target Time Limit instead."
    );
  });
}

// ─── Planned Net (confirmed Excel Row 16) ───────────────────────
// Row 16 = Row 12 − Row 14 for every month of the Apr 2026 – Mar 2028
// window (the confirmed report covers all 24 months, not the workbook's
// old V16:AJ16 formula range). A missing side counts as 0 — Excel
// blank-cell semantics. Row 16 is computed on read and never persisted.

export interface PlannedNetMonth {
  month: number;
  year: number;
  label: string;
  /** confirmed report covers every window month */
  formulaCovered: boolean;
  /** income − expense; null only when neither side has data.
      Serialized decimal string — class instances cannot cross the RSC boundary. */
  plannedNet: string | null;
  /** verified Row 12 workbook allocations exist for this month */
  incomePresent: boolean;
  /** at least one project contributes a derived expense this month */
  expensePresent: boolean;
  /** ambiguous income records excluded from this month's Row 12 */
  excludedCount: number;
  /** expense may be understated (missing project timing config) or
      income records were excluded — treated as 0 in the arithmetic */
  incomplete: boolean;
}

export interface PlannedNetResult {
  months: PlannedNetMonth[];
  /** total income − total expenses over the whole window.
      Serialized decimal string. */
  totalNet: string | null;
  totalIncomplete: boolean;
  missingExpenseConfig: MissingExpenseConfig[];
}

export async function getMonthlyPlannedNet(): Promise<ActionResult<PlannedNetResult>> {
  return withPermission("fundFlow", "read", async () => {
    const report = await loadReportComputation();

    const months: PlannedNetMonth[] = report.months.map((m) => ({
      month: m.month,
      year: m.year,
      label: m.label,
      formulaCovered: true,
      plannedNet: m.net,
      incomePresent: m.income != null,
      expensePresent: m.expenseContributors.length > 0,
      excludedCount: m.incomeUnavailableCount,
      incomplete: m.incomplete,
    }));

    const totalNet =
      report.totalIncome != null || !new Decimal(report.totalExpense).isZero()
        ? new Decimal(report.totalIncome ?? "0")
            .minus(report.totalExpense)
            .toString()
        : null;

    return {
      months,
      totalNet,
      totalIncomplete:
        report.missingExpenseConfig.length > 0 ||
        months.some((m) => m.excludedCount > 0),
      missingExpenseConfig: report.missingExpenseConfig,
    };
  });
}

// ─── Planned Running Balance (confirmed Excel Row 18) ───────────
// First month:  V18 = V12 − V14              (opening baseline 0)
// Later months: W18 = V18 + W12 − W14        (carry-forward)
// The confirmed report covers all 24 window months; a missing side counts
// as 0. This is a planned figure from an implied zero baseline — NOT a
// verified bank balance. Computed on read; never persisted.

export interface RunningBalanceMonth {
  month: number;
  year: number;
  label: string;
  /** confirmed report covers every window month */
  formulaCovered: boolean;
  /** carried balance for the month — defined for every window month.
      Serialized decimal string — class instances cannot cross the RSC boundary. */
  runningBalance: string | null;
  /** months up to and including this one whose source data is incomplete
      (excluded income records or projects missing timing config) */
  gapMonths: number;
  /** true when the carried balance reflects incomplete source data */
  incomplete: boolean;
}

export interface RunningBalanceResult {
  months: RunningBalanceMonth[];
  missingExpenseConfig: MissingExpenseConfig[];
}

export async function getMonthlyRunningBalance(): Promise<ActionResult<RunningBalanceResult>> {
  return withPermission("fundFlow", "read", async () => {
    const report = await loadReportComputation();

    let gapMonths = 0;
    const months: RunningBalanceMonth[] = report.months.map((m) => {
      if (m.incomplete) gapMonths += 1;
      return {
        month: m.month,
        year: m.year,
        label: m.label,
        formulaCovered: true,
        runningBalance: m.cumulativeBalance,
        gapMonths,
        incomplete: m.incomplete || gapMonths > 0,
      };
    });

    return { months, missingExpenseConfig: report.missingExpenseConfig };
  });
}

// ─── Monthly Income Plan (Phase 1 — workbook-verified installment rules) ────
//
// Verified workbook rule shapes (Fund Flow sheet, rows 6/8/9):
//   monthly amount = fee basis ÷ N installments, consecutive months.
//   Verified bases: R = Total Fee (Y6:AP6 uses $R6/18), U = Remaining Fee
//   (=R−T, e.g. Y6 uses $U6/18, AA8 uses $U8/4), T = legacy Fee Received
//   (V9:W9 uses $T9/2). The ERP reproduces the rule *shape*; the user
//   chooses the basis, count and start month — the workbook supplies no
//   universal per-project rule, so nothing is auto-derived for new projects.

export type PlanBasis = "TOTAL_FEE" | "REMAINING_FEE" | "LEGACY_FEE_RECEIVED";

const monthlyPlanSchema = z.object({
  projectId: z.string().cuid(),
  basis: z.enum(["TOTAL_FEE", "REMAINING_FEE", "LEGACY_FEE_RECEIVED"]),
  installments: z.number().int().min(1).max(24),
  startMonth: z.number().int().min(1).max(12),
  startYear: z.number().int().min(2000).max(2100),
  /** Verified workbook schedule shapes. EVEN = same basis ÷ N every
      month (existing behaviour, uses `basis`). REMAINING_FIRST =
      month 1 uses remaining fee ÷ N, months 2..N use total fee ÷ N
      (rows 6/8: Y6=$U6/18 then Z6:AP6=$R6/18). RECEIVED_THEN_REMAINDER =
      months 1..N−1 use fee received ÷ (N−1), last month uses the
      remainder total − received (row 9: V9:W9=$T9/2, X9=U9). */
  schedule: z
    .enum(["EVEN", "REMAINING_FIRST", "RECEIVED_THEN_REMAINDER"])
    .optional(),
  /** Months ("YYYY-M") the user explicitly chose to replace with the
      calculated amount. Absent = keep every existing value. */
  replace: z.array(z.string().regex(/^\d{4}-\d{1,2}$/)).max(24).optional(),
});

export type MonthlyPlanStatus =
  | "create"
  | "keep"
  | "conflict"
  | "blocked"
  | "outside";

export interface MonthlyPlanItem {
  month: number;
  year: number;
  label: string;
  /** Planned amount as a 6dp string, or null if outside the window. */
  plannedAmount: string | null;
  /** Existing verified allocation (6dp string) if the month is occupied. */
  existingAmount: string | null;
  status: MonthlyPlanStatus;
  note: string;
  /** Plain-language calculation basis for this month, e.g. "total fee ÷ 18". */
  calcNote: string;
}

export interface MonthlyPlanPreview {
  basis: PlanBasis;
  schedule: "EVEN" | "REMAINING_FIRST" | "RECEIVED_THEN_REMAINDER";
  basisLabel: string;
  /** The fee figure used as the divisor source, or null if unavailable. */
  basisAmount: string | null;
  installments: number;
  perMonth: string | null;
  plannedTotal: string | null;
  items: MonthlyPlanItem[];
  createCount: number;
  keepCount: number;
  conflictCount: number;
  blockedCount: number;
  outsideCount: number;
  /** Saved allocations in window months beyond the workbook's Row 12–18
      formula coverage (after Jul 2027 / AJ). Stored but not summarized. */
  outsideCoverage: { month: number; year: number; label: string; amount: string }[];
  /** Present when the plan cannot be generated for this project. */
  unavailableReason: string | null;
}

const BASIS_LABELS: Record<PlanBasis, string> = {
  TOTAL_FEE: "Total fee",
  REMAINING_FEE: "Remaining fee (total fee minus fee already received)",
  LEGACY_FEE_RECEIVED: "Fee already received (legacy figure — unverified)",
};

function labelFor(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

/** Compute the plan preview — shared by the read-only preview and the
    atomic confirm so the client can never supply its own amounts. */
async function computeMonthlyPlan(
  parsed: z.infer<typeof monthlyPlanSchema>
): Promise<MonthlyPlanPreview> {
  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { id: true, name: true, totalFee: true },
  });
  if (!project) throw new Error("Project not found.");

  const fundFlow = await prisma.fundFlow.findUnique({
    where: { projectId: parsed.projectId },
    include: { monthlyData: true },
  });

  const schedule = parsed.schedule ?? "EVEN";
  const totalFee = new Decimal(project.totalFee.toString());
  const feeReceived =
    fundFlow != null ? new Decimal(fundFlow.feeReceived.toString()) : null;
  const remainingFee = feeReceived != null ? totalFee.minus(feeReceived) : null;
  const n = parsed.installments;

  // Resolve the fee basis(es) from existing ERP fields.
  let basisAmount: Decimal | null = null;
  let unavailableReason: string | null = null;
  if (schedule === "EVEN") {
    if (parsed.basis === "TOTAL_FEE") {
      basisAmount = totalFee;
    } else {
      if (!fundFlow) {
        unavailableReason =
          "This project has no fund flow record yet — save the financial details first, or enter monthly amounts manually.";
      } else if (parsed.basis === "REMAINING_FEE") {
        basisAmount = remainingFee;
      } else {
        basisAmount = feeReceived;
      }
    }
  } else {
    // Mixed schedules need the fund flow record (fee received).
    if (!fundFlow) {
      unavailableReason =
        "This project has no fund flow record yet — save the financial details first, or enter monthly amounts manually.";
    } else if (schedule === "REMAINING_FIRST") {
      basisAmount = totalFee; // spread across remaining (first) + total
    } else {
      // RECEIVED_THEN_REMAINDER — needs a nonzero received amount and ≥2 months.
      if (n < 2) {
        unavailableReason =
          "This schedule needs at least 2 months — the fee already received is spread over the earlier months and the remainder goes in the last month.";
      } else if (feeReceived == null || feeReceived.lte(0)) {
        unavailableReason =
          "No received fee is recorded for this project, so this schedule cannot be used. Choose another basis or enter amounts manually.";
      }
      basisAmount = unavailableReason ? null : totalFee;
    }
  }

  if (!unavailableReason && basisAmount != null && basisAmount.lte(0)) {
    unavailableReason =
      parsed.basis === "LEGACY_FEE_RECEIVED" && schedule === "EVEN"
        ? "No received fee is recorded for this project, so a plan cannot be prepared from that figure. Choose another basis or enter amounts manually."
        : parsed.basis === "REMAINING_FEE" && schedule === "EVEN"
          ? "The remaining fee is zero for this project — nothing left to distribute. Choose another basis or enter amounts manually."
          : "The total fee is zero for this project — nothing to distribute. Enter amounts manually.";
    basisAmount = null;
  }

  // Per-index amount + plain-language basis note. EVEN installments split
  // the basis equally at 6dp with the rounding residual absorbed by the
  // last month, so the plan always totals exactly the basis amount.
  const evenInstallments =
    schedule === "EVEN" && basisAmount != null
      ? computeEqualInstallments(basisAmount, n)
      : null;
  const perMonth = evenInstallments?.[0] ?? null;
  const amountFor = (i: number): Decimal | null => {
    if (unavailableReason || basisAmount == null) return null;
    if (schedule === "EVEN") return evenInstallments![i];
    if (schedule === "REMAINING_FIRST") {
      return i === 0
        ? remainingFee!.div(n).toDecimalPlaces(6)
        : totalFee.div(n).toDecimalPlaces(6);
    }
    // RECEIVED_THEN_REMAINDER
    return i < n - 1
      ? feeReceived!.div(n - 1).toDecimalPlaces(6)
      : totalFee.minus(feeReceived!).toDecimalPlaces(6);
  };
  const calcNoteFor = (i: number): string => {
    if (schedule === "REMAINING_FIRST") {
      return i === 0 ? `remaining fee ÷ ${n}` : `total fee ÷ ${n}`;
    }
    if (schedule === "RECEIVED_THEN_REMAINDER") {
      return i < n - 1
        ? `fee received ÷ ${n - 1}`
        : "remainder (total − received)";
    }
    const base =
      parsed.basis === "TOTAL_FEE"
        ? `total fee ÷ ${n}`
        : parsed.basis === "REMAINING_FEE"
          ? `remaining fee ÷ ${n}`
          : `fee received ÷ ${n}`;
    return i === n - 1 &&
      evenInstallments != null &&
      !evenInstallments[n - 1].equals(perMonth!)
      ? `${base} + rounding remainder`
      : base;
  };

  const provenanceSet = fundFlow
    ? await fetchProvenanceSet(fundFlow.monthlyData.map((m) => m.id))
    : new Set<string>();
  const byKey = new Map(
    (fundFlow?.monthlyData ?? []).map((m) => [`${m.year}-${m.month}`, m])
  );

  const items: MonthlyPlanItem[] = [];
  let cursor = { y: parsed.startYear, m: parsed.startMonth };
  for (let i = 0; i < parsed.installments; i++) {
    const { y, m } = cursor;
    const key = `${y}-${m}`;
    const label = labelFor(m, y);
    const existing = byKey.get(key);

    let status: MonthlyPlanStatus = "create";
    let note = "Will be created";
    let existingAmount: string | null = null;

    if (!windowKeySet.has(key)) {
      status = "outside";
      note = "Outside the plan window (Apr 2026 – Mar 2028) — not created";
    } else if (existing && !isSafeWorkbookRecord(existing)) {
      status = "blocked";
      note =
        "An existing record with a different meaning occupies this month — left untouched";
    } else if (existing && !provenanceSet.has(existing.id)) {
      status = "blocked";
      note =
        "An older record without verified history occupies this month — left untouched";
    } else if (existing) {
      const income = new Decimal(existing.income.toString());
      const planned = amountFor(i);
      existingAmount = income.toString();
      if (planned != null && income.equals(planned)) {
        status = "keep";
        note = "Already has this amount — kept unchanged";
      } else {
        // Different saved value — a conflict the user resolves explicitly.
        status = "conflict";
        note =
          income.gt(0)
            ? "Already has a different amount"
            : "Already entered as zero";
      }
    }

    const plannedForItem = status === "outside" ? null : amountFor(i);
    items.push({
      month: m,
      year: y,
      label,
      plannedAmount: plannedForItem?.toString() ?? null,
      existingAmount,
      status,
      note,
      calcNote: calcNoteFor(i),
    });

    cursor = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  }

  const plannedTotal = items.reduce<Decimal | null>((acc, item) => {
    if (item.status !== "create" || item.plannedAmount == null) return acc;
    const v = new Decimal(item.plannedAmount);
    return acc ? acc.plus(v) : v;
  }, null);

  // Saved allocations in window months beyond Row 12–18 formula coverage
  // (coverage is V–AJ = the first 15 window months, Apr 2026 – Jul 2027).
  const coverageKeySet = new Set(
    MONTHLY_ALLOCATION_WINDOW.slice(0, 15).map(({ year, month }) => `${year}-${month}`)
  );
  const outsideCoverage = (fundFlow?.monthlyData ?? [])
    .filter(
      (m) =>
        windowKeySet.has(`${m.year}-${m.month}`) &&
        !coverageKeySet.has(`${m.year}-${m.month}`) &&
        isSafeWorkbookRecord(m) &&
        provenanceSet.has(m.id)
    )
    .map((m) => ({
      month: m.month,
      year: m.year,
      label: labelFor(m.month, m.year),
      amount: new Decimal(m.income.toString()).toString(),
    }));

  return {
    basis: parsed.basis,
    schedule,
    basisLabel:
      schedule === "REMAINING_FIRST"
        ? "Total fee — first month from remaining fee, the rest from total fee"
        : schedule === "RECEIVED_THEN_REMAINDER"
          ? "Total fee — fee already received split evenly, remainder in the last month"
          : BASIS_LABELS[parsed.basis],
    basisAmount: basisAmount?.toString() ?? null,
    installments: parsed.installments,
    perMonth: perMonth?.toString() ?? null,
    plannedTotal: plannedTotal?.toString() ?? null,
    items,
    createCount: items.filter((i) => i.status === "create").length,
    keepCount: items.filter((i) => i.status === "keep").length,
    conflictCount: items.filter((i) => i.status === "conflict").length,
    blockedCount: items.filter((i) => i.status === "blocked").length,
    outsideCount: items.filter((i) => i.status === "outside").length,
    outsideCoverage,
    unavailableReason,
  };
}

export async function previewMonthlyPlan(
  input: unknown
): Promise<ActionResult<MonthlyPlanPreview>> {
  return withPermission("fundFlow", "read", async () => {
    const parsed = monthlyPlanSchema.parse(input);
    return computeMonthlyPlan(parsed);
  });
}

export async function applyMonthlyPlan(
  input: unknown
): Promise<ActionResult<{ created: number; kept: number; replaced: number }>> {
  return withPermission("fundFlow", "update", async (user) => {
    const parsed = monthlyPlanSchema.parse(input);
    await checkRateLimit(user.id);

    // Recompute server-side — the preview is advisory only.
    const preview = await computeMonthlyPlan(parsed);
    if (preview.unavailableReason) {
      throw new Error(preview.unavailableReason);
    }
    const toCreate = preview.items.filter((i) => i.status === "create");
    const replaceSet = new Set(parsed.replace ?? []);
    const toReplace = preview.items.filter(
      (i) => i.status === "conflict" && replaceSet.has(`${i.year}-${i.month}`)
    );
    // Silently ignore replace keys that are not conflicts — nothing else
    // may be overwritten.
    if (toCreate.length === 0 && toReplace.length === 0) {
      throw new Error(
        "Nothing to save — every planned month already has a value or is outside the plan window."
      );
    }

    const fundFlow = await prisma.fundFlow.findUnique({
      where: { projectId: parsed.projectId },
      select: { id: true },
    });
    if (!fundFlow) {
      throw new Error(
        "Save the project's financial details first — monthly allocations are stored on the fund flow record."
      );
    }

    // Atomic: verify each target month is still empty inside the transaction,
    // create the record, then write its provenance audit entry — all or none.
    let created = 0;
    let replaced = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of toCreate) {
        const clash = await tx.fundFlowMonthly.findUnique({
          where: {
            fundFlowId_month_year: {
              fundFlowId: fundFlow.id,
              month: item.month,
              year: item.year,
            },
          },
        });
        if (clash) {
          throw new Error(
            `Month ${labelFor(item.month, item.year)} was filled by someone else while you were reviewing — nothing was saved. Re-open the plan to see the latest values.`
          );
        }
        const rec = await tx.fundFlowMonthly.create({
          data: {
            fundFlowId: fundFlow.id,
            month: item.month,
            year: item.year,
            income: new Decimal(item.plannedAmount!),
            expense: new Decimal("0.00"),
            net: new Decimal("0.00"),
            cumulative: new Decimal("0.00"),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "create",
            entity: "FundFlowMonthly",
            entityId: rec.id,
            metadata: {
              source: "ff-01k-workbook-allocation",
              generatedBy: "monthly-income-plan",
              planBasis: parsed.basis,
              installments: parsed.installments,
              startMonth: parsed.startMonth,
              startYear: parsed.startYear,
            },
          },
        });
        created++;
      }

      for (const item of toReplace) {
        const rec = await tx.fundFlowMonthly.findUnique({
          where: {
            fundFlowId_month_year: {
              fundFlowId: fundFlow.id,
              month: item.month,
              year: item.year,
            },
          },
        });
        if (!rec) {
          throw new Error(
            `Month ${item.label} changed while you were reviewing — nothing was saved. Re-open the plan to see the latest values.`
          );
        }
        if (!isSafeWorkbookRecord(rec)) {
          throw new Error(
            `Month ${item.label} is protected — left untouched. Nothing was saved.`
          );
        }
        // Stale-update guard: saved amount must still equal what the user saw.
        const current = new Decimal(rec.income.toString());
        if (!current.equals(new Decimal(item.existingAmount!))) {
          throw new Error(
            `Month ${item.label} was changed to ${current.toString()} by someone else while you were reviewing — nothing was saved. Re-open the plan to see the latest values.`
          );
        }
        const provCount = await tx.auditLog.count({
          where: {
            entity: "FundFlowMonthly",
            entityId: rec.id,
            action: "create",
            metadata: {
              path: ["source"],
              equals: "ff-01k-workbook-allocation",
            },
          },
        });
        if (provCount === 0) {
          throw new Error(
            `Month ${item.label} has an ambiguous record without verified history — left untouched. Nothing was saved.`
          );
        }

        const newAmount = new Decimal(item.plannedAmount!);
        await tx.fundFlowMonthly.update({
          where: { id: rec.id },
          data: { income: newAmount },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "update",
            entity: "FundFlowMonthly",
            entityId: rec.id,
            metadata: {
              source: "ff-01k-workbook-allocation",
              generatedBy: "monthly-income-plan",
              oldValue: item.existingAmount,
              newValue: item.plannedAmount,
              planBasis: parsed.basis,
              installments: parsed.installments,
              startMonth: parsed.startMonth,
              startYear: parsed.startYear,
            },
          },
        });
        replaced++;
      }
    });

    await audit(user.id, "create", "FundFlow", fundFlow.id, {
      source: "monthly-income-plan",
      projectId: parsed.projectId,
      basis: parsed.basis,
      installments: parsed.installments,
      monthsCreated: created,
      monthsReplaced: replaced,
    });

    return { created, kept: preview.keepCount + (preview.conflictCount - replaced), replaced };
  });
}

// ─── Row 12 project breakdown (read-only, report UI) ────────────

export interface MonthlyIncomeBreakdownRow {
  projectId: string;
  projectName: string;
  clientName: string;
  regionName: string;
  /** Serialized decimal string — Row 12 contribution for this project. */
  income: string;
}

export interface MonthlyIncomeBreakdownResult {
  /** Whether the month falls inside the workbook Row 12 formula range
      (Apr 2026 – Jun 2027). Outside it, allocations are never summed. */
  formulaCovered: boolean;
  rows: MonthlyIncomeBreakdownRow[];
  /** Serialized decimal sum of the verified contributing rows (Row 12 parity). */
  total: string | null;
  /** Allocations that exist for the month but cannot be counted toward
      Row 12 — ambiguous provenance or non-income-bearing records. */
  excluded: { projectName: string; reason: string }[];
}

export async function getMonthlyIncomeBreakdown(
  month: number,
  year: number
): Promise<ActionResult<MonthlyIncomeBreakdownResult>> {
  return withPermission("fundFlow", "read", async () => {
    const parsed = z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .parse({ month, year });

    const index = MONTHLY_ALLOCATION_WINDOW.findIndex(
      (w) => w.month === parsed.month && w.year === parsed.year
    );
    // The confirmed report covers the full Apr 2026 – Mar 2028 window.
    const formulaCovered = index >= 0;

    const records = await prisma.fundFlowMonthly.findMany({
      where: { month: parsed.month, year: parsed.year },
      include: {
        fundFlow: {
          include: { project: { include: { client: true, region: true } } },
        },
      },
    });

    const provenanceSet = await fetchProvenanceSet(records.map((r) => r.id));

    const rows: MonthlyIncomeBreakdownRow[] = [];
    const excluded: { projectName: string; reason: string }[] = [];
    let total: Decimal | null = null;

    for (const r of records) {
      const projectName = r.fundFlow?.project?.name ?? "Unknown project";
      if (!isSafeWorkbookRecord(r)) {
        excluded.push({
          projectName,
          reason: "Record carries non-income fields — not a Row 12 allocation",
        });
        continue;
      }
      if (!provenanceSet.has(r.id)) {
        excluded.push({
          projectName,
          reason: "Allocation lacks verified workbook provenance",
        });
        continue;
      }
      if (r.fundFlow?.project) {
        rows.push({
          projectId: r.fundFlow.project.id,
          projectName,
          clientName: r.fundFlow.project.client.name,
          regionName: r.fundFlow.project.region.name,
          income: r.income.toString(),
        });
        total = (total ?? new Decimal("0")).plus(new Decimal(r.income.toString()));
      }
    }

    rows.sort((a, b) => a.projectName.localeCompare(b.projectName));

    return {
      formulaCovered,
      rows,
      total: total != null ? total.toString() : null,
      excluded,
    };
  });
}
