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

export interface MonthWindow {
  year: number;
  month: number;
  label: string;
}

export const MONTHLY_ALLOCATION_WINDOW: MonthWindow[] = (() => {
  const months: MonthWindow[] = [];
  const startYear = 2026;
  const startMonth = 4; // April
  for (let i = 0; i < 24; i++) {
    const monthIndex = startMonth - 1 + i; // 0-based
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const d = new Date(year, month - 1, 1);
    months.push({
      year,
      month,
      label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }),
    });
  }
  return months;
})();

const windowKeySet = new Set(
  MONTHLY_ALLOCATION_WINDOW.map((m) => `${m.year}-${m.month}`)
);

// ─── Types ──────────────────────────────────────────────────────

export interface MonthlyAllocation {
  month: number;
  year: number;
  amount: Decimal | null;
  /** true if a record exists but its meaning is ambiguous (no audit provenance) */
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface MonthlyAllocationResult {
  allocations: MonthlyAllocation[];
  total: Decimal | null;
}

export interface MonthlyIncomeSummary {
  month: number;
  year: number;
  label: string;
  totalIncome: Decimal | null;
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

async function fetchProvenanceSet(recordIds: string[]): Promise<Set<string>> {
  if (recordIds.length === 0) return new Set();
  const entries = await prisma.auditLog.findMany({
    where: {
      entity: "FundFlowMonthly",
      entityId: { in: recordIds },
      action: "create",
      metadata: {
        path: ["source"],
        equals: "ff-01k-workbook-allocation",
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
        amount: new Decimal(m.income.toString()),
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
      return acc ? acc.plus(a.amount) : new Decimal(a.amount.toString());
    }, null);

    return { allocations, total };
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

    // Validate amount is a valid decimal
    let amountDecimal: Decimal;
    try {
      amountDecimal = new Decimal(parsed.amount);
      if (!amountDecimal.isFinite()) throw new Error();
    } catch {
      throw new Error("Invalid monetary amount.");
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

export async function getMonthlyIncomeSummary(): Promise<ActionResult<MonthlyIncomeSummary[]>> {
  return withPermission("fundFlow", "read", async () => {
    const allFundFlows = await prisma.fundFlow.findMany({
      include: { monthlyData: true },
    });

    // Fetch all audit provenance for all monthly records in one query
    const allMonthlyIds = allFundFlows.flatMap((ff) => ff.monthlyData.map((m) => m.id));
    const provenanceSet = await fetchProvenanceSet(allMonthlyIds);

    // Aggregate by month key (YYYY-MM)
    const monthlyAggregates = new Map<
      string,
      { total: Decimal; projectCount: number; unavailableCount: number }
    >();

    for (const fundFlow of allFundFlows) {
      for (const m of fundFlow.monthlyData) {
        const key = `${m.year}-${m.month}`;

        // Skip if outside 24-month window
        if (!windowKeySet.has(key)) continue;

        // Skip records with non-zero expense/net/cumulative (different meaning)
        if (!isSafeWorkbookRecord(m)) continue;

        // Check provenance
        if (!provenanceSet.has(m.id)) {
          // Ambiguous record - count as unavailable
          const existing = monthlyAggregates.get(key) ?? {
            total: new Decimal("0"),
            projectCount: 0,
            unavailableCount: 0,
          };
          existing.unavailableCount += 1;
          monthlyAggregates.set(key, existing);
          continue;
        }

        // Valid allocation - add to total
        const existing = monthlyAggregates.get(key) ?? {
          total: new Decimal("0"),
          projectCount: 0,
          unavailableCount: 0,
        };
        existing.total = existing.total.plus(new Decimal(m.income.toString()));
        existing.projectCount += 1;
        monthlyAggregates.set(key, existing);
      }
    }

    // Build summary array in window order
    const summary: MonthlyIncomeSummary[] = MONTHLY_ALLOCATION_WINDOW.map(
      ({ year, month, label }) => {
        const key = `${year}-${month}`;
        const agg = monthlyAggregates.get(key);

        return {
          month,
          year,
          label,
          totalIncome: agg && agg.projectCount > 0 ? agg.total : null,
          projectCount: agg?.projectCount ?? 0,
          unavailableCount: agg?.unavailableCount ?? 0,
        };
      }
    );

    return summary;
  });
}
