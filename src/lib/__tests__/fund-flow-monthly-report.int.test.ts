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

import { prisma } from "@/lib/prisma";
import {
  getMonthlyExpenses,
  getMonthlyIncomeSummary,
  getMonthlyPlannedNet,
  getMonthlyRunningBalance,
  upsertMonthlyExpense,
} from "../actions/fund-flow-monthly";

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
        await prisma.region.create({ data: { name: "Monthly Report Test" } })
      ).id;
      clientId = (
        await prisma.client.create({
          data: { name: "MR Test Client", abbreviation: "MRT" },
        })
      ).id;

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
