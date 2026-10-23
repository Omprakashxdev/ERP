import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMonthlyIncomeSummary,
  getMonthlyExpenses,
  getMonthlyPlannedNet,
  getMonthlyRunningBalance,
} from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

// Confirmed customer rules (ERP - Work Flow Formats.xlsx, "Fund Flow" sheet):
//   Row 12 = Σ saved project allocations per month (whole Apr26–Mar28 window)
//   Row 14 = Σ Staff Exp. of every project whose [Start month … +TTL−1] span
//            covers the month — derived, never the workbook's old sample
//            literals (30.61, 30.36, 30.31…)
//   Row 16 = Row 12 − Row 14
//   Row 18 = prev + Row 12 − Row 14, zero opening baseline
// Old manually-entered FundFlowMonthlyExpense records are preserved but
// never feed the derived report.

let mockAuditLogEntries: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundFlow: { findMany: vi.fn() },
    fundFlowMonthlyExpense: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v) => v),
}));

function ffRow(opts: {
  name: string;
  staffExp: string;
  startMonth?: number | null;
  startYear?: number | null;
  ttl?: number | null;
  monthlyData?: any[];
}) {
  return {
    staffExp: new Decimal(opts.staffExp),
    distributionStartMonth: opts.startMonth ?? null,
    distributionStartYear: opts.startYear ?? null,
    project: {
      name: opts.name,
      targetTimeLimitMonths:
        opts.ttl == null ? null : new Decimal(String(opts.ttl)),
    },
    monthlyData: opts.monthlyData ?? [],
  };
}

function incRec(id: string, month: number, year: number, income: string) {
  return {
    id, month, year,
    income: new Decimal(income),
    expense: new Decimal("0"),
    net: new Decimal("0"),
    cumulative: new Decimal("0"),
  };
}

const prov = (id: string) => {
  mockAuditLogEntries.push({
    entityId: id,
    entity: "FundFlowMonthly",
    action: "create",
    metadata: { source: "ff-01k-workbook-allocation" },
  });
  return id;
};

const idx = (month: number, year: number) => (year - 2026) * 12 + (month - 4);

// Customer's confirmed example: A = 1.60×18mo from Jul 2026, B = 0.90×4mo
// from Sep 2026 → expected expenses Jul 1.60 / Aug 1.60 / Sep–Dec 2.50 /
// Jan 2027–Dec 2027 1.60 / Jan 2028 0.
function seedConfirmed() {
  const aData: any[] = [];
  // saved income allocations for A: 2.00/month Jul–Dec 2026
  for (let m = 7; m <= 12; m++) {
    const id = `a-${m}`;
    aData.push(incRec(prov(id), m, 2026, "2.00"));
  }
  vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
    ffRow({ name: "Project A", staffExp: "1.60", startMonth: 7, startYear: 2026, ttl: 18, monthlyData: aData }),
    ffRow({ name: "Project B", staffExp: "0.90", startMonth: 9, startYear: 2026, ttl: 4 }),
    // legacy row: historical staffExp, no timing → excluded, flagged
    ffRow({ name: "Legacy", staffExp: "2000" }),
  ] as any);
  // A stale manual-expense record exists — must not feed the report
  vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue([
    { id: "ex1", month: 9, year: 2026, amount: new Decimal("30.61"), createdAt: new Date(), updatedAt: new Date() },
  ] as any);
}

describe("Confirmed monthly report — Rows 12/14/16/18 end-to-end", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(withPermission).mockImplementation(async (_r, _a, fn) => {
      try {
        return { success: true, data: await fn({ id: "u", role: "ADMIN" }) };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    });
    mockAuditLogEntries = [];
    vi.mocked(prisma.auditLog.findMany).mockImplementation(((args: any) => {
      const where = args?.where;
      if (!where?.entityId?.in) return Promise.resolve([]);
      return Promise.resolve(
        mockAuditLogEntries.filter((e) => {
          if (where.entity && e.entity !== where.entity) return false;
          if (!where.entityId.in.includes(e.entityId)) return false;
          if (where.action && e.action !== where.action) return false;
          if (
            where.metadata?.path?.[0] === "source" &&
            e.metadata?.source !== where.metadata?.equals
          )
            return false;
          return true;
        })
      );
    }) as any);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue(
      [] as any
    );
    seedConfirmed();
  });

  it("Row 12 sums saved allocations per month (2.00 Jul–Dec 2026)", async () => {
    const data = (await getMonthlyIncomeSummary()).data as any[];
    expect(data[idx(7, 2026)].totalIncome).toBe("2");
    expect(data[idx(12, 2026)].totalIncome).toBe("2");
    expect(data[idx(1, 2027)].totalIncome).toBeNull();
    // full window covered
    expect(data.every((m: any) => m.formulaCovered)).toBe(true);
  });

  it("Row 14 equals the confirmed overlapping-project expenses", async () => {
    const data = (await getMonthlyExpenses()).data as any;
    const at = (m: number, y: number) => data.expenses[idx(m, y)].amount;
    expect(at(7, 2026)).toBe("1.6");
    expect(at(8, 2026)).toBe("1.6");
    expect(at(9, 2026)).toBe("2.5");
    expect(at(10, 2026)).toBe("2.5");
    expect(at(11, 2026)).toBe("2.5");
    expect(at(12, 2026)).toBe("2.5");
    expect(at(1, 2027)).toBe("1.6");
    expect(at(12, 2027)).toBe("1.6");
    expect(at(1, 2028)).toBe("0");
    // legacy manual record 30.61 in Sep is NOT counted
    expect(at(9, 2026)).not.toBe("33.11");
    expect(data.missingExpenseConfig).toEqual([
      {
        projectName: "Legacy",
        missing: ["Start month", "Target Time Limit (In Month)"],
      },
    ]);
  });

  it("Row 16 = Row 12 − Row 14 for every month", async () => {
    const data = (await getMonthlyPlannedNet()).data as any;
    const at = (m: number, y: number) => data.months[idx(m, y)].plannedNet;
    // Sep–Dec: income 2.00 − expense 2.50 = −0.50
    expect(at(9, 2026)).toBe("-0.5");
    // Jul/Aug: income 2.00 − expense 1.60 = 0.40
    expect(at(7, 2026)).toBe("0.4");
    // Jan 2027: no income, expense 1.60 → −1.60
    expect(at(1, 2027)).toBe("-1.6");
    // Apr 2026: nothing at all → null
    expect(at(4, 2026)).toBeNull();
  });

  it("Row 18 carries the confirmed cumulative balance", async () => {
    const data = (await getMonthlyRunningBalance()).data as any;
    const at = (m: number, y: number) => data.months[idx(m, y)].runningBalance;
    expect(at(4, 2026)).toBe("0");      // baseline
    expect(at(7, 2026)).toBe("0.4");    // +0.40
    expect(at(8, 2026)).toBe("0.8");    // +0.40
    expect(at(9, 2026)).toBe("0.3");    // −0.50
    expect(at(12, 2026)).toBe("-1.2");  // 0.3 + 3×(−0.5)
    expect(at(1, 2027)).toBe("-2.8");   // −1.2 − 1.6
    expect(at(12, 2027)).toBe("-20.4"); // −2.8 − 1.6×11
  });
});
