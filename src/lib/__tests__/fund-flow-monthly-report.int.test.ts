/**
 * Confirmed Fund Flow monthly report (Rows 12/14/16/18) — integration test
 * on a disposable database.
 * RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...saec_erp_monthly_test
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
import {
  getMonthlyExpenses,
  getMonthlyIncomeSummary,
  getMonthlyPlannedNet,
  getMonthlyRunningBalance,
  getProjectMonthlyReport,
  upsertMonthlyExpense,
} from "../actions/fund-flow-monthly";
import { upsertFundFlow } from "../actions/fund-flow";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const idx = (month: number, year: number) => (year - 2026) * 12 + (month - 4);

let regionId = "";
let clientId = "";
const projectIds: string[] = [];

async function makeProject(name: string, ttl: number | null) {
  const p = await prisma.project.create({
    data: {
      regionId,
      clientId,
      name,
      workOrderDate: new Date("2026-04-01T00:00:00Z"),
      timeLimitMonths: 12,
      targetTimeLimitMonths: ttl,
      workType: "DPR",
      serviceType: "PMC",
    },
  });
  projectIds.push(p.id);
  return p;
}

/** create an income allocation with ff-01k provenance so Row 12 accepts it */
async function alloc(fundFlowId: string, month: number, year: number, income: string) {
  const rec = await prisma.fundFlowMonthly.create({
    data: { fundFlowId, month, year, income },
  });
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "create",
      entity: "FundFlowMonthly",
      entityId: rec.id,
      metadata: { source: "ff-01k-workbook-allocation" },
    },
  });
  return rec;
}

(SKIP ? describe.skip : describe)(
  "confirmed monthly report — disposable DB",
  () => {
    beforeAll(async () => {
      regionId = (
        (await prisma.region.findFirst({
          where: { name: "Monthly Report Test" },
        })) ??
        (await prisma.region.create({ data: { name: "Monthly Report Test" } }))
      ).id;
      clientId = (
        (await prisma.client.findFirst({
          where: { name: "MR Test Client" },
        })) ??
        (await prisma.client.create({
          data: { name: "MR Test Client", abbreviation: "MRT" },
        }))
      ).id;
      // clean any leftovers from a previously interrupted run
      await prisma.fundFlowMonthlyExpense.deleteMany({
        where: { month: 9, year: 2026 },
      });
      const stale = await prisma.project.findMany({
        where: { name: { startsWith: "MR " } },
        select: { id: true },
      });
      for (const s of stale) {
        const ff = await prisma.fundFlow.findUnique({
          where: { projectId: s.id },
        });
        if (ff)
          await prisma.fundFlowMonthly.deleteMany({
            where: { fundFlowId: ff.id },
          });
        await prisma.project.delete({ where: { id: s.id } }).catch(() => {});
      }

      // Project A: Staff Exp 1.60, Jul 2026, 18 months
      const pa = await makeProject("MR Project A", 18);
      const ffa = await prisma.fundFlow.create({
        data: {
          projectId: pa.id,
          staffExp: "1.60",
          distributionStartMonth: 7,
          distributionStartYear: 2026,
        },
      });
      // Project B: Staff Exp 0.90, Sep 2026, 4 months
      const pb = await makeProject("MR Project B", 4);
      await prisma.fundFlow.create({
        data: {
          projectId: pb.id,
          staffExp: "0.90",
          distributionStartMonth: 9,
          distributionStartYear: 2026,
        },
      });
      // Legacy: historical staffExp, no timing config
      const pl = await makeProject("MR Legacy", null);
      await prisma.fundFlow.create({
        data: { projectId: pl.id, staffExp: "2000.00" },
      });
      // Income for A: 2.00/month Jul–Dec 2026
      for (let m = 7; m <= 12; m++) await alloc(ffa.id, m, 2026, "2.00");
      // A stray legacy manual expense record — must not feed the report
      await prisma.fundFlowMonthlyExpense.create({
        data: { month: 9, year: 2026, amount: "30.61" },
      });
    });

    afterAll(async () => {
      for (const id of projectIds)
        await prisma.project.delete({ where: { id } }).catch(() => {});
      await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
      await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
      await prisma.$disconnect();
    });

    it("Row 14: customer's confirmed overlapping expenses", async () => {
      const data = (await getMonthlyExpenses()).data as any;
      const at = (m: number, y: number) =>
        Number(data.expenses[idx(m, y)].amount);
      expect(at(7, 2026)).toBe(1.6);
      expect(at(9, 2026)).toBe(2.5);
      expect(at(12, 2026)).toBe(2.5);
      expect(at(1, 2027)).toBe(1.6);
      expect(at(12, 2027)).toBe(1.6);
      expect(at(1, 2028)).toBe(0);
      expect(data.missingExpenseConfig).toEqual([
        {
          projectName: "MR Legacy",
          missing: ["Start month", "Target Time Limit (In Month)"],
        },
      ]);
      // manual record preserved but not counted
      const manual = await prisma.fundFlowMonthlyExpense.findFirst();
      expect(manual?.amount.toString()).toBe("30.61");
      expect(at(9, 2026)).not.toBeCloseTo(33.11);
    });

    it("Row 12: saved allocations feed income", async () => {
      const data = (await getMonthlyIncomeSummary()).data as any[];
      expect(Number(data[idx(7, 2026)].totalIncome)).toBe(2);
      expect(Number(data[idx(12, 2026)].totalIncome)).toBe(2);
      expect(data[idx(1, 2027)].totalIncome).toBeNull();
    });

    it("Row 16: net = income − expense", async () => {
      const data = (await getMonthlyPlannedNet()).data as any;
      const at = (m: number, y: number) =>
        Number(data.months[idx(m, y)].plannedNet);
      expect(at(7, 2026)).toBeCloseTo(0.4); // 2.00 − 1.60
      expect(at(9, 2026)).toBeCloseTo(-0.5); // 2.00 − 2.50
      expect(at(1, 2027)).toBeCloseTo(-1.6); // 0 − 1.60
      expect(data.months[idx(4, 2026)].plannedNet).toBeNull();
    });

    it("Row 18: cumulative carries through the whole window", async () => {
      const data = (await getMonthlyRunningBalance()).data as any;
      const at = (m: number, y: number) =>
        Number(data.months[idx(m, y)].runningBalance);
      expect(at(7, 2026)).toBeCloseTo(0.4);
      expect(at(8, 2026)).toBeCloseTo(0.8);
      expect(at(12, 2026)).toBeCloseTo(-1.2);
      expect(at(12, 2027)).toBeCloseTo(-20.4);
      expect(at(3, 2028)).toBeCloseTo(-20.4); // flat after A ends
    });

    it("manual expense writes are rejected; records preserved", async () => {
      const r = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "5" });
      expect(r.success).toBe(false);
      expect(await prisma.fundFlowMonthlyExpense.count()).toBe(1);
    });
  }
);

(SKIP ? describe.skip : describe)(
  "initial allocations carry ff-01k provenance (post-fix)",
  () => {
    let pid = "";
    beforeAll(async () => {
      await prisma.user
        .create({
          data: { id: "int-test", email: "int-test@local", hashedPassword: "x" },
        })
        .catch(() => {});
      regionId = (
        (await prisma.region.findFirst({
          where: { name: "Provenance Test" },
        })) ??
        (await prisma.region.create({ data: { name: "Provenance Test" } }))
      ).id;
      clientId = (
        (await prisma.client.findFirst({
          where: { name: "Prov Test Client" },
        })) ??
        (await prisma.client.create({
          data: { name: "Prov Test Client", abbreviation: "PTC" },
        }))
      ).id;
      // clean leftovers from a previously interrupted run
      const stale = await prisma.project.findMany({
        where: { name: { startsWith: "Prov " } },
        select: { id: true },
      });
      for (const s of stale) {
        const ff = await prisma.fundFlow.findUnique({
          where: { projectId: s.id },
        });
        if (ff)
          await prisma.fundFlowMonthly.deleteMany({
            where: { fundFlowId: ff.id },
          });
        await prisma.project.delete({ where: { id: s.id } }).catch(() => {});
      }
      // fee 20 (cost 10000 × 0.2%), fee recvd 0, Staff Exp 1.60,
      // Start Jul 2026, TTL 18 — the requested scenario
      pid = (
        await makeProject("Prov Project", 18)
      ).id;
      const res = await upsertFundFlow({
        projectId: pid,
        teamLeaderExp: "0.50",
        residentialEngineerExp: "0.40",
        designEngineerExp: "0.30",
        siteEngineerExp: "0.35",
        miscExp: "0.05",
        totalProjectCost: "10000",
        completedWorkAmt: "0",
        feePercentage: 0.2,
        proposedDueBillAmount: "0",
        feeReceived: "0",
        distributionStartMonth: 7,
        distributionStartYear: 2026,
      } as never);
      expect(res.success).toBe(true);
    });

    afterAll(async () => {
      for (const id of projectIds)
        await prisma.project.delete({ where: { id } }).catch(() => {});
      await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
      await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
      await prisma.user.delete({ where: { id: "int-test" } }).catch(() => {});
      await prisma.$disconnect();
    });

    it("18 allocations created with 18 ff-01k provenance entries", async () => {
      const ff = await prisma.fundFlow.findUniqueOrThrow({
        where: { projectId: pid },
      });
      const rows = await prisma.fundFlowMonthly.findMany({
        where: { fundFlowId: ff.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      expect(rows).toHaveLength(18);
      expect(rows[0].month).toBe(7);
      expect(rows[17].month).toBe(12);
      expect(rows[17].year).toBe(2027);
      // 20 ÷ 18 = 1.111111… — the last month absorbs the rounding
      // residual so the plan totals the remaining fee exactly.
      for (const r of rows.slice(0, 17))
        expect(Number(r.income.toString())).toBeCloseTo(1.111111, 6);
      expect(Number(rows[17].income.toString())).toBeCloseTo(1.111113, 6);
      expect(
        rows.reduce((a, r) => a + Number(r.income.toString()), 0)
      ).toBeCloseTo(20, 5);
      const ids = rows.map((r) => r.id);
      const prov = await prisma.auditLog.count({
        where: {
          entity: "FundFlowMonthly",
          entityId: { in: ids },
          action: "create",
          metadata: {
            path: ["source"],
            equals: "ff-01k-workbook-allocation",
          },
        },
      });
      expect(prov).toBe(18);
    });

    it("report rows: income counted, expense derived, net/balance exact", async () => {
      const inc = (await getMonthlyIncomeSummary()).data as any[];
      expect(Number(inc[idx(7, 2026)].totalIncome)).toBeCloseTo(1.111111, 6);
      expect(inc[idx(7, 2026)].unavailableCount).toBe(0); // not excluded

      const exp = (await getMonthlyExpenses()).data as any;
      expect(Number(exp.expenses[idx(7, 2026)].amount)).toBeCloseTo(1.6);

      const net = (await getMonthlyPlannedNet()).data as any;
      expect(Number(net.months[idx(7, 2026)].plannedNet)).toBeCloseTo(
        -0.488889,
        6
      );

      const bal = (await getMonthlyRunningBalance()).data as any;
      expect(
        Number(bal.months[idx(7, 2026)].runningBalance)
      ).toBeCloseTo(-0.488889, 6);
      expect(
        Number(bal.months[idx(8, 2026)].runningBalance)
      ).toBeCloseTo(-0.977778, 6);
    });

    it("re-edit never replaces the saved allocations", async () => {
      const res = await upsertFundFlow({
        projectId: pid,
        miscExp: "0.10", // unrelated-ish edit → Staff Exp 1.65
      } as never);
      expect(res.success).toBe(true);
      const ff = await prisma.fundFlow.findUniqueOrThrow({
        where: { projectId: pid },
      });
      const rows = await prisma.fundFlowMonthly.findMany({
        where: { fundFlowId: ff.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      expect(rows).toHaveLength(18);
      for (const r of rows.slice(0, 17))
        expect(Number(r.income.toString())).toBeCloseTo(1.111111, 6); // untouched
      expect(Number(rows[17].income.toString())).toBeCloseTo(1.111113, 6); // residual month untouched
      expect(Number(ff!.staffExp.toString())).toBeCloseTo(1.65); // edit applied
    });
  }
);

(SKIP ? describe.skip : describe)(
  "project-wise monthly report — disposable DB",
  () => {
    let pwA = "";
    let pwB = "";
    let pwLegacy = "";
    let pwFrac = "";
    let pwNoFF = "";

    beforeAll(async () => {
      regionId = (
        (await prisma.region.findFirst({
          where: { name: "PW Report Test" },
        })) ??
        (await prisma.region.create({ data: { name: "PW Report Test" } }))
      ).id;
      clientId = (
        (await prisma.client.findFirst({
          where: { name: "PW Test Client" },
        })) ??
        (await prisma.client.create({
          data: { name: "PW Test Client", abbreviation: "PWT" },
        }))
      ).id;
      const stale = await prisma.project.findMany({
        where: { name: { startsWith: "PW " } },
        select: { id: true },
      });
      for (const s of stale) {
        const ff = await prisma.fundFlow.findUnique({
          where: { projectId: s.id },
        });
        if (ff)
          await prisma.fundFlowMonthly.deleteMany({
            where: { fundFlowId: ff.id },
          });
        await prisma.project.delete({ where: { id: s.id } }).catch(() => {});
      }

      // A: Staff Exp 1.50, Sep 2026, 4 months → span Sep–Dec 2026
      pwA = (await makeProject("PW Project A", 4)).id;
      const ffA = await prisma.fundFlow.create({
        data: {
          projectId: pwA,
          staffExp: "1.50",
          distributionStartMonth: 9,
          distributionStartYear: 2026,
        },
      });
      // verified income 1.00 in Sep & Oct — deliberately below the 1.50
      // expense so the project runs a negative balance
      await alloc(ffA.id, 9, 2026, "1.00");
      await alloc(ffA.id, 10, 2026, "1.00");
      // ambiguous record — no audit provenance → excluded, never counted
      await prisma.fundFlowMonthly.create({
        data: { fundFlowId: ffA.id, month: 11, year: 2026, income: "9.99" },
      });

      // B: separate project whose income must never leak into A's report
      pwB = (await makeProject("PW Project B", 4)).id;
      const ffB = await prisma.fundFlow.create({
        data: {
          projectId: pwB,
          staffExp: "0.50",
          distributionStartMonth: 9,
          distributionStartYear: 2026,
        },
      });
      await alloc(ffB.id, 9, 2026, "7.00");

      // Legacy: no timing config — unknown expense span
      pwLegacy = (await makeProject("PW Legacy", null)).id;
      await prisma.fundFlow.create({
        data: { projectId: pwLegacy, staffExp: "5.00" },
      });

      // Fractional TTL 4.5 → provisional warning, span rounded to 5
      pwFrac = (await makeProject("PW Frac", 4.5)).id;
      await prisma.fundFlow.create({
        data: {
          projectId: pwFrac,
          staffExp: "2.00",
          distributionStartMonth: 9,
          distributionStartYear: 2026,
        },
      });

      // No fund flow record at all
      pwNoFF = (await makeProject("PW No FundFlow", 4)).id;
    });

    afterAll(async () => {
      const stale = await prisma.project.findMany({
        where: { name: { startsWith: "PW " } },
        select: { id: true },
      });
      for (const s of stale) {
        const ff = await prisma.fundFlow.findUnique({
          where: { projectId: s.id },
        });
        if (ff)
          await prisma.fundFlowMonthly.deleteMany({
            where: { fundFlowId: ff.id },
          });
        await prisma.project.delete({ where: { id: s.id } }).catch(() => {});
      }
      await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
      await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
      await prisma.$disconnect();
    });

    it("returns real project info — nothing invented", async () => {
      const r = (await getProjectMonthlyReport(pwA)).data as any;
      expect(r.project.name).toBe("PW Project A");
      expect(r.project.startMonth).toBe(9);
      expect(r.project.startYear).toBe(2026);
      expect(r.project.startMonthLabel).toMatch(/2026/);
      expect(r.project.targetTimeLimitMonths).toBe("4");
      expect(Number(r.project.staffExp)).toBe(1.5);
      expect(Number(r.project.totalFee)).toBe(0);
      expect(Number(r.project.remainingFee)).toBe(0);
      expect(r.hasFundFlow).toBe(true);
      expect(r.months).toHaveLength(24);
    });

    it("income is this project's verified allocations only", async () => {
      const r = (await getProjectMonthlyReport(pwA)).data as any;
      expect(Number(r.months[idx(9, 2026)].income)).toBe(1);
      expect(Number(r.months[idx(10, 2026)].income)).toBe(1);
      // ambiguous record → excluded and flagged, never counted
      expect(r.months[idx(11, 2026)].income).toBeNull();
      expect(r.months[idx(11, 2026)].incomeUnavailableCount).toBe(1);
      // every other month has no income — B's 7.00 never leaks in
      for (const m of r.months) {
        expect(Number(m.income ?? 0)).not.toBe(7);
      }
      const b = (await getProjectMonthlyReport(pwB)).data as any;
      expect(Number(b.months[idx(9, 2026)].income)).toBe(7);
      expect(b.months[idx(10, 2026)].income).toBeNull();
    });

    it("expense only inside the span; net & cumulative exact", async () => {
      const r = (await getProjectMonthlyReport(pwA)).data as any;
      const at = (m: number, y: number) => r.months[idx(m, y)];
      // span Sep–Dec 2026
      expect(Number(at(9, 2026).expense)).toBe(1.5);
      expect(Number(at(12, 2026).expense)).toBe(1.5);
      expect(Number(at(8, 2026).expense)).toBe(0); // before span → true zero
      expect(Number(at(1, 2027).expense)).toBe(0); // after span → true zero
      // net = income − expense (missing side counts as 0)
      expect(Number(at(9, 2026).net)).toBeCloseTo(-0.5); // 1.00 − 1.50
      expect(Number(at(11, 2026).net)).toBeCloseTo(-1.5); // no income − 1.50
      expect(at(4, 2026).net).toBeNull(); // neither side has data
      // cumulative carries forward from the zero baseline — negative OK
      expect(Number(at(9, 2026).cumulativeBalance)).toBeCloseTo(-0.5);
      expect(Number(at(10, 2026).cumulativeBalance)).toBeCloseTo(-1.0);
      expect(Number(at(12, 2026).cumulativeBalance)).toBeCloseTo(-4.0);
      expect(Number(at(3, 2028).cumulativeBalance)).toBeCloseTo(-4.0); // flat
    });

    it("missing timing is flagged — unknown span is not zero expense", async () => {
      const r = (await getProjectMonthlyReport(pwLegacy)).data as any;
      expect(r.missingExpenseConfig).toEqual([
        {
          projectName: "PW Legacy",
          missing: ["Start month", "Target Time Limit (In Month)"],
        },
      ]);
      // serialized expense is "0" only because the project is excluded;
      // incomplete flags every month so the UI cannot present it as a real zero
      expect(r.months.every((m: any) => m.incomplete)).toBe(true);
    });

    it("fractional Target Time Limit keeps the provisional warning", async () => {
      const r = (await getProjectMonthlyReport(pwFrac)).data as any;
      expect(r.expenseSpanWarnings).toHaveLength(1);
      expect(r.expenseSpanWarnings[0].monthsUsed).toBe(5);
      expect(r.expenseSpanWarnings[0].targetTimeLimitMonths).toBe("4.5");
      // rounded span Sep 2026 – Jan 2027
      expect(Number(r.months[idx(1, 2027)].expense)).toBe(2);
      expect(Number(r.months[idx(2, 2027)].expense)).toBe(0);
    });

    it("project without a fund flow record is reported honestly", async () => {
      const r = (await getProjectMonthlyReport(pwNoFF)).data as any;
      expect(r.hasFundFlow).toBe(false);
      expect(r.project.staffExp).toBeNull();
      expect(r.project.remainingFee).toBeNull();
      expect(r.project.startMonthLabel).toBeNull();
      expect(r.missingExpenseConfig[0].missing).toContain("Start month");
      expect(r.months.every((m: any) => m.income == null)).toBe(true);
    });

    it("unknown project is rejected, not fabricated", async () => {
      const r = await getProjectMonthlyReport("clzzzzzzzzzzzzzzzzzzzzzzzz");
      expect(r.success).toBe(false);
    });
  }
);
