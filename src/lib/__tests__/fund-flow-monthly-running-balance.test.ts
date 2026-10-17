import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMonthlyRunningBalance } from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

let mockAuditLogEntries: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundFlow: {
      findMany: vi.fn(),
    },
    fundFlowMonthlyExpense: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v) => v),
}));

function mockWithPermission() {
  vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

function incRec(id: string, month: number, year: number, income: string) {
  return {
    id,
    month,
    year,
    income: new Decimal(income),
    expense: new Decimal("0"),
    net: new Decimal("0"),
    cumulative: new Decimal("0"),
  };
}

function expRec(id: string, month: number, year: number, amount: string) {
  return {
    id,
    month,
    year,
    amount: new Decimal(amount),
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };
}

const incProv = (id: string) => ({
  entityId: id,
  entity: "FundFlowMonthly",
  action: "create",
  metadata: { source: "ff-01k-workbook-allocation" },
});

const expProv = (id: string) => ({
  entityId: id,
  entity: "FundFlowMonthlyExpense",
  action: "create",
  metadata: { source: "ff-01m-workbook-expense" },
});

const monthAt = (data: any, i: number) => data.months[i];

describe("Planned Running Balance (FF-01O, Excel Row 18)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
    mockAuditLogEntries = [];
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.auditLog.findMany).mockImplementation(((args: any) => {
      const where = args?.where;
      if (!where) return Promise.resolve([]);
      const entityIds = where.entityId?.in;
      if (!entityIds || !Array.isArray(entityIds)) return Promise.resolve([]);
      const filtered = mockAuditLogEntries.filter((e) => {
        if (where.entity && e.entity !== where.entity) return false;
        if (!entityIds.includes(e.entityId)) return false;
        if (where.action && e.action !== where.action) return false;
        if (
          where.metadata?.path?.[0] === "source" &&
          e.metadata?.source !== where.metadata?.equals
        )
          return false;
        return true;
      });
      return Promise.resolve(filtered);
    }) as any);
  });

  it("covers 24 months with formula coverage limited to V18:AJ18 (T120)", async () => {
    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect(data.months).toHaveLength(24);
    expect(monthAt(data, 0).formulaCovered).toBe(true);  // V18 Apr 2026
    expect(monthAt(data, 14).formulaCovered).toBe(true); // AJ18 Jun 2027
    expect(monthAt(data, 15).formulaCovered).toBe(false); // AK18 Jul 2027
    expect(monthAt(data, 23).formulaCovered).toBe(false); // AS18 Mar 2028
  });

  it("no AU18 grand total is produced (T121)", async () => {
    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect("totalNet" in data).toBe(false);
    expect("total" in data).toBe(false);
  });

  it("leading months with no verified inputs show blank, not fabricated zero (T122)", async () => {
    const result = await getMonthlyRunningBalance();
    for (const m of (result.data as any).months) {
      expect(m.runningBalance).toBeNull();
    }
  });

  it("first month = income − expense with implied zero opening (V18 = V12−V14) (T123)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", 4, 2026, "3.43")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyRunningBalance();
    const m = monthAt(result.data as any, 0);
    expect(m.runningBalance.toFixed(2)).toBe("-27.18");
    expect(m.incomplete).toBe(false);
    expect(m.gapMonths).toBe(0);
  });

  it("carries forward: balance_n = balance_(n-1) + income − expense (T124)", async () => {
    // Workbook Apr–Jun 2026: income 3.43, 3.43, 1.72; expenses 30.61, 30.36, 30.31
    // → running: −27.18, −54.11, −82.70
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        id: "ff-1",
        monthlyData: [
          incRec("i1", 4, 2026, "3.43"),
          incRec("i2", 5, 2026, "3.43"),
          incRec("i3", 6, 2026, "1.72"),
        ],
      },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
      expRec("e2", 5, 2026, "30.36"),
      expRec("e3", 6, 2026, "30.31"),
    ] as any);
    mockAuditLogEntries = [
      incProv("i1"), incProv("i2"), incProv("i3"),
      expProv("e1"), expProv("e2"), expProv("e3"),
    ];

    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect(monthAt(data, 0).runningBalance.toFixed(2)).toBe("-27.18");
    expect(monthAt(data, 1).runningBalance.toFixed(2)).toBe("-54.11");
    expect(monthAt(data, 2).runningBalance.toFixed(2)).toBe("-82.70");
  });

  it("no balance beyond formula range even with inputs (T125)", async () => {
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 6, 2027, "6.27"),  // Jun 2027 — covered
      expRec("e2", 7, 2027, "5.00"),  // Jul 2027 — not covered
    ] as any);
    mockAuditLogEntries = [expProv("e1"), expProv("e2")];

    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect(monthAt(data, 14).runningBalance.toFixed(2)).toBe("-6.27");
    expect(monthAt(data, 15).runningBalance).toBeNull();
    expect(monthAt(data, 15).formulaCovered).toBe(false);
  });

  it("missing expense treated as 0 but month and all later months flagged incomplete (T126)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        id: "ff-1",
        monthlyData: [
          incRec("i1", 4, 2026, "10.00"),
          incRec("i2", 5, 2026, "10.00"),
        ],
      },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "3.00"),
      // May 2026 expense missing entirely
    ] as any);
    mockAuditLogEntries = [incProv("i1"), incProv("i2"), expProv("e1")];

    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect(monthAt(data, 0).runningBalance.toFixed(2)).toBe("7.00");
    expect(monthAt(data, 0).incomplete).toBe(false);
    // May: balance = 7 + 10 − 0 = 17, but flagged incomplete (missing expense)
    expect(monthAt(data, 1).runningBalance.toFixed(2)).toBe("17.00");
    expect(monthAt(data, 1).incomplete).toBe(true);
    expect(monthAt(data, 1).gapMonths).toBe(1);
    // Later covered months carry the balance AND the incomplete flag
    expect(monthAt(data, 2).runningBalance.toFixed(2)).toBe("17.00");
    expect(monthAt(data, 2).incomplete).toBe(true);
  });

  it("ambiguous records are excluded and flagged (T127)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i-amb", 4, 2026, "999")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
    ] as any);
    mockAuditLogEntries = [expProv("e1")]; // income record lacks provenance

    const result = await getMonthlyRunningBalance();
    const m = monthAt(result.data as any, 0);
    expect(m.runningBalance.toFixed(2)).toBe("-30.61"); // income treated as 0
    expect(m.incomplete).toBe(true);
    expect(m.gapMonths).toBe(1);
  });

  it("explicit zero expense keeps month complete (T128)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", 4, 2026, "5.00")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "0.00"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyRunningBalance();
    const m = monthAt(result.data as any, 0);
    expect(m.runningBalance.toFixed(2)).toBe("5.00");
    expect(m.incomplete).toBe(false);
  });

  it("preserves Decimal(19,2) precision across the carry-forward (T129)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        id: "ff-1",
        monthlyData: [
          incRec("i1", 4, 2026, "99999999999999999.99"),
          incRec("i2", 5, 2026, "0.01"),
        ],
      },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "0.02"),
      expRec("e2", 5, 2026, "0"),
    ] as any);
    mockAuditLogEntries = [
      incProv("i1"), incProv("i2"), expProv("e1"), expProv("e2"),
    ];

    const result = await getMonthlyRunningBalance();
    const data = result.data as any;
    expect(monthAt(data, 0).runningBalance.toString()).toBe("99999999999999999.97");
    expect(monthAt(data, 1).runningBalance.toString()).toBe("99999999999999999.98");
  });

  it("ignores out-of-window records entirely (T130)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", 4, 2028, "50.00")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2028, "50.00"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyRunningBalance();
    for (const m of (result.data as any).months) {
      expect(m.runningBalance).toBeNull();
    }
  });

  it("requires fundFlow read permission (T131)", async () => {
    vi.mocked(withPermission).mockImplementationOnce(async () => ({
      success: false,
      error: "Unauthorized",
    }));
    const result = await getMonthlyRunningBalance();
    expect(result.success).toBe(false);
  });
});
