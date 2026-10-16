import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMonthlyAllocations,
  upsertMonthlyAllocation,
  MONTHLY_ALLOCATION_WINDOW,
} from "../actions/fund-flow-monthly";
import { prisma } from "../prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("../prisma", () => ({
  prisma: {
    fundFlow: {
      findUnique: vi.fn(),
    },
    fundFlowMonthly: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn(),
  audit: vi.fn(),
  sanitizeForAudit: vi.fn().mockImplementation(async (input: Record<string, unknown>) => input),
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

describe("FundFlowMonthly allocations (FF-01K)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithPermission();
  });

  describe("MONTHLY_ALLOCATION_WINDOW", () => {
    it("covers exactly 24 months from Apr 2026 to Mar 2028 (T60)", () => {
      expect(MONTHLY_ALLOCATION_WINDOW).toHaveLength(24);
      expect(MONTHLY_ALLOCATION_WINDOW[0]).toMatchObject({ year: 2026, month: 4 });
      expect(MONTHLY_ALLOCATION_WINDOW[23]).toMatchObject({ year: 2028, month: 3 });
    });

    it("labels are human-readable (T61)", () => {
      expect(MONTHLY_ALLOCATION_WINDOW[0].label).toContain("Apr");
      expect(MONTHLY_ALLOCATION_WINDOW[0].label).toContain("2026");
      expect(MONTHLY_ALLOCATION_WINDOW[11].label).toContain("Mar");
      expect(MONTHLY_ALLOCATION_WINDOW[11].label).toContain("2027");
    });
  });

  describe("getMonthlyAllocations", () => {
    it("returns empty when no FundFlow exists for project (T62)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce(null);

      const result = await getMonthlyAllocations("c1234567890123456789012345");
      expect(result.success).toBe(true);
      const data = result.data as { allocations: unknown[]; total: unknown };
      expect(data.allocations).toHaveLength(24);
      expect(data.allocations.every((a: any) => a.amount === null)).toBe(true);
      expect(data.total).toBeNull();
    });

    it("maps stored FundFlowMonthly.income to the correct month slots (T63)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
        monthlyData: [
          { id: "m1", month: 4, year: 2026, income: new Decimal("5000.00") },
          { id: "m2", month: 5, year: 2026, income: new Decimal("3000.50") },
          { id: "m3", month: 1, year: 2027, income: new Decimal("10000.00") },
        ],
      } as any);

      const result = await getMonthlyAllocations("c1234567890123456789012345");
      expect(result.success).toBe(true);
      const data = result.data as { allocations: any[]; total: Decimal | null };

      // Apr 2026 (index 0)
      expect(data.allocations[0].month).toBe(4);
      expect(data.allocations[0].year).toBe(2026);
      expect(data.allocations[0].amount?.toString()).toBe("5000");

      // May 2026 (index 1)
      expect(data.allocations[1].amount?.toString()).toBe("3000.5");

      // Jun 2026 (index 2) — missing
      expect(data.allocations[2].amount).toBeNull();

      // Jan 2027 (index 9)
      expect(data.allocations[9].month).toBe(1);
      expect(data.allocations[9].year).toBe(2027);
      expect(data.allocations[9].amount?.toString()).toBe("10000");

      // Total
      expect(data.total?.toString()).toBe("18000.5");
    });

    it("preserves null for months outside the 24-month window (T64)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
        monthlyData: [
          { id: "m1", month: 12, year: 2025, income: new Decimal("9999") },
        ],
      } as any);

      const result = await getMonthlyAllocations("c1234567890123456789012345");
      const data = result.data as { allocations: any[] };

      // Dec 2025 is outside the window, so all 24 slots should be null
      expect(data.allocations.every((a: any) => a.amount === null)).toBe(true);
    });
  });

  describe("upsertMonthlyAllocation", () => {
    it("creates a new FundFlowMonthly record with amount in income (T65)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.fundFlowMonthly.upsert).mockResolvedValueOnce({
        id: "m-new",
      } as any);

      const result = await upsertMonthlyAllocation({
        projectId: "c1234567890123456789012345",
        month: 6,
        year: 2026,
        amount: "7500.00",
      });

      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthly.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            fundFlowId: "ff-1",
            month: 6,
            year: 2026,
            income: expect.any(Decimal),
            expense: expect.any(Decimal),
            net: expect.any(Decimal),
            cumulative: expect.any(Decimal),
          }),
          update: { income: expect.any(Decimal) },
        })
      );
    });

    it("deletes the record when amount is null (T66)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.findUnique).mockResolvedValueOnce({
        id: "m-old",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.delete).mockResolvedValueOnce({} as any);

      const result = await upsertMonthlyAllocation({
        projectId: "c1234567890123456789012345",
        month: 6,
        year: 2026,
        amount: null,
      });

      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthly.delete).toHaveBeenCalledWith({
        where: { id: "m-old" },
      });
      expect(prisma.fundFlowMonthly.upsert).not.toHaveBeenCalled();
    });

    it("deletes the record when amount is empty string (T67)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.findUnique).mockResolvedValueOnce({
        id: "m-old",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.delete).mockResolvedValueOnce({} as any);

      const result = await upsertMonthlyAllocation({
        projectId: "c1234567890123456789012345",
        month: 6,
        year: 2026,
        amount: "",
      });

      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthly.delete).toHaveBeenCalled();
      expect(prisma.fundFlowMonthly.upsert).not.toHaveBeenCalled();
    });

    it("rejects when FundFlow does not exist (T68)", async () => {
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce(null);

      const result = await upsertMonthlyAllocation({
        projectId: "c1234567890123456789012345",
        month: 6,
        year: 2026,
        amount: "1000",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("FundFlow not found for project");
    });

    it("distinguishes zero from missing by record existence (T69)", async () => {
      // First, create a zero record
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
      } as any);
      vi.mocked(prisma.fundFlowMonthly.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.fundFlowMonthly.upsert).mockResolvedValueOnce({
        id: "m-zero",
      } as any);

      await upsertMonthlyAllocation({
        projectId: "c1234567890123456789012345",
        month: 6,
        year: 2026,
        amount: "0.00",
      });

      const upsertCalls = vi.mocked(prisma.fundFlowMonthly.upsert).mock.calls;
      expect(upsertCalls.length).toBeGreaterThan(0);
      const upsertCall = upsertCalls[0][0] as any;
      expect(upsertCall.create.income.toString()).toBe("0");

      // Then read it back — zero should appear as a real Decimal(0), not null
      vi.mocked(prisma.fundFlow.findUnique).mockResolvedValueOnce({
        id: "ff-1",
        monthlyData: [
          { id: "m-zero", month: 6, year: 2026, income: new Decimal("0.00") },
        ],
      } as any);

      const result = await getMonthlyAllocations("c1234567890123456789012345");
      const data = result.data as { allocations: any[] };
      const jun2026 = data.allocations.find(
        (a: any) => a.month === 6 && a.year === 2026
      );
      expect(jun2026.amount).not.toBeNull();
      expect(jun2026.amount.toString()).toBe("0");
    });
  });
});
