import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMonthlyExpenses,
  upsertMonthlyExpense,
} from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

// Mock audit log entries — filtered by the where clause the actions use
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

/** fund-flow row for the derived-expense source query */
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

// window index helper: Apr 2026 = 0 … Mar 2028 = 23
const idx = (month: number, year: number) => (year - 2026) * 12 + (month - 4);

describe("Derived Monthly Expenses (confirmed Excel Row 14)", () => {
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

  it("covers all 24 window months Apr 2026 – Mar 2028 in order", async () => {
    const result = await getMonthlyExpenses();
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.expenses).toHaveLength(24);
    expect(data.expenses[0]).toMatchObject({ month: 4, year: 2026 });
    expect(data.expenses[23]).toMatchObject({ month: 3, year: 2028 });
    expect(data.total).toBe("0");
    expect(data.missingExpenseConfig).toHaveLength(0);
  });

  it("two overlapping projects produce the customer's confirmed monthly expenses", async () => {
    // Project A: Staff Exp 1.60, Jul 2026, 18 months → Jul 2026 – Dec 2027
    // Project B: Staff Exp 0.90, Sep 2026, 4 months  → Sep – Dec 2026
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "Project A", staffExp: "1.60", startMonth: 7, startYear: 2026, ttl: 18 }),
      ffRow({ name: "Project B", staffExp: "0.90", startMonth: 9, startYear: 2026, ttl: 4 }),
    ] as any);

    const result = await getMonthlyExpenses();
    const data = result.data as any;
    const at = (m: number, y: number) => data.expenses[idx(m, y)];

    expect(at(7, 2026).amount).toBe("1.6");
    expect(at(8, 2026).amount).toBe("1.6");
    expect(at(9, 2026).amount).toBe("2.5");   // 1.60 + 0.90 overlap
    expect(at(10, 2026).amount).toBe("2.5");
    expect(at(11, 2026).amount).toBe("2.5");
    expect(at(12, 2026).amount).toBe("2.5");
    expect(at(1, 2027).amount).toBe("1.6");   // B finished
    expect(at(12, 2027).amount).toBe("1.6");  // A's last month
    expect(at(1, 2028).amount).toBe("0");     // A finished
    expect(at(4, 2026).amount).toBe("0");     // before A starts

    // contributors listed per month
    expect(at(9, 2026).contributors).toHaveLength(2);
    expect(at(7, 2026).contributors).toHaveLength(1);

    // total = 1.60×18 + 0.90×4 = 28.8 + 3.6 = 32.4
    expect(new Decimal(data.total).toFixed(1)).toBe("32.4");
  });

  it("expense starts and stops exactly at the configured span", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "P", staffExp: "2.00", startMonth: 6, startYear: 2026, ttl: 3 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    const at = (m: number, y: number) => data.expenses[idx(m, y)];
    expect(at(5, 2026).amount).toBe("0");
    expect(at(6, 2026).amount).toBe("2");   // first month = start month
    expect(at(8, 2026).amount).toBe("2");   // last = start + ttl − 1
    expect(at(9, 2026).amount).toBe("0");
  });

  it("project with no income allocations still contributes expense", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "P", staffExp: "0.50", startMonth: 4, startYear: 2026, ttl: 2 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    expect(data.expenses[0].amount).toBe("0.5");
  });

  it("Staff Exp. is used whole — never divided by duration", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "P", staffExp: "9.00", startMonth: 4, startYear: 2026, ttl: 3 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    expect(data.expenses[0].amount).toBe("9");
    expect(data.expenses[1].amount).toBe("9");
  });

  it("legacy projects without Start month or duration are excluded and flagged", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "Legacy A", staffExp: "2000" }),
      ffRow({ name: "Legacy B", staffExp: "5000", startMonth: 7, startYear: 2026 }),
      ffRow({ name: "OK", staffExp: "1", startMonth: 4, startYear: 2026, ttl: 1 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    expect(data.expenses[0].amount).toBe("1"); // only the configured project
    expect(data.missingExpenseConfig).toEqual([
      { projectName: "Legacy A", missing: ["Start month", "Target Time Limit (In Month)"] },
      { projectName: "Legacy B", missing: ["Target Time Limit (In Month)"] },
    ]);
  });

  it("stored legacy FundFlowMonthlyExpense records are never counted", async () => {
    // A legacy manual record exists — it must not feed the derived report.
    vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValue([
      { id: "e1", month: 4, year: 2026, amount: new Decimal("30.61") },
    ] as any);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "P", staffExp: "1.25", startMonth: 4, startYear: 2026, ttl: 1 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    expect(data.expenses[0].amount).toBe("1.25"); // 30.61 not added
  });

  it("a project spanning beyond the window still contributes inside it", async () => {
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValue([
      ffRow({ name: "Long", staffExp: "1", startMonth: 3, startYear: 2028, ttl: 12 }),
    ] as any);
    const data = (await getMonthlyExpenses()).data as any;
    expect(data.expenses[23].amount).toBe("1"); // Mar 2028 — window edge
  });

  describe("upsertMonthlyExpense (manual entry removed)", () => {
    it("rejects every write — Row 14 is calculated, never entered", async () => {
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "30.61" });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/calculated automatically/);
    });

    it("does not touch the FundFlowMonthlyExpense table", async () => {
      await upsertMonthlyExpense({ month: 4, year: 2026, amount: "10" });
      expect(prisma.fundFlowMonthlyExpense.findMany).not.toHaveBeenCalled();
    });
  });
});
