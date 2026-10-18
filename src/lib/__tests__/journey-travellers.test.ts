import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journeyLog: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    journeyLogPhoto: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    journeyLogTraveller: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    vehicle: { findUnique: vi.fn() },
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
const VEHICLE = { id: "cv00000000000000000000001", registrationNo: "GJ01AB1234" };
const BASE = {
  vehicleId: VEHICLE.id,
  journeyDate: new Date("2026-10-10"),
  fromLocation: "A",
  toLocation: "B",
  startKm: 100,
  endKm: 150,
};

describe("JourneyLog travellers (P2 stable staff identity)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.vehicle.findUnique.mockResolvedValue(VEHICLE);
    prismaMock.journeyLog.create.mockResolvedValue({ id: "cjour00000000000000000001" });
    prismaMock.journeyLog.update.mockResolvedValue({ id: "cjour00000000000000000001" });
    prismaMock.journeyLog.findUnique.mockResolvedValue({ id: "cjour00000000000000000001", startKm: { toString: () => "100" }, endKm: { toString: () => "150" } });
    prismaMock.journeyLogTraveller.findMany.mockResolvedValue([]);
  });

  it("create stores stable staff ids via join rows", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    await createJourneyLog({
      ...BASE,
      approvalStatus: "PENDING",
      personsTravelling: "Foram Shah, Neha Mehta",
      travellerStaffIds: ["csaaaaaaa", "csbbbbbbb"],
    } as any);
    const data = prismaMock.journeyLog.create.mock.calls[0][0].data;
    expect(data.travellers.create.map((t: any) => t.staffId)).toEqual([
      "csaaaaaaa",
      "csbbbbbbb",
    ]);
    // display text preserved for readable output
    expect(data.personsTravelling).toBe("Foram Shah, Neha Mehta");
  });

  it("update syncs only the diff — unchanged travellers preserved", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    prismaMock.journeyLogTraveller.findMany.mockResolvedValue([
      { staffId: "cs-old" },
      { staffId: "cs-keep" },
    ]);
    await updateJourneyLog({
      id: "cjour00000000000000000001",
      travellerStaffIds: ["cs-keep", "cs-new"],
    } as any);
    expect(prismaMock.journeyLogTraveller.deleteMany).toHaveBeenCalledWith({
      where: { journeyLogId: "cjour00000000000000000001", staffId: { in: ["cs-old"] } },
    });
    expect(prismaMock.journeyLogTraveller.createMany).toHaveBeenCalledWith({
      data: [{ journeyLogId: "cjour00000000000000000001", staffId: "cs-new" }],
    });
  });

  it("omitting travellerStaffIds leaves existing travellers untouched", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    await updateJourneyLog({ id: "cjour00000000000000000001", endKm: 160 } as any);
    expect(prismaMock.journeyLogTraveller.findMany).not.toHaveBeenCalled();
    expect(prismaMock.journeyLogTraveller.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.journeyLogTraveller.createMany).not.toHaveBeenCalled();
  });
});
