import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getFundFlows, getFundFlowByProjectId } from "./fund-flow";
import { prisma } from "@/lib/prisma";
import { withPermission } from "./wrapper";

vi.mock("./wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn(),
  audit: vi.fn(),
  sanitizeForAudit: vi.fn().mockImplementation(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function dec(value: string | number): Decimal {
  return new Decimal(String(value));
}

function mockWithPermission() {
  vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

describe("getFundFlows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("returns legacy remainingFee with explicit basis label (T39)", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        id: "c1234567890123456789012345",
        totalFee: dec("600000"),
        workOrderDate: new Date("2026-01-15"),
        region: { id: "r1", name: "North" },
        client: { id: "c1", name: "Client A" },
        contractor: null,
        assignments: [],
        feeStages: [],
        fundFlow: {
          id: "ff-1",
          projectId: "c1234567890123456789012345",
          miscExp: dec("0"),
          staffExp: dec("0"),
          totalProjectCost: dec("500000"),
          completedWorkAmt: dec("200000"),
          proposedDueBillAmount: dec("0"),
          feeReceived: dec("100000"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ] as any);
    vi.mocked(prisma.project.count).mockResolvedValue(1);

    const result = await getFundFlows();
    expect(result.success).toBe(true);
    const rows = (result.data as { rows: unknown[]; total: number }).rows;
    expect(rows.length).toBe(1);

    const row = rows[0] as Record<string, unknown>;
    expect(row.remainingFeeBasis).toBe("LEGACY_FEE_RECEIVED");
    expect(row.reconciliationAvailable).toBe(false);
    expect((row.remainingFee as Decimal).toString()).toBe("500000"); // 600000 - 100000
    expect((row.remainingWorkAmt as Decimal).toString()).toBe("300000"); // 500000 - 200000
  });

  it("does not include fabricated reconciliation data in list view (T40)", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        id: "c1234567890123456789012345",
        totalFee: dec("600000"),
        workOrderDate: new Date("2026-01-15"),
        region: { id: "r1", name: "North" },
        client: { id: "c1", name: "Client A" },
        contractor: null,
        assignments: [],
        feeStages: [],
        fundFlow: {
          id: "ff-1",
          projectId: "c1234567890123456789012345",
          miscExp: dec("0"),
          staffExp: dec("0"),
          totalProjectCost: dec("500000"),
          completedWorkAmt: dec("200000"),
          proposedDueBillAmount: dec("0"),
          feeReceived: dec("100000"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ] as any);
    vi.mocked(prisma.project.count).mockResolvedValue(1);

    const result = await getFundFlows();
    const rows = (result.data as { rows: unknown[]; total: number }).rows;
    const row = rows[0] as Record<string, unknown>;

    expect(row.totalInvoiced).toBeUndefined();
    expect(row.totalSettlement).toBeUndefined();
    expect(row.totalRecordedCheque).toBeUndefined();
    expect(row.outstandingPerSettlement).toBeUndefined();
  });
});

describe("getFundFlowByProjectId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("returns null when project does not exist (T41)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it("returns legacy fields plus reconciliation-derived figures (T42)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "c1234567890123456789012345",
      totalFee: dec("600000"),
      estimatedCost: dec("500000"),
      workOrderDate: new Date("2026-01-15"),
      region: { id: "r1", name: "North" },
      client: { id: "c1", name: "Client A" },
      contractor: null,
      assignments: [],
      feeStages: [],
      fundFlow: {
        id: "ff-1",
        projectId: "c1234567890123456789012345",
        miscExp: dec("0"),
        staffExp: dec("0"),
        totalProjectCost: dec("500000"),
        completedWorkAmt: dec("200000"),
        proposedDueBillAmount: dec("0"),
        feeReceived: dec("100000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      dueBills: [
        {
          id: "db-1",
          grossAmount: dec("100000"),
          sgst: dec("9000"),
          cgst: dec("9000"),
          billAmount: dec("118000"),
          chequeAmount: dec("50000"),
          sd: dec("9000"),
          itTds: dec("9000"),
          receivedAmount: dec("68000"),
          billDate: new Date("2026-01-10"),
          receiveDate: new Date("2026-01-15"),
          status: "PAID",
        },
      ],
      wip: null,
    } as any);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.remainingFeeBasis).toBe("LEGACY_FEE_RECEIVED");
    expect(data.reconciliationAvailable).toBe(true);

    // Legacy values preserved
    expect((data.remainingFee as Decimal).toString()).toBe("500000"); // 600000 - 100000
    expect((data.legacyFeeReceived as Decimal).toString()).toBe("100000");

    // Reconciliation-derived values present
    expect((data.totalContractFee as Decimal).toString()).toBe("600000");
    expect((data.totalInvoiced as Decimal).toString()).toBe("118000");
    expect((data.totalSettlement as Decimal).toString()).toBe("68000"); // 50000 + 9000 + 9000
    expect((data.totalRecordedCheque as Decimal).toString()).toBe("50000");
    expect((data.outstandingPerSettlement as Decimal).toString()).toBe("50000"); // 118000 - 68000

    // Explicit limitation note for recorded cheques
    expect(typeof data.recordedCashLabel).toBe("string");
    expect((data.recordedCashLabel as string).length).toBeGreaterThan(0);
  });

  it("preserves legacy values when no FundFlow record exists (T43)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "c1234567890123456789012345",
      totalFee: dec("600000"),
      estimatedCost: dec("500000"),
      workOrderDate: new Date("2026-01-15"),
      region: { id: "r1", name: "North" },
      client: { id: "c1", name: "Client A" },
      contractor: null,
      assignments: [],
      feeStages: [],
      fundFlow: null,
      dueBills: [],
      wip: null,
    } as any);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    // Existing behavior: when no FundFlow exists, remainingFee defaults to 0.00
    expect((data.remainingFee as Decimal).toString()).toBe("0");
    expect((data.remainingWorkAmt as Decimal).toString()).toBe("0"); // no fundFlow
    expect(data.legacyFeeReceived).toBeNull();
    expect(data.reconciliationAvailable).toBe(true);
  });

  it("does not double-count dueBills in reconciliation totals (T44)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "c1234567890123456789012345",
      totalFee: dec("600000"),
      estimatedCost: dec("500000"),
      workOrderDate: new Date("2026-01-15"),
      region: { id: "r1", name: "North" },
      client: { id: "c1", name: "Client A" },
      contractor: null,
      assignments: [],
      feeStages: [],
      fundFlow: {
        id: "ff-1",
        projectId: "c1234567890123456789012345",
        miscExp: dec("0"),
        staffExp: dec("0"),
        totalProjectCost: dec("500000"),
        completedWorkAmt: dec("200000"),
        proposedDueBillAmount: dec("0"),
        feeReceived: dec("100000"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      dueBills: [
        {
          id: "db-1",
          grossAmount: dec("100000"),
          sgst: dec("9000"),
          cgst: dec("9000"),
          billAmount: dec("118000"),
          chequeAmount: dec("50000"),
          sd: dec("9000"),
          itTds: dec("9000"),
          receivedAmount: dec("68000"),
          billDate: new Date("2026-01-10"),
          receiveDate: new Date("2026-01-15"),
          status: "PAID",
        },
        {
          id: "db-2",
          grossAmount: dec("50000"),
          sgst: dec("4500"),
          cgst: dec("4500"),
          billAmount: dec("59000"),
          chequeAmount: dec("30000"),
          sd: dec("0"),
          itTds: dec("0"),
          receivedAmount: dec("30000"),
          billDate: new Date("2026-02-10"),
          receiveDate: new Date("2026-02-15"),
          status: "PAID",
        },
      ],
      wip: null,
    } as any);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    const data = result.data as Record<string, unknown>;

    expect((data.totalInvoiced as Decimal).toString()).toBe("177000"); // 118000 + 59000
    expect((data.totalSettlement as Decimal).toString()).toBe("98000"); // 68000 + 30000
    expect((data.totalRecordedCheque as Decimal).toString()).toBe("80000"); // 50000 + 30000
    expect((data.outstandingPerSettlement as Decimal).toString()).toBe("79000"); // 177000 - 98000
  });

  it("exposes WIP RA-bill project expenses when WIP data exists (T45)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "c1234567890123456789012345",
      totalFee: dec("600000"),
      estimatedCost: dec("500000"),
      workOrderDate: new Date("2026-01-15"),
      region: { id: "r1", name: "North" },
      client: { id: "c1", name: "Client A" },
      contractor: null,
      assignments: [],
      feeStages: [],
      fundFlow: null,
      dueBills: [],
      wip: {
        id: "wip-1",
        amountOfWorkDone: dec("200000"),
        finalProgressAmount: null,
        raBill1Amount: dec("50000"),
        raBill2Amount: dec("50000"),
        raBill3Amount: dec("50000"),
        raBill4Amount: dec("50000"),
        raBill1SaecFee: dec("10000"),
        raBill2SaecFee: dec("10000"),
        raBill3SaecFee: dec("10000"),
        raBill4SaecFee: dec("10000"),
        raBill1ProjectExpense: dec("5000"),
        raBill2ProjectExpense: dec("5000"),
        raBill3ProjectExpense: dec("5000"),
        raBill4ProjectExpense: dec("5000"),
      },
    } as any);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.reconciliationAvailable).toBe(true);
    expect((data.wipRaBillProjectExpense as Decimal).toString()).toBe("20000"); // 5000 * 4
  });

  it("returns null WIP RA-bill project expenses when WIP is absent (T46)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "c1234567890123456789012345",
      totalFee: dec("600000"),
      estimatedCost: dec("500000"),
      workOrderDate: new Date("2026-01-15"),
      region: { id: "r1", name: "North" },
      client: { id: "c1", name: "Client A" },
      contractor: null,
      assignments: [],
      feeStages: [],
      fundFlow: null,
      dueBills: [],
      wip: null,
    } as any);

    const result = await getFundFlowByProjectId("c1234567890123456789012345");
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.reconciliationAvailable).toBe(true);
    expect(data.wipRaBillProjectExpense).toBeNull();
  });
});
