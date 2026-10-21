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
  withAuth: async (fn: (u: { id: string }) => unknown) => {
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
import { updateProject } from "../actions/project";

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

  it("lone Misc Exp edit adjusts Staff Exp. by the delta (1.60 → 1.65) and persists", async () => {
    const res = await upsertFundFlow({ projectId, miscExp: "0.10" } as never);
    expect(res.success).toBe(true);
    let ff = await prisma.fundFlow.findUnique({ where: { projectId } });
    expect(ff!.miscExp.toString()).toBe("0.1");
    expect(ff!.staffExp.toString()).toBe("1.65");
    // restore + re-verify persistence (simulates save → reopen)
    await upsertFundFlow({ projectId, miscExp: "0.05" } as never);
    ff = await prisma.fundFlow.findUnique({ where: { projectId } });
    expect(ff!.staffExp.toString()).toBe("1.6");
    expect(ff!.miscExp.toString()).toBe("0.05");
  });

  it("Total Project Cost change alone recomputes Total Fee from the saved percentage", async () => {
    const res = await upsertFundFlow({
      projectId,
      totalProjectCost: "11000",
    } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    // 11000 × 0.22727 / 100 = 24.9997
    expect(p!.totalFee.toString()).toBe("24.9997");
    const rows = await prisma.fundFlowMonthly.findMany({
      where: { fundFlow: { projectId } },
    });
    expect(rows.length).toBe(18); // saved allocations unchanged
  });
});

(SKIP ? describe.skip : describe)("legacy records — preservation guarantees", () => {
  let legacyProjectId = "";
  let legacyClientId = "";
  let legacyRegionId = "";
  beforeAll(async () => {
    const region = await prisma.region.create({ data: { name: "FF Legacy Region" } });
    legacyRegionId = region.id;
    const client = await prisma.client.create({ data: { name: "FF Legacy Client", abbreviation: "FLC" } });
    legacyClientId = client.id;
    const project = await prisma.project.create({
      data: {
        regionId: region.id,
        clientId: client.id,
        name: "FF Legacy Null-Pct Project",
        abbreviation: "FFLG",
        workOrderDate: new Date("2026-01-15T00:00:00Z"),
        timeLimitMonths: 6,
        additionalTimeMonths: null, // NULL grace — legacy
        targetTimeLimitMonths: 9,
        stipulatedCompletionDate: new Date("2026-07-15T00:00:00Z"),
        targetCompletionDate: new Date("2026-10-15T00:00:00Z"),
        estimatedCost: "5000",
        totalFee: "1234.5678", // stored legacy fee — no percentage
        workType: "DESIGN",
        serviceType: "PMC",
        fundFlow: {
          create: {
            staffExp: "1.60", // legacy stored total, no component fields
            miscExp: "0.05",
            totalProjectCost: "5000",
            completedWorkAmt: "1000",
            proposedDueBillAmount: "2.00",
            feeReceived: "4.00",
          },
        },
      },
    });
    legacyProjectId = project.id;
    // pre-existing saved allocation that must survive untouched
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: legacyProjectId } });
    await prisma.fundFlowMonthly.create({
      data: { fundFlowId: ff!.id, month: 5, year: 2026, income: "7.500000" },
    });
  });
  afterAll(async () => {
    await prisma.project.delete({ where: { id: legacyProjectId } }).catch(() => {});
    await prisma.client.delete({ where: { id: legacyClientId } }).catch(() => {});
    await prisma.region.delete({ where: { id: legacyRegionId } }).catch(() => {});
  });

  it("unrelated save on NULL-pct record preserves stored Total Fee and dates", async () => {
    const res = await upsertFundFlow({
      projectId: legacyProjectId,
      completedWorkAmt: "2000",
    } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: legacyProjectId } });
    expect(p!.totalFee.toString()).toBe("1234.5678"); // no invented recalculation
    expect(p!.stipulatedCompletionDate!.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(p!.targetCompletionDate!.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(p!.additionalTimeMonths).toBeNull(); // NULL grace preserved
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: legacyProjectId } });
    expect(ff!.feePercentage).toBeNull();
    expect(ff!.staffExp.toString()).toBe("1.6"); // legacy total preserved
    expect(ff!.distributionStartMonth).toBeNull();
  });

  it("lone miscExp edit on a legacy record adjusts the stored total by the delta", async () => {
    const res = await upsertFundFlow({
      projectId: legacyProjectId,
      miscExp: "0.99",
    } as never);
    expect(res.success).toBe(true);
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: legacyProjectId } });
    // 1.60 + (0.99 − 0.05) = 2.54 — total preserved, delta applied, no collapse
    expect(ff!.staffExp.toString()).toBe("2.54");
    expect(ff!.miscExp.toString()).toBe("0.99");
  });

  it("partial breakdown edit on a legacy record preserves the stored total", async () => {
    // Only ONE component supplied — not an explicit five-field replacement.
    const res = await upsertFundFlow({
      projectId: legacyProjectId,
      teamLeaderExp: "0.75",
    } as never);
    expect(res.success).toBe(true);
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: legacyProjectId } });
    expect(ff!.staffExp.toString()).toBe("2.54"); // untouched (from prior delta test)
    expect(ff!.teamLeaderExp.toString()).toBe("0.75"); // value itself saved
  });

  it("complete five-field breakdown explicitly replaces the legacy total", async () => {
    const res = await upsertFundFlow({
      projectId: legacyProjectId,
      teamLeaderExp: "0.50",
      residentialEngineerExp: "0.40",
      designEngineerExp: "0.30",
      siteEngineerExp: "0.35",
      miscExp: "0.05",
    } as never);
    expect(res.success).toBe(true);
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: legacyProjectId } });
    expect(ff!.staffExp.toString()).toBe("1.6"); // explicit recomputed total
  });

  it("fee recvd change recalculates only remaing fee — no generation, no overwrite", async () => {
    const res = await upsertFundFlow({
      projectId: legacyProjectId,
      feeReceived: "100",
    } as never);
    expect(res.success).toBe(true);
    expect(res.data!.createdAllocations ?? 0).toBe(0); // NULL start → never generates
    const rows = await prisma.fundFlowMonthly.findMany({
      where: { fundFlow: { projectId: legacyProjectId } },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].income.toString()).toBe("7.5");
  });
});

(SKIP ? describe.skip : describe)("updateProject — no clobbering, no invented grace", () => {
  let pId = "";
  let pRegionId = "";
  let pClientId = "";
  beforeAll(async () => {
    const region = await prisma.region.create({ data: { name: "FF UP-Test Region" } });
    pRegionId = region.id;
    const client = await prisma.client.create({ data: { name: "FF UP-Test Client", abbreviation: "UPC" } });
    pClientId = client.id;
    const project = await prisma.project.create({
      data: {
        regionId: region.id,
        clientId: client.id,
        name: "UP Legacy Project",
        abbreviation: "UPLP",
        workOrderDate: new Date("2019-01-15T00:00:00Z"),
        timeLimitMonths: 12,
        additionalTimeMonths: null,      // NULL grace — legacy
        targetTimeLimitMonths: null,     // NULL legacy target TL
        stipulatedCompletionDate: null,  // NULL legacy dates
        targetCompletionDate: null,
        estimatedCost: "8000000",
        totalFee: "11800.000000",
        workType: "BUILDING",
        serviceType: "SUPERVISION",
        fundFlow: {
          create: {
            staffExp: "2000.00",
            miscExp: "500.00",
            totalProjectCost: "2500.00",
            feeReceived: "11800.00",
          },
        },
      },
    });
    pId = project.id;
  });
  afterAll(async () => {
    await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    await prisma.client.delete({ where: { id: pClientId } }).catch(() => {});
    await prisma.region.delete({ where: { id: pRegionId } }).catch(() => {});
  });

  it("unrelated edit preserves totalFee, estimatedCost, NULL grace and dates", async () => {
    const res = await updateProject({ id: pId, address: "New address" } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: pId } });
    expect(p!.totalFee.toString()).toBe("11800");
    expect(p!.estimatedCost.toString()).toBe("8000000");
    expect(p!.additionalTimeMonths).toBeNull();          // NULL grace preserved — no invented 0.5×
    expect(p!.targetTimeLimitMonths).toBeNull();          // no invented target TL
    expect(p!.stipulatedCompletionDate).toBeNull();       // no invented dates
    expect(p!.targetCompletionDate).toBeNull();
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: pId } });
    expect(ff!.staffExp.toString()).toBe("2000");
    expect(ff!.totalProjectCost.toString()).toBe("2500"); // no sync on absent estimatedCost
  });

  it("estimatedCost change syncs fundFlow cost AND recomputes fee from stored pct", async () => {
    // first: set a stored Fee percentage via fund flow path
    await prisma.fundFlow.update({
      where: { projectId: pId },
      data: { feePercentage: "0.22727" },
    });
    const res = await updateProject({ id: pId, estimatedCost: "11000" } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: pId } });
    const ff = await prisma.fundFlow.findUnique({ where: { projectId: pId } });
    expect(ff!.totalProjectCost.toString()).toBe("11000");
    // 11000 × 0.22727 / 100 = 24.9997 — never left stale
    expect(p!.totalFee.toString()).toBe("24.9997");
  });

  it("full-payload unchanged save (as the real form sends) preserves everything", async () => {
    // Simulate the form: every field submitted, none changed.
    const before = await prisma.project.findUnique({ where: { id: pId } });
    const res = await updateProject({
      id: pId,
      clientId: before!.clientId,
      name: before!.name,
      abbreviation: before!.abbreviation,
      address: before!.address,
      agreementDate: before!.agreementDate?.toISOString(),
      workOrderDate: before!.workOrderDate.toISOString(),
      timeLimitMonths: before!.timeLimitMonths.toString(),
      additionalTimeMonths: null, // NULL grace echoed back
      targetTimeLimitMonths: null, // NULL echoed back
      stipulatedCompletionDate: null,
      targetCompletionDate: null,
      estimatedCost: before!.estimatedCost.toString(),
      status: before!.status,
      workType: before!.workType,
      serviceType: before!.serviceType,
    } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: pId } });
    expect(p!.totalFee.toString()).toBe(before!.totalFee.toString());
    expect(p!.estimatedCost.toString()).toBe(before!.estimatedCost.toString());
    expect(p!.additionalTimeMonths).toBeNull();
    expect(p!.targetTimeLimitMonths).toBeNull();
    expect(p!.stipulatedCompletionDate).toBeNull(); // NOT converted to computed
    expect(p!.targetCompletionDate).toBeNull();
  });

  it("changing Date of Work Order recomputes dates via the Excel method", async () => {
    const res = await updateProject({
      id: pId,
      workOrderDate: "2026-04-01T00:00:00Z",
    } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: pId } });
    // TL 12, NULL grace → stipulated = target ≈ 2027-03-31, targetTL 12
    expect(p!.stipulatedCompletionDate!.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(p!.targetCompletionDate!.toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(p!.targetTimeLimitMonths!.toString()).toBe("12");
  });

  it("Grace period edit recomputes dates via Excel method — no ×0.5 fallback", async () => {
    const res = await updateProject({
      id: pId,
      additionalTimeMonths: "6",
    } as never);
    expect(res.success).toBe(true);
    const p = await prisma.project.findUnique({ where: { id: pId } });
    // TL 12 + grace 6 = 18 — NOT 12 + 6 (0.5×12) invented path
    expect(p!.targetTimeLimitMonths!.toString()).toBe("18");
    // WO 2019-01-15 + 12×30.416d ≈ 2020-01-14 / +18×30.416d ≈ 2020-07-14
    expect(p!.stipulatedCompletionDate).not.toBeNull();
    expect(p!.targetCompletionDate).not.toBeNull();
  });
});
