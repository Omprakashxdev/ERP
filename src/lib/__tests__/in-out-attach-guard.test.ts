import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inOutRegister: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    inOutRegisterDocument: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    pendingInOutUpload: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    inOutRegisterCcStaff: { deleteMany: vi.fn(), createMany: vi.fn() },
    staff: { findUnique: vi.fn() },
    task: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v: any) => v),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;
const STAFF_ID = "csta000000000000000000001";
const CLIENT_ID = "cclt000000000000000000001";

function mockSession(userId = "user-1") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: userId, role: "ADMIN" }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

const baseInput = {
  direction: "INWARD" as const,
  documentRefNo: "TEST/DOC/1",
  documentDate: new Date("2026-10-01"),
  receivedDate: new Date("2026-10-01"),
  clientId: CLIENT_ID,
  actionSuggestedStaffId: STAFF_ID,
  inwardType: "INFORMATIVE" as const,
};

describe("In-Out Register — private attachment ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
    prismaMock.staff.findUnique.mockResolvedValue({ id: STAFF_ID });
    prismaMock.inOutRegister.findFirst.mockResolvedValue(null); // refNo unique
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.$queryRaw.mockResolvedValue([{ lastSeq: 6 }]);
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.inOutRegister.create.mockImplementation(async ({ data }: any) => ({
      id: "new-entry",
      direction: "INWARD",
      ...data,
    }));
    prismaMock.pendingInOutUpload.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inOutRegisterDocument.findMany.mockResolvedValue([]);
  });

  it("create: rejects attaching another user's pending upload", async () => {
    // pending row exists but belongs to user-2
    prismaMock.pendingInOutUpload.findMany.mockResolvedValue([]);
    const { createInOutRegister } = await import("../actions/in-out-register");
    const res = await createInOutRegister({
      ...baseInput,
      documents: ["inout-priv/1792835073785_secret.pdf"],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not available/i);
  });

  it("create: allows attaching the user's OWN pending upload and consumes it", async () => {
    prismaMock.pendingInOutUpload.findMany.mockResolvedValue([
      { storedName: "1792835073785_mine.pdf" },
    ]);
    const { createInOutRegister } = await import("../actions/in-out-register");
    const res = await createInOutRegister({
      ...baseInput,
      documents: ["inout-priv/1792835073785_mine.pdf"],
    });
    expect(res.success).toBe(true);
    expect(prismaMock.pendingInOutUpload.deleteMany).toHaveBeenCalledWith({
      where: { storedName: { in: ["1792835073785_mine.pdf"] } },
    });
  });

  it("create: paths already linked to a register document are re-attachable", async () => {
    prismaMock.pendingInOutUpload.findMany.mockResolvedValue([]);
    prismaMock.inOutRegisterDocument.findMany.mockResolvedValue([
      { path: "inout-priv/1792835073785_shared.pdf" },
    ]);
    const { createInOutRegister } = await import("../actions/in-out-register");
    const res = await createInOutRegister({
      ...baseInput,
      documents: ["inout-priv/1792835073785_shared.pdf"],
    });
    expect(res.success).toBe(true);
  });

  it("create: legacy /uploads/ paths skip the pending check entirely", async () => {
    const { createInOutRegister } = await import("../actions/in-out-register");
    const res = await createInOutRegister({
      ...baseInput,
      documents: ["/uploads/in-out-register-doc/1_old.pdf"],
    });
    expect(res.success).toBe(true);
    expect(prismaMock.pendingInOutUpload.findMany).not.toHaveBeenCalled();
  });

  it("update: newly added private path must be the user's own pending upload", async () => {
    prismaMock.inOutRegister.findUnique.mockResolvedValue({
      id: "cent000000000000000000001",
      documentRefNo: "TEST/DOC/1",
      actionSuggestedStaffId: STAFF_ID,
      inwardType: "INFORMATIVE",
      modeId: null,
      documents: [],
      ccStaff: [],
    });
    prismaMock.pendingInOutUpload.findMany.mockResolvedValue([]); // not owned
    prismaMock.inOutRegister.update.mockResolvedValue({ id: "cent000000000000000000001" });
    const { updateInOutRegister } = await import("../actions/in-out-register");
    const res = await updateInOutRegister({
      id: "cent000000000000000000001",
      documents: ["inout-priv/1792835073785_theirs.pdf"],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not available/i);
    expect(prismaMock.inOutRegisterDocument.createMany).not.toHaveBeenCalled();
  });

  it("update: own pending upload is attachable and consumed", async () => {
    prismaMock.inOutRegister.findUnique.mockResolvedValue({
      id: "cent000000000000000000001",
      documentRefNo: "TEST/DOC/1",
      actionSuggestedStaffId: STAFF_ID,
      inwardType: "INFORMATIVE",
      modeId: null,
      documents: [],
      ccStaff: [],
    });
    prismaMock.pendingInOutUpload.findMany.mockResolvedValue([
      { storedName: "1792835073785_mine.pdf" },
    ]);
    prismaMock.inOutRegister.update.mockResolvedValue({ id: "cent000000000000000000001" });
    const { updateInOutRegister } = await import("../actions/in-out-register");
    const res = await updateInOutRegister({
      id: "cent000000000000000000001",
      documents: ["inout-priv/1792835073785_mine.pdf"],
    });
    expect(res.success).toBe(true);
    expect(prismaMock.inOutRegisterDocument.createMany).toHaveBeenCalled();
    expect(prismaMock.pendingInOutUpload.deleteMany).toHaveBeenCalled();
  });
});
