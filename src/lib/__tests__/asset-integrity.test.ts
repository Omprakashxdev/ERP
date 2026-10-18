import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), count: vi.fn(), delete: vi.fn() },
    assetMovement: { count: vi.fn() },
    staff: { findFirst: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
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
const ASSET_ID = "casst00000000000000000001";
const STAFF_ID = "cstf00000000000000000001";

function mockSession(role = "ADMIN") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

describe("Asset integrity (Phase 4D)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
    prismaMock.staff.findUnique.mockResolvedValue({ id: STAFF_ID, name: "Foram Shah" });
  });

  it("generates unique itemCode and category-patterned securityCode on create", async () => {
    const { createAsset } = await import("../actions/asset");
    prismaMock.asset.count.mockResolvedValue(2); // two existing Electronics
    prismaMock.asset.create.mockResolvedValue({ id: ASSET_ID });

    const res = await createAsset({
      name: "Fan",
      category: "Electronics",
      make: "Usha",
      quantity: 3,
      assigneeType: "PERSON",
      assigneeStaffId: STAFF_ID,
      assignedQuantity: 1,
    } as any);

    expect(res.success).toBe(true);
    const sent = prismaMock.asset.create.mock.calls[0][0].data;
    expect(sent.itemCode).toMatch(/^AST-\d+-\d{3}$/);
    // workbook pattern Ele/Fan/Usha/1 — category slice + name + make + count
    expect(sent.securityCode).toBe("Ele/Fan/Usha/3");
    // stable staff identity — no name guessing
    expect(sent.currentHolderId).toBe(STAFF_ID);
    // assignee name auto-resolved from the staff record
    expect(sent.assignee).toBe("Foram Shah");
    expect(sent).not.toHaveProperty("assigneeStaffId");
  });

  it("rejects negative quantity", async () => {
    const { createAsset } = await import("../actions/asset");
    const res = await createAsset({ name: "X", quantity: -2 } as any);
    expect(res.success).toBe(false);
    expect(prismaMock.asset.create).not.toHaveBeenCalled();
  });

  it("rejects assigned quantity exceeding total — merged against stored on update", async () => {
    const { updateAsset } = await import("../actions/asset");
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      quantity: new Decimal(2),
      assignedQuantity: new Decimal(0),
    });
    const res = await updateAsset({ id: ASSET_ID, assignedQuantity: 5 } as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("exceed");
    expect(prismaMock.asset.update).not.toHaveBeenCalled();
  });

  it("blocks delete when movement history exists — records preserved", async () => {
    const { deleteAsset } = await import("../actions/asset");
    prismaMock.assetMovement.count.mockResolvedValue(3);
    const res = await deleteAsset(ASSET_ID);
    expect(res.success).toBe(false);
    expect(res.error).toContain("movement");
    expect(prismaMock.asset.delete).not.toHaveBeenCalled();
  });

  it("update by staff id resolves the real person and rejects bogus ids", async () => {
    const { updateAsset } = await import("../actions/asset");
    prismaMock.asset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      quantity: new Decimal(4),
      assignedQuantity: new Decimal(0),
    });
    prismaMock.asset.update.mockResolvedValue({ id: ASSET_ID });
    prismaMock.staff.findUnique.mockResolvedValue({ id: STAFF_ID, name: "Foram Shah" });

    const res = await updateAsset({
      id: ASSET_ID,
      assigneeType: "PERSON",
      assigneeStaffId: STAFF_ID,
    } as any);
    expect(res.success).toBe(true);
    const sent = prismaMock.asset.update.mock.calls[0][0].data;
    expect(sent.currentHolderId).toBe(STAFF_ID);
    expect(sent.assignee).toBe("Foram Shah");

    prismaMock.staff.findUnique.mockResolvedValue(null);
    const bad = await updateAsset({
      id: ASSET_ID,
      assigneeType: "PERSON",
      assigneeStaffId: "cbogus000000000000000001",
    } as any);
    expect(bad.success).toBe(false);
    expect(bad.error).toContain("staff member");
  });
});

it("stores stable responsible-person id and keeps the readable name in sync", async () => {
  const { createAsset } = await import("../actions/asset");
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    const data = await fn({ id: "u1", role: "ADMIN", email: "a@x.com" });
    return { success: true, data };
  });
  prismaMock.staff.findUnique.mockResolvedValue({ id: STAFF_ID, name: "Foram Shah" });
  prismaMock.asset.count.mockResolvedValue(0);
  prismaMock.asset.create.mockResolvedValue({ id: ASSET_ID });
  const res = await createAsset({
    name: "Fan",
    category: "Electronics",
    quantity: 1,
    responsiblePersonId: STAFF_ID,
    quantity: 1,
  } as any);
  expect(res.success).toBe(true);
  const data = prismaMock.asset.create.mock.calls[0][0].data;
  expect(data.responsiblePersonId).toBe(STAFF_ID);
  expect(data.responsiblePerson).toBe("Foram Shah"); // resolved server-side
});

it("rejects a responsible-person id that matches no staff member", async () => {
  const { createAsset } = await import("../actions/asset");
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    const data = await fn({ id: "u1", role: "ADMIN", email: "a@x.com" });
    return { success: true, data };
  });
  prismaMock.asset.count.mockResolvedValue(0);
  prismaMock.staff.findUnique.mockResolvedValue(null);
  await expect(
    createAsset({
      name: "Fan",
      category: "Electronics",
      quantity: 1,
      responsiblePersonId: "bogus-staff",
      quantity: 1,
    } as any)
  ).rejects.toThrow("responsible person");
});
