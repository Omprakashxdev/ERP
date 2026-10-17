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

// ── Excel cached values from docs/ERP - Work Flow Formats.xlsx ──
// Project 1 (row 6): Y6:AP6 = 2.777744444444444 each (Jul26-Dec27, 18 months)
// Project 2 (row 8): AA8:AD8 = 2.5276199999999998 each (Sep-Dec26)
// Project 3 (row 9): V9/W9 = 3.4299999999999997, X9 = 1.72
// Row 14 literals V14:AJ14 (Apr26-Jun27)

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

const P1 = "2.777744444444444";
const P2 = "2.5276199999999998";
const P3a = "3.4299999999999997";
const P3c = "1.72";
const EXP = ["30.61","30.36","30.31","15.56","15.37","14.66","13.21","13.21","10.81","10.02","9.91","9.98","7.49","6.49","6.27"];

// Excel cached results to compare against
const X_INCOME = [3.4299999999999997,3.4299999999999997,1.72,2.777744444444444,2.777744444444444,5.305364444444444,5.305364444444444,5.305364444444444,5.305364444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444,2.777744444444444];
const X_NET = [-27.18,-26.93,-28.59,-12.782255555555556,-12.592255555555555,-9.354635555555557,-7.904635555555557,-7.904635555555557,-5.504635555555557,-7.2422555555555554,-7.132255555555556,-7.202255555555556,-4.712255555555556,-3.712255555555556,-3.4922555555555554];
const X_BAL = [-27.18,-54.11,-82.7,-95.48225555555555,-108.07451111111112,-117.42914666666667,-125.33378222222223,-133.23841777777778,-138.74305333333334,-145.9853088888889,-153.11756444444447,-160.31982000000002,-165.0320755555556,-168.74433111111117,-172.23658666666674];
const X_AU12 = 52.02341333333333;
const X_AU14 = 224.26000000000005;
const X_AU16 = -172.2365866666667;

const TOL = 1e-9;
function close(actual: Decimal | null, expected: number): boolean {
  if (actual == null) return false;
  return Math.abs(Number(actual.toString()) - expected) < TOL;
}

function seedWorkbook() {
  // Project 1: months Jul26(i=3)..Dec27(i=20) = P1
  const p1: any[] = [];
  const months1 = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  // index i → month/year: i<9 → (2026, 4+i); else (2027, i-8)
  months1.forEach((i, n) => {
    const year = i <= 8 ? 2026 : 2027;
    const month = i <= 8 ? 4 + i : i - 8;
    p1.push({
      id: `p1-${i}`, month, year,
      income: new Decimal(P1),
      expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0"),
    });
    mockAuditLogEntries.push({ entityId: `p1-${i}`, entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } });
  });
  // Project 2: Sep-Dec 2026 (indices 5,6,7,8)
  const p2: any[] = [];
  [5,6,7,8].forEach((i) => {
    p2.push({
      id: `p2-${i}`, month: 4 + i, year: 2026,
      income: new Decimal(P2),
      expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0"),
    });
    mockAuditLogEntries.push({ entityId: `p2-${i}`, entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } });
  });
  // Project 3: Apr,May,Jun 2026
  const p3 = [
    { id: "p3-0", month: 4, year: 2026, income: new Decimal(P3a), expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0") },
    { id: "p3-1", month: 5, year: 2026, income: new Decimal(P3a), expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0") },
    { id: "p3-2", month: 6, year: 2026, income: new Decimal(P3c), expense: new Decimal("0"), net: new Decimal("0"), cumulative: new Decimal("0") },
  ];
  ["p3-0","p3-1","p3-2"].forEach((id) =>
    mockAuditLogEntries.push({ entityId: id, entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } })
  );

  vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
    { id: "ff-1", monthlyData: p1 },
    { id: "ff-2", monthlyData: p2 },
    { id: "ff-3", monthlyData: p3 },
  ] as any);

  // Row 14: expenses Apr26(i0)..Jun27(i14)
  const exps = EXP.map((a, i) => {
    const year = i <= 8 ? 2026 : 2027;
    const month = i <= 8 ? 4 + i : i - 8;
    mockAuditLogEntries.push({ entityId: `ex-${i}`, entity: "FundFlowMonthlyExpense", action: "create", metadata: { source: "ff-01m-workbook-expense" } });
    return { id: `ex-${i}`, month, year, amount: new Decimal(a), createdAt: new Date(), updatedAt: new Date() };
  });
  vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue(exps as any);
}

describe("Excel numerical parity verification", () => {
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
      const filtered = mockAuditLogEntries.filter((e) => {
        if (where.entity && e.entity !== where.entity) return false;
        if (!where.entityId.in.includes(e.entityId)) return false;
        if (where.action && e.action !== where.action) return false;
        if (where.metadata?.path?.[0] === "source" && e.metadata?.source !== where.metadata?.equals) return false;
        return true;
      });
      return Promise.resolve(filtered);
    }) as any);
    seedWorkbook();
  });

  it("Row 12: monthly income totals match Excel V12:AJ12 + AU12", async () => {
    const r = await getMonthlyIncomeSummary();
    const data = r.data as any[];
    const diffs: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (!close(data[i].totalIncome, X_INCOME[i])) {
        diffs.push(`month[${i}] erp=${data[i].totalIncome?.toString()} excel=${X_INCOME[i]}`);
      }
    }
    // AK12:AT12 have no formulas in the workbook — no Row 12 value may exist
    for (let i = 15; i < 24; i++) {
      if (data[i].formulaCovered !== false)
        diffs.push(`month[${i}] expected formulaCovered=false`);
      if (data[i].totalIncome !== null)
        diffs.push(`month[${i}] expected null got ${data[i].totalIncome}`);
    }
    const erpTotal = data.reduce(
      (acc, m) => (m.totalIncome ? acc.plus(m.totalIncome) : acc),
      new Decimal("0")
    );
    if (!close(erpTotal, X_AU12)) diffs.push(`AU12 erp=${erpTotal} excel=${X_AU12}`);
    console.log("ROW12 DIFFS:", diffs.length ? diffs : "NONE");
    expect(diffs).toEqual([]);
  });

  it("Row 14: expense values + AU14 parity", async () => {
    const r = await getMonthlyExpenses();
    const data = r.data as any;
    const diffs: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (!close(data.expenses[i].amount, Number(EXP[i]))) {
        diffs.push(`month[${i}] erp=${data.expenses[i].amount?.toString()} excel=${EXP[i]}`);
      }
    }
    if (!close(data.total, X_AU14)) diffs.push(`AU14 erp=${data.total} excel=${X_AU14}`);
    console.log("ROW14 DIFFS:", diffs.length ? diffs : "NONE");
    expect(diffs).toEqual([]);
  });

  it("Row 16: planned net matches Excel V16:AJ16 + AU16", async () => {
    const r = await getMonthlyPlannedNet();
    const data = r.data as any;
    const diffs: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (!close(data.months[i].plannedNet, X_NET[i])) {
        diffs.push(`month[${i}] erp=${data.months[i].plannedNet?.toString()} excel=${X_NET[i]}`);
      }
    }
    if (!close(data.totalNet, X_AU16)) diffs.push(`AU16 erp=${data.totalNet} excel=${X_AU16}`);
    console.log("ROW16 DIFFS:", diffs.length ? diffs : "NONE");
    expect(diffs).toEqual([]);
  });

  it("Row 18: running balance matches Excel V18:AJ18", async () => {
    const r = await getMonthlyRunningBalance();
    const data = r.data as any;
    const diffs: string[] = [];
    for (let i = 0; i < 15; i++) {
      if (!close(data.months[i].runningBalance, X_BAL[i])) {
        diffs.push(`month[${i}] erp=${data.months[i].runningBalance?.toString()} excel=${X_BAL[i]}`);
      }
    }
    for (let i = 15; i < 24; i++) {
      if (data.months[i].runningBalance !== null) diffs.push(`month[${i}] beyond AJ should be null, got ${data.months[i].runningBalance}`);
    }
    console.log("ROW18 DIFFS:", diffs.length ? diffs : "NONE");
    expect(diffs).toEqual([]);
  });
});
