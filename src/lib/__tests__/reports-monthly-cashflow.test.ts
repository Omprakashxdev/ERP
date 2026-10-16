import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReport } from "../reports";
import { prisma } from "../prisma";

vi.mock("../prisma", () => ({
  prisma: {
    dueBill: {
      findMany: vi.fn(),
    },
    fundFlow: {
      findMany: vi.fn(),
    },
  },
}));

describe("Fund Flow Monthly Cashflow Report (FF-01I)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups actual figures by real DueBill dates, not by work-order date (T50)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([
      {
        billAmount: 118000,
        receivedAmount: 118000,
        chequeAmount: 96000,
        billDate: new Date("2019-03-22"),
        receiveDate: new Date("2019-05-01"),
      },
      {
        billAmount: 53100,
        receivedAmount: 53100,
        chequeAmount: 43200,
        billDate: new Date("2019-05-28"),
        receiveDate: new Date("2019-10-24"),
      },
    ] as any);

    // Project workOrderDate is 2019-01; legacy figures should land in 2019-01
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        feeReceived: 100000,
        miscExp: 500,
        staffExp: 2000,
        project: { workOrderDate: new Date("2019-01-15") },
      },
    ] as any);

    const result = await runReport("fundflow-monthly-cashflow");

    // Actuals should appear in their real months
    const marRow = result.rows.find((r: any) => r.Month === "2019-03");
    const mayRow = result.rows.find((r: any) => r.Month === "2019-05");
    const octRow = result.rows.find((r: any) => r.Month === "2019-10");

    expect(marRow!["Actual invoiced"]).toBe(118000);
    expect(marRow!["Recorded settlement"]).toBe("Unavailable"); // settlement was in May
    expect(mayRow!["Actual invoiced"]).toBe(53100); // second bill invoiced in May
    expect(mayRow!["Recorded settlement"]).toBe(118000); // first bill settled in May
    expect(octRow!["Recorded settlement"]).toBe(53100);

    // Legacy figures should land in work-order month (2019-01)
    const janRow = result.rows.find((r: any) => r.Month === "2019-01");
    expect(janRow!["Legacy fee received (unverified)"]).toBe(100000);
    expect(janRow!["Legacy SAEC expenses (project total)"]).toBe(2500);
  });

  it("labels legacy-only months with a data-quality warning (T51)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        feeReceived: 50000,
        miscExp: 1000,
        staffExp: 2000,
        project: { workOrderDate: new Date("2020-06-01") },
      },
    ] as any);

    const result = await runReport("fundflow-monthly-cashflow");
    const row = result.rows.find((r: any) => r.Month === "2020-06");

    expect(row!["Actual invoiced"]).toBe("Unavailable");
    expect(row!["Recorded settlement"]).toBe("Unavailable");
    expect(row!["Legacy fee received (unverified)"]).toBe(50000);
    expect(row!["Data quality note"]).toContain("Legacy only");
    expect(row!["Data quality note"]).toContain("work-order date");
  });

  it("returns unavailable for actuals when no DueBills exist (T52)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([]);

    const result = await runReport("fundflow-monthly-cashflow");
    expect(result.rows).toHaveLength(0);
  });

  it("keeps invoice, settlement and cheque conceptually separate (T53)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([
      {
        billAmount: 118000,
        receivedAmount: 68000,
        chequeAmount: 50000,
        billDate: new Date("2024-01-15"),
        receiveDate: new Date("2024-02-10"),
      },
    ] as any);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([]);

    const result = await runReport("fundflow-monthly-cashflow");

    const janRow = result.rows.find((r: any) => r.Month === "2024-01");
    const febRow = result.rows.find((r: any) => r.Month === "2024-02");

    expect(janRow!["Actual invoiced"]).toBe(118000);
    expect(janRow!["Recorded settlement"]).toBe("Unavailable");
    expect(janRow!["Actual recorded cheque"]).toBe("Unavailable");

    expect(febRow!["Actual invoiced"]).toBe("Unavailable");
    expect(febRow!["Recorded settlement"]).toBe(68000);
    expect(febRow!["Actual recorded cheque"]).toBe(50000);
  });

  it("shows net cash flow as unavailable even when actuals exist (T54)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([
      {
        billAmount: 100000,
        receivedAmount: 60000,
        chequeAmount: 50000,
        billDate: new Date("2025-03-01"),
        receiveDate: new Date("2025-03-15"),
      },
    ] as any);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        feeReceived: 200000,
        miscExp: 10000,
        staffExp: 5000,
        project: { workOrderDate: new Date("2025-03-01") },
      },
    ] as any);

    const result = await runReport("fundflow-monthly-cashflow");
    const row = result.rows.find((r: any) => r.Month === "2025-03");

    // Net cash flow must remain unavailable: invoiced is not cash inflow,
    // settlement is recorded not verified, and no dated monthly expense source exists.
    expect(row!["Net cash flow"]).toBe("Unavailable");
    // Data quality note should explain why
    expect(row!["Data quality note"]).toContain("Net cash flow unavailable");
    expect(row!["Data quality note"]).toContain("invoiced is not cash inflow");
    // Legacy figures should still be present
    expect(row!["Legacy fee received (unverified)"]).toBe(200000);
  });

  it("queries only non-cancelled DueBills and preserves legacy data (T55)", async () => {
    vi.mocked(prisma.dueBill.findMany).mockResolvedValueOnce([
      {
        billAmount: 30000,
        receivedAmount: 30000,
        chequeAmount: 25000,
        billDate: new Date("2025-04-10"),
        receiveDate: new Date("2025-04-20"),
      },
    ] as any);
    vi.mocked(prisma.fundFlow.findMany).mockResolvedValueOnce([
      {
        feeReceived: 50000,
        miscExp: 1000,
        staffExp: 2000,
        project: { workOrderDate: new Date("2025-04-01") },
      },
    ] as any);

    const result = await runReport("fundflow-monthly-cashflow");

    // Verify the Prisma query excludes cancelled bills
    const callArg = vi.mocked(prisma.dueBill.findMany).mock.calls[0][0];
    expect((callArg?.where?.status as any)?.not).toBe("CANCELLED");

    const row = result.rows.find((r: any) => r.Month === "2025-04");
    expect(row!["Actual invoiced"]).toBe(30000);
    expect(row!["Recorded settlement"]).toBe(30000);
    expect(row!["Legacy fee received (unverified)"]).toBe(50000);
  });
});
