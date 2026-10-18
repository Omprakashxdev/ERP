import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contractor: { findUnique: vi.fn() },
    workInProgress: { findMany: vi.fn() },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;
const CONTRACTOR_ID = "cc0ntractor00000000000001";

function mockSession(role = "STAFF") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

const wipWithBills = {
  projectId: "cproj1",
  raBill1Date: new Date("2026-09-15"), raBill1Amount: { toString: () => "150000" }, raBill1Path: "/uploads/wip/ra1.pdf",
  raBill2Date: new Date("2026-10-01"), raBill2Amount: { toString: () => "75000" }, raBill2Path: null,
  raBill3Date: null, raBill3Amount: null, raBill3Path: null,
  raBill4Date: null, raBill4Amount: null, raBill4Path: null,
};

describe("getContractorLinkedRaBills (Phase 3C)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
  });

  it("returns only populated RA bill slots from linked projects' WIP", async () => {
    const { getContractorLinkedRaBills } = await import("../actions/contractor");
    prismaMock.contractor.findUnique.mockResolvedValue({
      id: CONTRACTOR_ID,
      projects: [{ id: "cproj1", name: "Road Project" }],
    });
    prismaMock.workInProgress.findMany.mockResolvedValue([wipWithBills]);

    const res = await getContractorLinkedRaBills(CONTRACTOR_ID);
    expect(res.success).toBe(true);
    // slots 3 & 4 empty → only 2 bills
    expect(res.data).toHaveLength(2);
    expect(res.data![0]).toMatchObject({
      projectName: "Road Project",
      billNo: 1,
      amount: "150000",
      documentPath: "/uploads/wip/ra1.pdf",
    });
    expect(res.data![1].billNo).toBe(2);
    expect(res.data![1].documentPath).toBeNull(); // missing doc handled
  });

  it("queries only the contractor's OWN project ids — no cross-contractor leak", async () => {
    const { getContractorLinkedRaBills } = await import("../actions/contractor");
    prismaMock.contractor.findUnique.mockResolvedValue({
      id: CONTRACTOR_ID,
      projects: [{ id: "cproj1", name: "Road Project" }],
    });
    prismaMock.workInProgress.findMany.mockResolvedValue([wipWithBills]);

    await getContractorLinkedRaBills(CONTRACTOR_ID);
    expect(prismaMock.workInProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: ["cproj1"] } } })
    );
  });

  it("returns an empty list when the contractor has no linked projects — nothing invented", async () => {
    const { getContractorLinkedRaBills } = await import("../actions/contractor");
    prismaMock.contractor.findUnique.mockResolvedValue({
      id: CONTRACTOR_ID,
      projects: [],
    });
    prismaMock.workInProgress.findMany.mockResolvedValue([]);

    const res = await getContractorLinkedRaBills(CONTRACTOR_ID);
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });

  it("denied permission returns failure without touching the database", async () => {
    vi.mocked(withPermission).mockImplementation(async () => ({
      success: false,
      error: "Forbidden",
    }));
    const { getContractorLinkedRaBills } = await import("../actions/contractor");
    const res = await getContractorLinkedRaBills(CONTRACTOR_ID);
    expect(res.success).toBe(false);
    expect(prismaMock.contractor.findUnique).not.toHaveBeenCalled();
  });
});

describe("Contractor master-reference schema", () => {
  it("accepts cuid master ids and preserves NULL on existing records", async () => {
    const { contractorUpdateSchema } = await import("../schemas/contractor");
    const MASTER_ID = "cmaster00000000000000001";
    const parsed = contractorUpdateSchema.parse({
      id: CONTRACTOR_ID,
      workOrderMasterId: MASTER_ID,
      drawingMasterId: MASTER_ID,
    });
    expect(parsed.workOrderMasterId).toBe(MASTER_ID);
    expect(parsed.drawingMasterId).toBe(MASTER_ID);
    // absent → unchanged (undefined)
    const minimal = contractorUpdateSchema.parse({ id: CONTRACTOR_ID });
    expect(minimal.workOrderMasterId).toBeUndefined();
    // explicit null clears the selection
    const cleared = contractorUpdateSchema.parse({
      id: CONTRACTOR_ID,
      workOrderMasterId: null,
    });
    expect(cleared.workOrderMasterId).toBeNull();
  });
});
