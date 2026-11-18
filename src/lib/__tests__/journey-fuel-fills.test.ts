import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journeyLog: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    journeyLogPhoto: { deleteMany: vi.fn() },
    journeyFuel: { deleteMany: vi.fn(), createMany: vi.fn() },
    journeyStop: { deleteMany: vi.fn(), createMany: vi.fn() },
    journeyLogTraveller: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
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
  vi.mocked(withPermission).mockImplementation(
    async (_r: any, _a: any, fn: any) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role }) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Action failed",
        };
      }
    }
  );
}

const baseLog = {
  vehicleId: VEHICLE_ID,
  journeyDate: new Date("2026-10-18"),
  fromLocation: "Rajkot",
  toLocation: "Gondal",
  startKm: 12500,
  endKm: 12700,
};

const existingLog = {
  id: LOG_ID,
  startKm: new Decimal(12500),
  endKm: new Decimal(12700),
  photos: [],
};

describe("Journey fuel fills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
    prismaMock.journeyLog.findUnique.mockResolvedValue(existingLog);
    prismaMock.journeyLog.create.mockResolvedValue({ id: LOG_ID });
    prismaMock.journeyLog.update.mockResolvedValue({ id: LOG_ID });
    prismaMock.journeyLogTraveller.findMany.mockResolvedValue([]);
  });

  it("creates fill rows and folds totals into the legacy scalars", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    const res = await createJourneyLog({
      ...baseLog,
      fuelFills: [
        { expense: 500, litres: 5, rate: 100, billPath: "/a.pdf" },
        { expense: 300, litres: 3, rate: 100 },
      ],
    } as any);
    expect(res.success).toBe(true);

    const sent = prismaMock.journeyLog.create.mock.calls[0][0].data;
    expect(sent.fuelFills.create).toHaveLength(2);
    expect(Number(sent.fuelFills.create[0].expense)).toBe(500);
    expect(Number(sent.fuelFills.create[0].litres)).toBe(5);
    expect(Number(sent.fuelFills.create[0].rate)).toBe(100);
    expect(sent.fuelFills.create[0].billPath).toBe("/a.pdf");
    // Σ expense / Σ litres → blended rate
    expect(Number(sent.fuelExpense)).toBe(800);
    expect(Number(sent.fuelLitre)).toBe(8);
    expect(Number(sent.fuelRate)).toBe(100);
    expect(sent.fuelBillPath).toBe("/a.pdf");
  });

  it("blends rate across fills with different prices", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    await createJourneyLog({
      ...baseLog,
      fuelFills: [
        { expense: 400, litres: 4 },
        { expense: 660, litres: 6 },
      ],
    } as any);
    const sent = prismaMock.journeyLog.create.mock.calls[0][0].data;
    expect(Number(sent.fuelExpense)).toBe(1060);
    expect(Number(sent.fuelLitre)).toBe(10);
    expect(Number(sent.fuelRate)).toBe(106); // 1060/10 — not avg(100,110)
  });

  it("falls back to averaged rates when litres are missing", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    await createJourneyLog({
      ...baseLog,
      fuelFills: [{ rate: 100 }, { rate: 110 }],
    } as any);
    const sent = prismaMock.journeyLog.create.mock.calls[0][0].data;
    expect(sent.fuelExpense).toBeNull();
    expect(sent.fuelLitre).toBeNull();
    expect(Number(sent.fuelRate)).toBe(105);
  });

  it("leaves scalar fuel fields untouched when fuelFills is absent", async () => {
    const { createJourneyLog } = await import("../actions/vehicle-log-book");
    await createJourneyLog({
      ...baseLog,
      fuelExpense: 450,
      fuelLitre: 4.5,
      fuelRate: 100,
    } as any);
    const sent = prismaMock.journeyLog.create.mock.calls[0][0].data;
    expect(Number(sent.fuelExpense)).toBe(450);
    expect(Number(sent.fuelLitre)).toBe(4.5);
    expect(sent.fuelFills).toBeUndefined();
  });

  it("update replaces the fill list and resums the scalars", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    const res = await updateJourneyLog({
      id: LOG_ID,
      fuelFills: [{ expense: 700, litres: 7 }],
    } as any);
    expect(res.success).toBe(true);

    expect(prismaMock.journeyFuel.deleteMany).toHaveBeenCalledWith({
      where: { journeyLogId: LOG_ID },
    });
    const created = prismaMock.journeyFuel.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0].journeyLogId).toBe(LOG_ID);
    expect(Number(created[0].expense)).toBe(700);
    expect(Number(created[0].litres)).toBe(7);
    const sent = prismaMock.journeyLog.update.mock.calls[0][0].data;
    expect(Number(sent.fuelExpense)).toBe(700);
    expect(Number(sent.fuelLitre)).toBe(7);
  });

  it("update without fuelFills never touches the fill table or scalars", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    await updateJourneyLog({ id: LOG_ID, purpose: "Site visit" } as any);
    expect(prismaMock.journeyFuel.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.journeyFuel.createMany).not.toHaveBeenCalled();
    const sent = prismaMock.journeyLog.update.mock.calls[0][0].data;
    expect(sent.fuelExpense).toBeUndefined();
    expect(sent.fuelLitre).toBeUndefined();
  });

  it("update with an empty list clears fills and nulls the scalars", async () => {
    const { updateJourneyLog } = await import("../actions/vehicle-log-book");
    await updateJourneyLog({ id: LOG_ID, fuelFills: [] } as any);
    expect(prismaMock.journeyFuel.deleteMany).toHaveBeenCalledWith({
      where: { journeyLogId: LOG_ID },
    });
    expect(prismaMock.journeyFuel.createMany).not.toHaveBeenCalled();
    const sent = prismaMock.journeyLog.update.mock.calls[0][0].data;
    expect(sent.fuelExpense).toBeNull();
    expect(sent.fuelLitre).toBeNull();
    expect(sent.fuelRate).toBeNull();
    expect(sent.fuelBillPath).toBeNull();
  });
});
