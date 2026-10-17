import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMonthlyPlannedNet } from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

// Mock audit log entries — filtered by the where clause the actions use
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

function incRec(id: string, fundFlowId: string, month: number, year: number, income: string) {
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

function incProv(id: string) {
  return {
    entityId: id,
    entity: "FundFlowMonthly",
    action: "create",
    metadata: { source: "ff-01k-workbook-allocation" },
  };
}

function expProv(id: string) {
  return {
    entityId: id,
    entity: "FundFlowMonthlyExpense",
    action: "create",
    metadata: { source: "ff-01m-workbook-expense" },
  };
}

const monthAt = (data: any, i: number) => data.months[i];

describe("Planned Net (FF-01N, Excel Row 16 = Row 12 − Row 14)", () => {
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

  it("covers all 24 window months in order (T106)", async () => {
    const result = await getMonthlyPlannedNet();
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.months).toHaveLength(24);
    expect(monthAt(data, 0)).toMatchObject({ month: 4, year: 2026, label: "Apr 2026" });
    expect(monthAt(data, 2)).toMatchObject({ month: 6, year: 2026 });
    expect(monthAt(data, 23)).toMatchObject({ month: 3, year: 2028 });
  });

  it("net = income − expense per month (workbook V16 parity) (T107)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2026, "3.43")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 0);
    expect(m.plannedNet.toFixed(2)).toBe("-27.18"); // 3.43 − 30.61
    expect(m.incomePresent).toBe(true);
    expect(m.expensePresent).toBe(true);
    expect(m.incomplete).toBe(false);
  });

  it("income present + expense missing → net = income, flagged incomplete (T108)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 5, 2026, "10.00")] },
    ] as any);
    mockAuditLogEntries = [incProv("i1")];

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 1);
    expect(m.plannedNet.toFixed(2)).toBe("10.00");
    expect(m.incomplete).toBe(true);
  });

  it("expense present + income missing → net = −expense, flagged incomplete (T109)", async () => {
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 6, 2026, "30.31"),
    ] as any);
    mockAuditLogEntries = [expProv("e1")];

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 2);
    expect(m.plannedNet.toFixed(2)).toBe("-30.31");
    expect(m.incomplete).toBe(true);
  });

  it("month with no inputs returns null — not a fabricated zero (T110)", async () => {
    const result = await getMonthlyPlannedNet();
    const data = result.data as any;
    for (const m of data.months) {
      expect(m.plannedNet).toBeNull();
    }
    expect(data.totalNet).toBeNull();
  });

  it("ambiguous income record excluded → treated as missing, incomplete (T111)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i-amb", "ff-1", 4, 2026, "999")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
    ] as any);
    mockAuditLogEntries = [expProv("e1")]; // no income provenance

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 0);
    expect(m.incomePresent).toBe(false);
    expect(m.excludedCount).toBe(1);
    expect(m.incomplete).toBe(true);
    // net = 0 − 30.61 with income treated as missing
    expect(m.plannedNet.toFixed(2)).toBe("-30.61");
  });

  it("ambiguous expense record excluded → treated as missing (T112)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2026, "3.43")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e-amb", 4, 2026, "999"),
    ] as any);
    mockAuditLogEntries = [incProv("i1")]; // no expense provenance

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 0);
    expect(m.expensePresent).toBe(false);
    expect(m.excludedCount).toBe(1);
    expect(m.plannedNet.toFixed(2)).toBe("3.43"); // 3.43 − 0
    expect(m.incomplete).toBe(true);
  });

  it("explicitly entered zero expense → net = income, not incomplete (T113)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2026, "5.00")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "0.00"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 0);
    expect(m.expensePresent).toBe(true);
    expect(m.plannedNet.toFixed(2)).toBe("5.00");
    expect(m.incomplete).toBe(false);
  });

  it("preserves Decimal(19,2) precision in net and total (T114)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2026, "99999999999999999.99")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "0.01"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyPlannedNet();
    const data = result.data as any;
    expect(monthAt(data, 0).plannedNet.toString()).toBe("99999999999999999.98");
    expect(data.totalNet.toString()).toBe("99999999999999999.98");
  });

  it("AU16 parity: totalNet = total income − total expenses (T115)", async () => {
    // Mirrors workbook: AU12 ≈ 52.02, AU14 = 224.26 → AU16 ≈ −172.24
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        id: "ff-1",
        monthlyData: [
          incRec("i1", "ff-1", 4, 2026, "30.00"),
          incRec("i2", "ff-1", 5, 2026, "22.02341333333333"),
        ],
      },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "30.61"),
      expRec("e2", 5, 2026, "30.36"),
      expRec("e3", 6, 2026, "163.29"),
    ] as any);
    mockAuditLogEntries = [
      incProv("i1"), incProv("i2"),
      expProv("e1"), expProv("e2"), expProv("e3"),
    ];

    const result = await getMonthlyPlannedNet();
    const data = result.data as any;
    // income total 52.02341333333333 − expense total 224.26 = −172.23658666666667
    expect(data.totalNet.toString()).toBe("-172.23658666666667");
    // June month (index 2) has expense only → −163.29
    expect(monthAt(data, 2).plannedNet.toString()).toBe("-163.29");
    expect(data.totalIncomplete).toBe(true); // months 6+ missing income
  });

  it("keeps income and expense sources separate — no cross-contamination (T116)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2026, "7.50")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2026, "2.50"),
    ] as any);
    // income record carries expense-side provenance — must NOT count
    mockAuditLogEntries = [
      { entityId: "i1", entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01m-workbook-expense" } },
      { entityId: "e1", entity: "FundFlowMonthlyExpense", action: "create", metadata: { source: "ff-01k-workbook-allocation" } },
    ];

    const result = await getMonthlyPlannedNet();
    const m = monthAt(result.data as any, 0);
    expect(m.incomePresent).toBe(false);
    expect(m.expensePresent).toBe(false);
    expect(m.excludedCount).toBe(2);
    expect(m.plannedNet).toBeNull(); // no verified inputs at all
  });

  it("ignores out-of-window records (T117)", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      { id: "ff-1", monthlyData: [incRec("i1", "ff-1", 4, 2028, "50.00")] },
    ] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
      expRec("e1", 4, 2028, "50.00"),
    ] as any);
    mockAuditLogEntries = [incProv("i1"), expProv("e1")];

    const result = await getMonthlyPlannedNet();
    const data = result.data as any;
    // April 2028 is outside the V–AS window → no contribution
    for (const m of data.months) {
      expect(m.plannedNet).toBeNull();
    }
    expect(data.totalNet).toBeNull();
  });

  it("requires fundFlow read permission (T118)", async () => {
    vi.mocked(withPermission).mockImplementationOnce(async () => ({
      success: false,
      error: "Unauthorized",
    }));
    const result = await getMonthlyPlannedNet();
    expect(result.success).toBe(false);
  });
});
