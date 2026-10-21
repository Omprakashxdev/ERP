/**
 * Fund Flow confirmed requirements — integration test on the disposable
 * database `saec_erp_fundflow_test` (schema migrated there only).
 * RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...saec_erp_fundflow_test
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    _a: string,
    fn: (u: { id: string }) => unknown
  ) => {
    try {
      return { success: true, data: await fn({ id: "int-test" }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  checkRateLimit: async () => {},
  audit: async () => {},
  sanitizeForAudit: async (v: unknown) => v,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { upsertFundFlow } from "../actions/fund-flow";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
let regionId = "";
let clientId = "";
let projectId = "";

(SKIP ? describe.skip : describe)("fund flow confirmed fields — disposable DB", () => {
  beforeAll(async () => {
    const region = await prisma.region.create({ data: { name: "Rajkot FF-Test" } });
    regionId = region.id;
    const client = await prisma.client.create({
      data: { name: "FF Test Client", abbreviation: "FFT" },
    });
    clientId = client.id;
    const project = await prisma.project.create({
      data: {
        regionId,
        clientId,
        name: "FF Confirmed Test Project",
        abbreviation: "FFTP",
        workOrderDate: new Date("2026-04-01T00:00:00Z"),
        timeLimitMonths: 12,
        additionalTimeMonths: 6,
        targetTimeLimitMonths: 18,
        stipulatedCompletionDate: new Date("2027-03-31T00:00:00Z"),
        targetCompletionDate: new Date("2027-09-30T00:00:00Z"),
        workType: "DESIGN",
        serviceType: "PMC",
      },
    });
    projectId = project.id;
  });
  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
    await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("stores component fields and computes Staff Exp. = 1.60", async () => {
    const res = await upsertFundFlow({
      projectId,
      teamLeaderExp: "0.50",
      residentialEngineerExp: "0.40",
      designEngineerExp: "0.30",
      siteEngineerExp: "0.35",
      miscExp: "0.05",
      totalProjectCost: "22000",
      completedWorkAmt: "15000",
      feePercentage: 0.22727,
      proposedDueBillAmount: "5.56",
      feeReceived: "0",
      staffExp: "999", // client-supplied total must be ignored
    } as never);
    expect(res.success).toBe(true);
    const ff = await prisma.fundFlow.findUnique({ where: { projectId } });
    expect(ff!.staffExp.toString()).toBe("1.6");
    expect(ff!.teamLeaderExp.toString()).toBe("0.5");
  });

  it("Total Fee synced to Project = 49.9994 (exact Decimal)", async () => {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    expect(p!.totalFee.toString()).toBe("49.9994");
  });

  it("initial distribution: 18 allocations Jul 2026→Dec 2027", async () => {
    const res = await upsertFundFlow({
      projectId,
      distributionStartMonth: 7,
      distributionStartYear: 2026,
    } as never);
    expect(res.success).toBe(true);
    expect(res.data!.createdAllocations).toBe(18);
    const rows = await prisma.fundFlowMonthly.findMany({
      where: { fundFlow: { projectId } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    expect(rows.length).toBe(18);
    expect(`${rows[0].year}-${rows[0].month}`).toBe("2026-7");
    expect(`${rows[17].year}-${rows[17].month}`).toBe("2027-12");
    expect(rows[0].income.toString()).toBe("2.777744");
    // all 18 accounted: total = 49.999392, residual 0.000008 reported
    expect(res.data!.roundingResidual).toBe("0.000008");
  });

  it("editing fee recvd recalculates remaing fee only — allocations untouched", async () => {
    const res = await upsertFundFlow({
      projectId,
      feeReceived: "10",
    } as never);
    expect(res.success).toBe(true);
    const rows = await prisma.fundFlowMonthly.findMany({
      where: { fundFlow: { projectId } },
    });
    expect(rows.length).toBe(18); // unchanged — no silent regeneration
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    expect(p!.totalFee.toString()).toBe("49.9994"); // fee unchanged
  });

  it("no silent regeneration on subsequent saves", async () => {
    const res = await upsertFundFlow({
      projectId,
      distributionStartMonth: 8,
      distributionStartYear: 2026,
    } as never);
    expect(res.success).toBe(true);
    const rows = await prisma.fundFlowMonthly.findMany({
      where: { fundFlow: { projectId } },
    });
    expect(rows.length).toBe(18); // allocations never silently replaced
  });
});
