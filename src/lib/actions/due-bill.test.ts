import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { DueBillStatus } from "@prisma/client";
import {
  createDueBill,
  updateDueBill,
  deleteDueBill,
  syncFundFlowFeeReceived,
} from "./due-bill";
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
    dueBill: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    fundFlow: {
      update: vi.fn(),
      create: vi.fn(),
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

describe("syncFundFlowFeeReceived", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("syncs sum of chequeAmount for non-cancelled bills (T30)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("75000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    expect(prisma.dueBill.aggregate).toHaveBeenCalledWith({
      where: { projectId: "c1234567890123456789012345", status: { notIn: [DueBillStatus.CANCELLED] } },
      _sum: { chequeAmount: true },
    });
    expect(prisma.fundFlow.update).toHaveBeenCalledWith({
      where: { projectId: "c1234567890123456789012345" },
      data: { feeReceived: dec("75000") },
    });
  });

  it("excludes cancelled bills from the aggregate (T31)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("50000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    const aggregateCall = vi.mocked(prisma.dueBill.aggregate).mock.calls[0][0];
    expect(aggregateCall.where).toMatchObject({
      projectId: "c1234567890123456789012345",
      status: { notIn: [DueBillStatus.CANCELLED] },
    });
  });

  it("creates FundFlow record when update fails (T32)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("30000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockRejectedValue(new Error("Not found"));
    vi.mocked(prisma.fundFlow.create).mockResolvedValue({ id: "ff-new" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    expect(prisma.fundFlow.create).toHaveBeenCalledWith({
      data: { projectId: "c1234567890123456789012345", feeReceived: dec("30000") },
    });
  });

  it("writes zero when no active bills exist (T33)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: null },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    expect(prisma.fundFlow.update).toHaveBeenCalledWith({
      where: { projectId: "c1234567890123456789012345" },
      data: { feeReceived: dec("0") },
    });
  });
});

describe("createDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("triggers feeReceived sync using chequeAmount after creation (T34)", async () => {
    vi.mocked(prisma.dueBill.create).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
    } as any);
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("100000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await createDueBill({
      projectId: "c1234567890123456789012345",
      scheme: "Scheme A",
      grossAmount: "100000",
      sgst: "9000",
      cgst: "9000",
      chequeAmount: "100000",
      sd: "0",
      itTds: "0",
      billDate: new Date("2026-01-10"),
      receiveDate: null,
      status: "PENDING",
      remarks: null,
    } as any);

    expect(prisma.dueBill.create).toHaveBeenCalled();
    expect(prisma.dueBill.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: [DueBillStatus.CANCELLED] } }),
        _sum: { chequeAmount: true },
      })
    );
    expect(prisma.fundFlow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { feeReceived: dec("100000") },
      })
    );
  });
});

describe("updateDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("triggers feeReceived sync using chequeAmount after update (T35)", async () => {
    vi.mocked(prisma.dueBill.findUnique).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
      grossAmount: dec("100000"),
      sgst: dec("9000"),
      cgst: dec("9000"),
      chequeAmount: dec("50000"),
      sd: dec("0"),
      itTds: dec("0"),
      receivedAmount: dec("50000"),
      billAmount: dec("118000"),
      status: "PARTIAL",
      billDate: new Date("2026-01-10"),
      receiveDate: new Date("2026-01-15"),
      remarks: null,
    } as any);

    vi.mocked(prisma.dueBill.update).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
    } as any);

    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("120000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await updateDueBill({
      id: "c1234567890123456789012346",
      grossAmount: "100000",
      sgst: "9000",
      cgst: "9000",
      chequeAmount: "70000",
      sd: "0",
      itTds: "0",
      billDate: new Date("2026-01-10"),
      receiveDate: new Date("2026-01-15"),
      status: "PARTIAL",
      remarks: null,
    } as any);

    expect(prisma.dueBill.update).toHaveBeenCalled();
    expect(prisma.dueBill.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: [DueBillStatus.CANCELLED] } }),
        _sum: { chequeAmount: true },
      })
    );
  });
});

describe("deleteDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("triggers feeReceived sync after deletion (T36)", async () => {
    vi.mocked(prisma.dueBill.delete).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
    } as any);
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("0") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await deleteDueBill("c1234567890123456789012346");

    expect(prisma.dueBill.delete).toHaveBeenCalledWith({ where: { id: "c1234567890123456789012346" } });
    expect(prisma.dueBill.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: [DueBillStatus.CANCELLED] } }),
        _sum: { chequeAmount: true },
      })
    );
  });
});

describe("settlement vs cheque amount separation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not include sd or itTds in feeReceived sync (T37)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("50000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    const updateCall = vi.mocked(prisma.fundFlow.update).mock.calls[0][0];
    expect(updateCall!.data!.feeReceived!.toString()).toBe("50000");
  });
});

describe("preservation of existing financial records", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("only updates feeReceived in FundFlow, leaving other fields untouched (T38)", async () => {
    vi.mocked(prisma.dueBill.aggregate).mockResolvedValue({
      _sum: { chequeAmount: dec("60000") },
    } as any);
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    const updateCall = vi.mocked(prisma.fundFlow.update).mock.calls[0][0];
    expect(updateCall).toEqual({
      where: { projectId: "c1234567890123456789012345" },
      data: { feeReceived: dec("60000") },
    });
  });
});
