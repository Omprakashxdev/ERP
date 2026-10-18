import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: any) => fn({
      workInProgress: {
        create: vi.fn(async (d: any) => ({ id: "cwip1", ...d.data })),
        findUnique: vi.fn(async () => ({ id: "cwip1" })),
        update: vi.fn(async (d: any) => ({ id: "cwip1", ...d.data })),
        findMany: vi.fn(),
      },
      wipAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
      project: { findUnique: vi.fn() },
    })),
    workInProgress: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    project: { findUnique: vi.fn(async () => ({ id: "cprj1" })) },
    contractor: { findUnique: vi.fn() },
    task: { findFirst: vi.fn(), findMany: vi.fn(async () => []), create: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(async (_m: string, _a: string, fn: any) => {
    const data = await fn({ id: "u1", role: "ADMIN", email: "a@x.com" });
    return { success: true, data };
  }),
  checkRateLimit: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
  sanitizeForAudit: vi.fn(async (x: any) => x),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;

describe("WIP RA Bill extended fields (FINAL P1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("update persists woNo/details/certificate/testCopy per bill slot", async () => {
    const { updateWip } = await import("../actions/wip");
    const update = prismaMock.$transaction;
    let captured: any;
    update.mockImplementation(async (fn: any) => fn({
      workInProgress: {
        findUnique: vi.fn(async () => ({ id: "cmo0000000000000000000001" })),
        update: vi.fn(async (d: any) => { captured = d.data; return d.data; }),
      },
      wipAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
    }));

    const r = await updateWip({
      id: "cmo0000000000000000000001",
      raBill2WoNo: "WO/2026/77",
      raBill2Details: "Final bill — slab work",
      raBill2CertificatePath: "/uploads/cert2.pdf",
      raBill2TestCopyPath: "/uploads/test2.pdf",
    });
    expect(r.success).toBe(true);
    expect(captured.raBill2WoNo).toBe("WO/2026/77");
    expect(captured.raBill2Details).toBe("Final bill — slab work");
    expect(captured.raBill2CertificatePath).toBe("/uploads/cert2.pdf");
    expect(captured.raBill2TestCopyPath).toBe("/uploads/test2.pdf");
  });

  it("contractor panel exposes cert/test copy separately from bill copy", async () => {
    const { getContractorLinkedRaBills } = await import("../actions/contractor");
    prismaMock.contractor.findUnique.mockResolvedValue({
      id: "ccon000000000000000000001",
      projects: [{ id: "cprj000000000000000000001", name: "Proj A" }],
    });
    prismaMock.workInProgress.findMany.mockResolvedValue([{
      projectId: "cprj000000000000000000001",
      raBill1Date: new Date("2026-10-01"),
      raBill1Amount: { toString: () => "150000" },
      raBill1Path: "/uploads/bill1.pdf",
      raBill1WoNo: "WO/1",
      raBill1Details: "d1",
      raBill1CertificatePath: "/uploads/cert1.pdf",
      raBill1TestCopyPath: null,
      raBill2Date: null, raBill2Amount: null, raBill2Path: null,
      raBill2WoNo: null, raBill2Details: null,
      raBill2CertificatePath: null, raBill2TestCopyPath: null,
      raBill3Date: null, raBill3Amount: null, raBill3Path: null,
      raBill3WoNo: null, raBill3Details: null,
      raBill3CertificatePath: null, raBill3TestCopyPath: null,
      raBill4Date: null, raBill4Amount: null, raBill4Path: null,
      raBill4WoNo: null, raBill4Details: null,
      raBill4CertificatePath: null, raBill4TestCopyPath: null,
    }]);

    const res = await getContractorLinkedRaBills("ccon000000000000000000001");
    expect(res.success).toBe(true);
    const rows = res.data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].documentPath).toBe("/uploads/bill1.pdf");
    expect(rows[0].certificatePath).toBe("/uploads/cert1.pdf");
    expect(rows[0].testCopyPath).toBeNull();
    expect(rows[0].woNo).toBe("WO/1");
  });
});
