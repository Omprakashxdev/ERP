import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getMonthlyPlannedNet } from "../actions/fund-flow-monthly";
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

describe("Planned Net (confirmed Excel Row 16 = Row 12 − Row 14)", () => {
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

  it("customer example: income 5.31 − expense 2.50 = net 2.81", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "1.60", startMonth: 4, startYear: 2026, ttl: 2,
        monthlyData: [incRec("m1", 4, 2026, "4.00"), incRec("m2", 5, 2026, "1.31")],
      }),
      ffRow({ name: "B", staffExp: "0.90", startMonth: 5, startYear: 2026, ttl: 1 }),
    ] as any);
    mockAuditLogEntries = [incProv("m1"), incProv("m2")];

    const data = (await getMonthlyPlannedNet()).data as any;
    // Apr: 4.00 − 1.60 = 2.40 ; May: 1.31 − (1.60+0.90) = −1.19
    expect(data.months[idx(4, 2026)].plannedNet).toBe("2.4");
    expect(data.months[idx(5, 2026)].plannedNet).toBe("-1.19");
  });

  it("covers all 24 months — no formula boundary", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "A", staffExp: "1", startMonth: 3, startYear: 2028, ttl: 1 }),
    ] as any);
    const data = (await getMonthlyPlannedNet()).data as any;
    expect(data.months).toHaveLength(24);
    expect(data.months.every((m: any) => m.formulaCovered)).toBe(true);
    expect(data.months[23].plannedNet).toBe("-1"); // Mar 2028 has a net
  });

  it("blank income counts as 0 — expense-only month nets negative", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "A", staffExp: "2.50", startMonth: 4, startYear: 2026, ttl: 1 }),
    ] as any);
    const data = (await getMonthlyPlannedNet()).data as any;
    expect(data.months[0].plannedNet).toBe("-2.5");
  });

  it("month with neither income nor expense shows null, not fabricated zero", async () => {
    const data = (await getMonthlyPlannedNet()).data as any;
    expect(data.months[0].plannedNet).toBeNull();
    expect(data.months[0].incomePresent).toBe(false);
    expect(data.months[0].expensePresent).toBe(false);
  });

  it("unverified income records are excluded and counted", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "1", startMonth: 4, startYear: 2026, ttl: 1,
        monthlyData: [incRec("m1", 4, 2026, "10"), incRec("m2", 4, 2026, "5")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1")]; // m2 lacks provenance
    const data = (await getMonthlyPlannedNet()).data as any;
    expect(data.months[0].plannedNet).toBe("9"); // 10 − 1
    expect(data.months[0].excludedCount).toBe(1);
    expect(data.months[0].incomplete).toBe(true);
  });

  it("missing timing config marks months incomplete", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "Legacy", staffExp: "2000" }),
      ffRow({
        name: "A", staffExp: "1", startMonth: 4, startYear: 2026, ttl: 1,
        monthlyData: [incRec("m1", 4, 2026, "10")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1")];
    const data = (await getMonthlyPlannedNet()).data as any;
    expect(data.months[0].plannedNet).toBe("9");
    expect(data.months[0].incomplete).toBe(true);
    expect(data.missingExpenseConfig).toHaveLength(1);
    expect(data.totalIncomplete).toBe(true);
  });

  it("totalNet = total income − total expenses across the window", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({
        name: "A", staffExp: "1.60", startMonth: 4, startYear: 2026, ttl: 2,
        monthlyData: [incRec("m1", 4, 2026, "10")],
      }),
    ] as any);
    mockAuditLogEntries = [incProv("m1")];
    const data = (await getMonthlyPlannedNet()).data as any;
    // income 10 − (1.60×2) = 6.80
    expect(data.totalNet).toBe("6.8");
  });
});
