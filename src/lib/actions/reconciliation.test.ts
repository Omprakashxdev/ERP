import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getProjectReconciliation, getProjectMonthlyBreakdown } from "./reconciliation";
import { prisma } from "@/lib/prisma";
import { withPermission } from "./wrapper";

vi.mock("./wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn(),
  audit: vi.fn(),
  sanitizeForAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
  },
}));

function dec(value: string | number): Decimal {
  return new Decimal(String(value));
}

describe("getProjectReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("T14: Authorization failure", () => {
    it("rejects access and does not return protected data", async () => {
      vi.mocked(withPermission).mockImplementation(async () => {
        return { success: false, error: "Forbidden" };
      });

      const result = await getProjectReconciliation("c1234567890123456789012345");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Forbidden");
      expect(result.data).toBeUndefined();
      expect(prisma.project.findUnique).not.toHaveBeenCalled();
    });
  });

  it("returns reconciliation data when authorized and project exists", async () => {
    vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Action failed" };
      }
    });

    const mockProject = {
      id: "c1234567890123456789012345",
      estimatedCost: dec("500000"),
      totalFee: dec("600000"),
      fundFlow: {
        id: "ff-1",
        miscExp: dec("0"),
        staffExp: dec("0"),
        totalProjectCost: dec("500000"),
        completedWorkAmt: dec("200000"),
        proposedDueBillAmount: dec("0"),
        feeReceived: dec("0"),
      },
      dueBills: [
        {
          id: "db-1",
          grossAmount: dec("100000"),
          sgst: dec("9000"),
          cgst: dec("9000"),
          billAmount: dec("118000"),
          chequeAmount: dec("0"),
          sd: dec("0"),
          itTds: dec("0"),
          receivedAmount: dec("0"),
          billDate: new Date("2026-01-15"),
          receiveDate: null,
          status: "PENDING",
        },
      ],
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
      feeStages: [
        { id: "fs-1", amount: dec("300000"), percentage: dec("50") },
        { id: "fs-2", amount: dec("300000"), percentage: dec("50") },
      ],
    };

    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

    const result = await getProjectReconciliation("c1234567890123456789012345");
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.projectId).toBe("c1234567890123456789012345");
    expect(result.data?.invoiceSettlementTotals.grossTotal.toString()).toBe("100000");
  });

  it("returns error when project does not exist", async () => {
    vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Action failed" };
      }
    });

    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

    const result = await getProjectReconciliation("c1234567890123456789012346");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Project not found");
  });

  describe("getProjectMonthlyBreakdown", () => {
    it("rejects unauthorized access and does not fetch protected data (T27)", async () => {
      vi.mocked(withPermission).mockImplementation(async () => {
        return { success: false, error: "Forbidden" };
      });

      const result = await getProjectMonthlyBreakdown("c1234567890123456789012345");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Forbidden");
      expect(result.data).toBeUndefined();
      expect(prisma.project.findUnique).not.toHaveBeenCalled();
    });

    it("returns monthly breakdown with FundFlowMonthly and DueBill data when authorized (T28)", async () => {
      vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
        try {
          return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : "Action failed" };
        }
      });

      const mockProject = {
        id: "c1234567890123456789012345",
        workOrderDate: new Date("2026-01-15"),
        fundFlow: {
          id: "ff-1",
          monthlyData: [
            { id: "ffm-1", month: 1, year: 2026, income: dec("100000"), expense: dec("20000"), net: dec("80000"), cumulative: dec("80000") },
            { id: "ffm-2", month: 2, year: 2026, income: dec("50000"), expense: dec("10000"), net: dec("40000"), cumulative: dec("120000") },
          ],
        },
        dueBills: [
          {
            id: "db-1",
            grossAmount: dec("100000"),
            sgst: dec("9000"),
            cgst: dec("9000"),
            billAmount: dec("118000"),
            chequeAmount: dec("0"),
            sd: dec("0"),
            itTds: dec("0"),
            receivedAmount: dec("0"),
            billDate: new Date("2026-01-10"),
            receiveDate: null,
            status: "PENDING",
          },
        ],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject as any);

      const result = await getProjectMonthlyBreakdown("c1234567890123456789012345");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.projectId).toBe("c1234567890123456789012345");
      expect(result.data?.fundFlowId).toBe("ff-1");
      expect(result.data?.months.length).toBe(2); // Jan (stored + derived) and Feb (stored only)

      const jan = result.data!.months.find((m) => m.year === 2026 && m.month === 1)!;
      expect(jan.storedIncome?.toString()).toBe("100000");
      expect(jan.storedIncomeClassification).toBe("UNKNOWN");
      expect(jan.storedExpense?.toString()).toBe("20000");
      expect(jan.derivedInvoiced?.toString()).toBe("118000");
      expect(jan.derivedReceived).toBeNull();
      expect(jan.fundFlowMonthlyId).toBe("ffm-1");
      expect(jan.invoicedDueBillIds).toContain("db-1");

      const feb = result.data!.months.find((m) => m.year === 2026 && m.month === 2)!;
      expect(feb.storedIncome?.toString()).toBe("50000");
      expect(feb.derivedInvoiced).toBeNull();
      expect(feb.derivedReceived).toBeNull();

      // Verify Prisma was called with correct include structure
      expect(prisma.project.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            fundFlow: expect.objectContaining({ include: { monthlyData: true } }),
            dueBills: true,
          }),
        })
      );
    });

    it("returns error when project does not exist (T29)", async () => {
      vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
        try {
          return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : "Action failed" };
        }
      });

      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);

      const result = await getProjectMonthlyBreakdown("c1234567890123456789012346");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Project not found");
    });
  });
});
