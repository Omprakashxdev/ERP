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
}

export interface MonthlyAllocationResult {
  allocations: MonthlyAllocation[];
  total: Decimal | null;
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

    const allocationMap = new Map<
      string,
      { month: number; year: number; amount: Decimal }
    >();
    for (const m of fundFlow.monthlyData) {
      // Only treat records with zero expense/net/cumulative as workbook allocations.
      // Records with non-zero derived fields may have been created with a different
      // meaning and are ignored (treated as missing) to avoid reinterpretation.
      if (!isSafeWorkbookRecord(m)) continue;
      allocationMap.set(`${m.year}-${String(m.month).padStart(2, "0")}`, {
        month: m.month,
        year: m.year,
        amount: m.income,
      });
    }

    const allocations: MonthlyAllocation[] = MONTHLY_ALLOCATION_WINDOW.map(
      ({ year, month }) => {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        const found = allocationMap.get(key);
        return {
          month,
          year,
          amount: found ? new Decimal(found.amount.toString()) : null,
        };
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

      // Update ONLY income; never touch expense, net, or cumulative.
      await prisma.fundFlowMonthly.update({
        where: { id: existing.id },
        data: { income: amountDecimal },
      });

      await audit(user.id, "update", "FundFlowMonthly", existing.id, {
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
