import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  previewMonthlyPlan,
  applyMonthlyPlan,
} from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    fundFlow: { findUnique: vi.fn() },
    fundFlowMonthly: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v: any) => v),
}));

const prismaMock = prisma as any;
const PID = "c5s1d1g8e2f3h4i5j6k7l8m9";

function setup(project: any, fundFlow: any, auditEntries: any[] = []) {
  prismaMock.project.findUnique.mockResolvedValue(project);
  prismaMock.fundFlow.findUnique.mockResolvedValue(fundFlow);
  prismaMock.auditLog.findMany.mockResolvedValue(auditEntries);
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
}

describe("Monthly income plan (Phase 1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Action failed" };
      }
    });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it("preview: 49.9994 / 18 starting Jul 2026 -> 2.777744 each (row 6)", async () => {
    setup(
      { id: PID, name: "P1", totalFee: new Decimal("49.9994") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [] }
    );
    const res = await previewMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 18, startMonth: 7, startYear: 2026,
    });
    expect(res.success).toBe(true);
    const data = res.data!;
    expect(data.perMonth).toBe("2.777744");
    expect(data.createCount).toBe(18);
    expect(data.plannedTotal).toBe("49.999392"); // 18 * 2.777744, within ±0.01 of 49.9994
    for (const item of data.items) {
      expect(item.status).toBe("create");
      expect(item.plannedAmount).toBe("2.777744");
    }
    // months should be Jul 2026 .. Dec 2027
    expect(data.items[0]).toMatchObject({ month: 7, year: 2026 });
    expect(data.items[17]).toMatchObject({ month: 12, year: 2027 });
  });

  it("preview: remaining-fee basis uses totalFee - feeReceived (row 8)", async () => {
    setup(
      { id: PID, name: "P2", totalFee: new Decimal("10.11048") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [] }
    );
    const res = await previewMonthlyPlan({
      projectId: PID, basis: "REMAINING_FEE", installments: 4, startMonth: 9, startYear: 2026,
    });
    expect(res.success).toBe(true);
    expect(res.data!.perMonth).toBe("2.52762");
    expect(res.data!.createCount).toBe(4);
    expect(res.data!.items.map((i: any) => [i.month, i.year])).toEqual([
      [9, 2026], [10, 2026], [11, 2026], [12, 2026],
    ]);
  });

  it("preview: fee-received basis (row 9: T9/2 = 3.43)", async () => {
    setup(
      { id: PID, name: "P3", totalFee: new Decimal("8.58") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("6.86"), monthlyData: [] }
    );
    const res = await previewMonthlyPlan({
      projectId: PID, basis: "LEGACY_FEE_RECEIVED", installments: 2, startMonth: 4, startYear: 2026,
    });
    expect(res.success).toBe(true);
    expect(res.data!.perMonth).toBe("3.43");
  });

  it("apply: existing different value is a conflict — kept by default, never overwritten", async () => {
    const monthlyData = [
      { id: "m-old", fundFlowId: "ff1", month: 7, year: 2026, income: new Decimal("5.5"), expense: new Decimal(0), net: new Decimal(0), cumulative: new Decimal(0) },
    ];
    setup(
      { id: PID, name: "P1", totalFee: new Decimal("49.9994") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData }
    );
    prismaMock.auditLog.findMany.mockResolvedValue([
      { entityId: "m-old", entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } },
    ]);
    prismaMock.fundFlowMonthly.create.mockImplementation(async ({ data }: any) => ({ id: "new-" + data.month + "-" + data.year, ...data }));

    const preview = await previewMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 18, startMonth: 7, startYear: 2026,
    });
    const conflict = preview.data!.items.find((i: any) => i.month === 7 && i.year === 2026)!;
    expect(conflict.status).toBe("conflict");
    expect(conflict.existingAmount).toBe("5.5");

    // Default apply (no replace keys) keeps the existing value
    const res = await applyMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 18, startMonth: 7, startYear: 2026,
    });
    expect(res.success).toBe(true);
    expect(res.data!.created).toBe(17);
    expect(res.data!.replaced).toBe(0);
    expect(prismaMock.fundFlowMonthly.update).not.toHaveBeenCalled();
  });

  it("apply: explicit replace key updates the conflict month with old/new audit", async () => {
    const rec = { id: "m-old", fundFlowId: "ff1", month: 7, year: 2027, income: new Decimal("5"), expense: new Decimal(0), net: new Decimal(0), cumulative: new Decimal(0) };
    setup(
      { id: PID, name: "T", totalFee: new Decimal("49.9994") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [rec] }
    );
    prismaMock.auditLog.findMany.mockResolvedValue([
      { entityId: "m-old", entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } },
    ]);
    prismaMock.fundFlowMonthly.findUnique.mockImplementation(async ({ where }: any) =>
      where.fundFlowId_month_year.month === 7 && where.fundFlowId_month_year.year === 2027 ? rec : null
    );
    prismaMock.fundFlowMonthly.create.mockImplementation(async ({ data }: any) => ({ id: "x", ...data }));
    prismaMock.auditLog.count = vi.fn().mockResolvedValue(1);

    // Apr 2026 + 18 months -> Jul 2027 is within the plan range
    const res = await applyMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 18, startMonth: 4, startYear: 2026,
      replace: ["2027-7"],
    });
    expect(res.success).toBe(true);
    expect(res.data!.replaced).toBe(1);
    expect(prismaMock.fundFlowMonthly.update).toHaveBeenCalledWith({
      where: { id: "m-old" },
      data: { income: expect.any(Decimal) },
    });
    const updMeta = prismaMock.auditLog.create.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.action === "update");
    expect(updMeta.metadata.oldValue).toBe("5");
    expect(updMeta.metadata.newValue).toBe("2.777744");
  });

  it("apply: stale conflict (amount changed after preview) aborts everything", async () => {
    const stale = { id: "m-old", fundFlowId: "ff1", month: 7, year: 2026, income: new Decimal("9"), expense: new Decimal(0), net: new Decimal(0), cumulative: new Decimal(0) };
    const previewRec = { ...stale, income: new Decimal("5.5") };
    setup(
      { id: PID, name: "T", totalFee: new Decimal("49.9994") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [previewRec] }
    );
    prismaMock.auditLog.findMany.mockResolvedValue([
      { entityId: "m-old", entity: "FundFlowMonthly", action: "create", metadata: { source: "ff-01k-workbook-allocation" } },
    ]);
    // tx-time record shows a DIFFERENT income than the preview saw
    prismaMock.fundFlowMonthly.findUnique.mockImplementation(async ({ where }: any) =>
      where.fundFlowId_month_year.month === 7 && where.fundFlowId_month_year.year === 2026 ? stale : null
    );
    prismaMock.fundFlowMonthly.create.mockImplementation(async ({ data }: any) => ({ id: "x", ...data }));

    const res = await applyMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 18, startMonth: 7, startYear: 2026,
      replace: ["2026-7"],
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("changed");
    expect(prismaMock.fundFlowMonthly.update).not.toHaveBeenCalled();
  });

  it("rejects >6dp via server-side Decimal check is irrelevant here; plan stores round6", async () => {
    setup(
      { id: PID, name: "P", totalFee: new Decimal("10.11048") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [] }
    );
    const res = await previewMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 4, startMonth: 9, startYear: 2026,
    });
    expect(res.data!.perMonth).toBe("2.52762");
  });

  it("empty basis: totalFee = 0 -> unavailableReason, nothing created", async () => {
    setup(
      { id: PID, name: "P", totalFee: new Decimal("0") },
      { id: "ff1", projectId: PID, feeReceived: new Decimal("0"), monthlyData: [] }
    );
    const res = await previewMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 4, startMonth: 4, startYear: 2026,
    });
    expect(res.success).toBe(true);
    expect(res.data!.unavailableReason).toContain("total fee is zero");
    const res2 = await applyMonthlyPlan({
      projectId: PID, basis: "TOTAL_FEE", installments: 4, startMonth: 4, startYear: 2026,
    });
    expect(res2.success).toBe(false);
    expect(prismaMock.fundFlowMonthly.create).not.toHaveBeenCalled();
  });
});
