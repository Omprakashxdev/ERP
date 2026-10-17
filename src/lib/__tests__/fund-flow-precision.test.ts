import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { upsertMonthlyAllocation } from "../actions/fund-flow-monthly";
import { projectCreateSchema } from "../schemas/project";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

// DECIMAL(23,6) widening: Project.totalFee + FundFlowMonthly.income only.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundFlow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    fundFlowMonthly: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    fundFlowMonthlyExpense: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
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

function baseProjectInput(totalFee: string) {
  return {
    regionId: "c5s1d1g8e2f3h4i5j6k7l8m9",
    clientId: "c5s1d1g8e2f3h4i5j6k7l8m9",
    name: "Precision Test Project",
    workOrderDate: new Date("2026-04-01"),
    timeLimitMonths: 12,
    workType: "Design",
    serviceType: "PMC",
    totalFee,
  };
}

describe("Decimal(23,6) precision — totalFee schema", () => {
  it("accepts 49.9994 (4dp) unchanged (T140)", () => {
    const parsed = projectCreateSchema.parse(baseProjectInput("49.9994"));
    expect(parsed.totalFee.toString()).toBe("49.9994");
  });

  it("accepts 10.11048 (5dp) unchanged (T141)", () => {
    const parsed = projectCreateSchema.parse(baseProjectInput("10.11048"));
    expect(parsed.totalFee.toString()).toBe("10.11048");
  });

  it("accepts 2.777744 (6dp) unchanged (T142)", () => {
    const parsed = projectCreateSchema.parse(baseProjectInput("2.777744"));
    expect(parsed.totalFee.toString()).toBe("2.777744");
  });

  it("rejects >6 fractional digits explicitly (T143)", () => {
    const result = projectCreateSchema.safeParse(baseProjectInput("1.1234567"));
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain("Amount must have up to 6 decimal places");
    }
  });

  it("accepts existing 2dp values without change (T144)", () => {
    const parsed = projectCreateSchema.parse(baseProjectInput("50.00"));
    expect(parsed.totalFee.toString()).toBe("50");
  });

  it("preserves 17-digit integer capacity with 6dp (T145)", () => {
    const parsed = projectCreateSchema.parse(
      baseProjectInput("99999999999999999.999999")
    );
    expect(parsed.totalFee.toString()).toBe("99999999999999999.999999");
  });

  it("rejects non-numeric input (T146)", () => {
    const result = projectCreateSchema.safeParse(baseProjectInput("abc"));
    expect(result.success).toBe(false);
  });
});

describe("Decimal(23,6) precision — FundFlowMonthly.income upsert", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
    vi.mocked(prisma.fundFlow.findUnique).mockResolvedValue({ id: "ff-1" } as any);
    vi.mocked(prisma.fundFlowMonthly.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as any);
  });

  async function upsert(amount: string) {
    return upsertMonthlyAllocation({
      projectId: "c5s1d1g8e2f3h4i5j6k7l8m9",
      month: 4,
      year: 2026,
      amount,
    });
  }

  it("stores 49.9994 / 18 installment (2.777744) unchanged (T147)", async () => {
    vi.mocked(prisma.fundFlowMonthly.create).mockResolvedValue({ id: "m1" } as any);
    const result = await upsert("2.777744");
    expect(result.success).toBe(true);
    const createCall = vi.mocked(prisma.fundFlowMonthly.create).mock.calls[0][0] as any;
    expect(createCall.data.income.toString()).toBe("2.777744");
  });

  it("stores 5dp income values unchanged (T148)", async () => {
    vi.mocked(prisma.fundFlowMonthly.create).mockResolvedValue({ id: "m2" } as any);
    const result = await upsert("10.11048");
    expect(result.success).toBe(true);
    const createCall = vi.mocked(prisma.fundFlowMonthly.create).mock.calls[0][0] as any;
    expect(createCall.data.income.toString()).toBe("10.11048");
  });

  it("rejects >6dp input instead of silently rounding (T149)", async () => {
    const result = await upsert("1.1234567");
    expect(result.success).toBe(false);
    expect(result.error).toContain("6 decimal places");
    expect(prisma.fundFlowMonthly.create).not.toHaveBeenCalled();
  });

  it("accepts 17-digit integer + 6dp (T150)", async () => {
    vi.mocked(prisma.fundFlowMonthly.create).mockResolvedValue({ id: "m3" } as any);
    const result = await upsert("99999999999999999.999999");
    expect(result.success).toBe(true);
    const createCall = vi.mocked(prisma.fundFlowMonthly.create).mock.calls[0][0] as any;
    expect(createCall.data.income.toString()).toBe("99999999999999999.999999");
  });

  it("accepts a 2dp value and writes it unchanged (T151)", async () => {
    vi.mocked(prisma.fundFlowMonthly.create).mockResolvedValue({ id: "m4" } as any);
    const result = await upsert("30.61");
    expect(result.success).toBe(true);
    const createCall = vi.mocked(prisma.fundFlowMonthly.create).mock.calls[0][0] as any;
    expect(createCall.data.income.toString()).toBe("30.61");
  });
});
