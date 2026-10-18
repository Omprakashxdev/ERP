import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journeyLog: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    journeyLogPhoto: { deleteMany: vi.fn() },
    project: { findMany: vi.fn() },
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
const VEHICLE_ID = "cveh000000000000000000001";
const LOG_ID = "cjl00000000000000000000001";

function mockSession(role = "ADMIN") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

const baseLog = {
  vehicleId: VEHICLE_ID,
  journeyDate: new Date("2026-10-18"),
  fromLocation: "Rajkot",
  toLocation: "Gondal",
  startKm: 12500,
  endKm: 12700,
};

describe("Journey Log KM rules (Phase 4C)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
  });

  it("start 12500 / end 12700 → total 200 KM computed server-side", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    prismaMock.journeyLog.create.mockResolvedValue({ id: LOG_ID });

    const res = await createJourneyLog(baseLog as any);
    expect(res.success).toBe(true);
    expect(
      prismaMock.journeyLog.create.mock.calls[0][0].data.totalKm.toString()
    ).toBe("200");
  });

  it("rejects endKm below startKm — never accepts contradictory readings", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    const res = await createJourneyLog({ ...baseLog, endKm: 12300 } as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("End KM");
    expect(prismaMock.journeyLog.create).not.toHaveBeenCalled();
  });

  it("update merges stored + new values before validating KM", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    // stored: start 12500, end 12700 — payload lowers endKm only
    prismaMock.journeyLog.findUnique.mockResolvedValue({
      id: LOG_ID,
      startKm: new Decimal(12500),
      endKm: new Decimal(12700),
      photos: [],
    });
    const res = await updateJourneyLog({ id: LOG_ID, endKm: 12400 } as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("End KM");
    expect(prismaMock.journeyLog.update).not.toHaveBeenCalled();
  });

  it("existing records without photos/expenses stay untouched on update", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    prismaMock.journeyLog.findUnique.mockResolvedValue({
      id: LOG_ID,
      startKm: new Decimal(12500),
      endKm: new Decimal(12700),
      photos: [],
    });
    prismaMock.journeyLog.update.mockResolvedValue({ id: LOG_ID });
    const res = await updateJourneyLog({
      id: LOG_ID,
      purpose: "Site visit",
    } as any);
    expect(res.success).toBe(true);
    const sent = prismaMock.journeyLog.update.mock.calls[0][0].data;
    expect(sent.purpose).toBe("Site visit");
    expect(sent.totalKm.toString()).toBe("200"); // recomputed correctly
  });
});

describe("getProjectNameSuggestions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
  });

  it("returns only ACTIVE project names for the purpose picker", async () => {
    const { getProjectNameSuggestions } = await import("../actions/vehicle-log-book");
    prismaMock.project.findMany.mockResolvedValue([
      { name: "GUDM Khambhaliya WS DPR" },
    ]);
    const res = await getProjectNameSuggestions();
    expect(res.success).toBe(true);
    expect(res.data).toEqual(["GUDM Khambhaliya WS DPR"]);
    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } })
    );
  });
});
