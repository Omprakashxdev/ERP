import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMonthlyRunningBalance } from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

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

function mockWithPermission() {
  vi.mocked(withPermission).mockImplementation(async (_r, _a, fn) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Action failed",
      };
    }
  });
}

function ffRow(opts: {
  name: string;
  staffExp?: string;
  startMonth?: number | null;
  startYear?: number | null;
  ttl?: number | null;
  monthlyData?: any[];
}) {
  return {
    staffExp: new Decimal(opts.staffExp ?? "0"),
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
    id,
    month,
    year,
    income: new Decimal(income),
    expense: new Decimal("0"),
    net: new Decimal("0"),
    cumulative: new Decimal("0"),
  };
}

const incProv = (id: string) => ({
  entityId: id,
  entity: "FundFlowMonthly",
  action: "create",
  metadata: { source: "ff-01k-workbook-allocation" },
});

const idx = (month: number, year: number) => (year - 2026) * 12 + (month - 4);

describe("Cumulative Balance (confirmed Excel Row 18)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
    mockAuditLogEntries = [];
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue(
      [] as any
    );
    vi.mocked(prisma.auditLog.findMany).mockImplementation((async (args: any) => {
      const ids = new Set<string>(args?.where?.entityId?.in ?? []);
      const entity = args?.where?.entity;
      return mockAuditLogEntries.filter(
        (e) => ids.has(e.entityId) && (!entity || e.entity === entity)
      );
    }) as any);
  });

  it("first month = income − expense from a zero baseline", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "1.60", startMonth: 4, startYear: 2026, ttl: 2,
        monthlyData: [incRec("m1", 4, 2026, "5.31")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1")];
    const data = (await getMonthlyRunningBalance()).data as any;
    expect(data.months[0].runningBalance).toBe("3.71"); // 5.31 − 1.60
  });

  it("carries forward: next = prev + income − expense", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "1.60", startMonth: 4, startYear: 2026, ttl: 2,
        monthlyData: [incRec("m1", 4, 2026, "5.31"), incRec("m2", 5, 2026, "2.00")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1"), incProv("m2")];
    const data = (await getMonthlyRunningBalance()).data as any;
    // Apr: 5.31−1.60=3.71 ; May: 3.71+2.00−1.60=4.11 ; Jun: no data → stays 4.11
    expect(data.months[0].runningBalance).toBe("3.71");
    expect(data.months[1].runningBalance).toBe("4.11");
    expect(data.months[2].runningBalance).toBe("4.11");
  });

  it("negative cumulative balances display correctly", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "A", staffExp: "10", startMonth: 4, startYear: 2026, ttl: 3 }),
    ] as any);
    const data = (await getMonthlyRunningBalance()).data as any;
    expect(data.months[0].runningBalance).toBe("-10");
    expect(data.months[1].runningBalance).toBe("-20");
    expect(data.months[2].runningBalance).toBe("-30");
    expect(data.months[3].runningBalance).toBe("-30"); // flat after span ends
  });

  it("runs the full 24-month window", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "A", staffExp: "1", startMonth: 3, startYear: 2028, ttl: 1 }),
    ] as any);
    const data = (await getMonthlyRunningBalance()).data as any;
    expect(data.months).toHaveLength(24);
    expect(data.months[22].runningBalance).toBe("0");
    expect(data.months[23].runningBalance).toBe("-1");
  });

  it("keeps carrying through income gaps", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "0", startMonth: 4, startYear: 2026, ttl: 24,
        monthlyData: [incRec("m1", 4, 2026, "100"), incRec("m2", 4, 2027, "50")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1"), incProv("m2")];
    const data = (await getMonthlyRunningBalance()).data as any;
    expect(data.months[idx(3, 2027)].runningBalance).toBe("100");
    expect(data.months[idx(4, 2027)].runningBalance).toBe("150");
    expect(data.months[23].runningBalance).toBe("150");
  });

  it("incomplete flag reflects missing config / excluded income", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "Legacy", staffExp: "2000" }),
      ffRow({
        name: "A", staffExp: "1", startMonth: 4, startYear: 2026, ttl: 1,
        monthlyData: [incRec("m1", 4, 2026, "10")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1")];
    const data = (await getMonthlyRunningBalance()).data as any;
    expect(data.months[0].incomplete).toBe(true);
    expect(data.missingExpenseConfig).toHaveLength(1);
  });
});
