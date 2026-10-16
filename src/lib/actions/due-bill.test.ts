import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
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

  it("is a no-op and does not query or write FundFlow (T30)", async () => {
    await syncFundFlowFeeReceived("c1234567890123456789012345");

    expect(prisma.dueBill.aggregate).not.toHaveBeenCalled();
    expect(prisma.fundFlow.update).not.toHaveBeenCalled();
    expect(prisma.fundFlow.create).not.toHaveBeenCalled();
  });
});

describe("createDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("creates a DueBill but does not overwrite FundFlow.feeReceived (T31)", async () => {
    vi.mocked(prisma.dueBill.create).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
    } as any);

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
    expect(prisma.fundFlow.update).not.toHaveBeenCalled();
    expect(prisma.fundFlow.create).not.toHaveBeenCalled();
  });
});

describe("updateDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("updates a DueBill but does not overwrite FundFlow.feeReceived (T32)", async () => {
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
    expect(prisma.fundFlow.update).not.toHaveBeenCalled();
    expect(prisma.fundFlow.create).not.toHaveBeenCalled();
  });
});

describe("deleteDueBill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
  });

  it("deletes a DueBill but does not overwrite FundFlow.feeReceived (T33)", async () => {
    vi.mocked(prisma.dueBill.delete).mockResolvedValue({
      id: "c1234567890123456789012346",
      projectId: "c1234567890123456789012345",
    } as any);

    await deleteDueBill("c1234567890123456789012346");

    expect(prisma.dueBill.delete).toHaveBeenCalledWith({ where: { id: "c1234567890123456789012346" } });
    expect(prisma.fundFlow.update).not.toHaveBeenCalled();
    expect(prisma.fundFlow.create).not.toHaveBeenCalled();
  });
});

describe("preservation of existing financial records", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("leaves FundFlow untouched when syncFundFlowFeeReceived is invoked (T34)", async () => {
    vi.mocked(prisma.fundFlow.update).mockResolvedValue({ id: "ff-1" } as any);
    vi.mocked(prisma.fundFlow.create).mockResolvedValue({ id: "ff-new" } as any);

    await syncFundFlowFeeReceived("c1234567890123456789012345");

    expect(prisma.fundFlow.update).not.toHaveBeenCalled();
    expect(prisma.fundFlow.create).not.toHaveBeenCalled();
  });
});
