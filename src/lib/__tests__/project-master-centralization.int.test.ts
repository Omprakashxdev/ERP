import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { ProjectRole, ProjectStatus } from "@prisma/client";
import { Role } from "@/types/auth";

vi.mock("../actions/wrapper", () => ({
  withPermission: async (
    _r: string,
    _a: string,
    fn: (u: { id: string; role: Role }) => unknown
  ) => {
    try {
      return { success: true, data: await fn({ id: "int-test", role: Role.ADMIN }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  withAuth: async (fn: (u: { id: string; role: Role }) => unknown) => {
    try {
      return { success: true, data: await fn({ id: "int-test", role: Role.ADMIN }) };
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
import { createProject, updateProject, getProjects } from "../actions/project";
import { getFundFlows, getFundFlowByProjectId, upsertFundFlow } from "../actions/fund-flow";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;

(SKIP ? describe.skip : describe)(
  "Brick 1 — Centralized Project Master integration (disposable DB)",
  () => {
    let regionId = "";
    let clientId = "";
    let staffId = "";
    let createdProjectId = "";

    beforeAll(async () => {
      await prisma.user
        .create({
          data: { id: "int-test", email: "int-test@local", hashedPassword: "x" },
        })
        .catch(() => {});

      const region = await prisma.region.create({
        data: { name: `Brick1 Region ${Date.now()}` },
      });
      regionId = region.id;

      const client = await prisma.client.create({
        data: { name: `Brick1 Client ${Date.now()}`, abbreviation: "B1C" },
      });
      clientId = client.id;

      const staff = await prisma.staff.create({
        data: {
          name: "Brick1 Team Leader",
          employeeCode: `B1-${Date.now().toString().slice(-5)}`,
          regionId: region.id,
        },
      });
      staffId = staff.id;
    });

    afterAll(async () => {
      if (createdProjectId) {
        await prisma.project.delete({ where: { id: createdProjectId } }).catch(() => {});
      }
      if (staffId) {
        await prisma.staff.delete({ where: { id: staffId } }).catch(() => {});
      }
      if (clientId) {
        await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
      }
      if (regionId) {
        await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    it("1. creates project through Masters with assignments & fee stages and no FundFlow row", async () => {
      const res = await createProject({
        regionId,
        clientId,
        name: "Brick1 Masters Project",
        abbreviation: "B1MP",
        address: "Gift City, Gandhinagar",
        workOrderDate: "2026-04-01" as unknown as Date,
        timeLimitMonths: "6" as unknown as Decimal,
        additionalTimeMonths: null,
        estimatedCost: "1000000.00" as unknown as Decimal,
        status: ProjectStatus.ACTIVE,
        workType: "Building",
        serviceType: "PMC",
        assignments: [
          {
            staffId,
            role: ProjectRole.TEAM_LEADER,
            allocation: 0.75,
          },
        ],
        feeStages: [
          {
            stageName: "Stage 1 — Inception",
            percentage: 50,
            amount: "25000.00" as unknown as Decimal,
            dueDate: "2026-05-01" as unknown as Date,
          },
          {
            stageName: "Stage 2 — Final",
            percentage: 50,
            amount: "25000.00" as unknown as Decimal,
            dueDate: "2026-09-01" as unknown as Date,
          },
        ],
      } as never);

      expect(res.success).toBe(true);
      createdProjectId = res.data!.id;

      const dbProject = await prisma.project.findUnique({
        where: { id: createdProjectId },
        include: {
          assignments: true,
          feeStages: true,
          fundFlow: true,
        },
      });

      expect(dbProject).not.toBeNull();
      expect(dbProject!.name).toBe("Brick1 Masters Project");
      expect(dbProject!.abbreviation).toBe("B1MP");
      expect(dbProject!.address).toBe("Gift City, Gandhinagar");
      expect(dbProject!.assignments).toHaveLength(1);
      expect(dbProject!.feeStages).toHaveLength(2);
      // No FundFlow row created automatically at Masters project creation time
      expect(dbProject!.fundFlow).toBeNull();
    });

    it("2. project created in Masters appears in getProjects and getFundFlows without duplication", async () => {
      const mastersRes = await getProjects({ search: "Brick1 Masters Project" });
      expect(mastersRes.success).toBe(true);
      expect((mastersRes.data as { total: number }).total).toBe(1);

      const ffListRes = await getFundFlows({ search: "Brick1 Masters Project" });
      expect(ffListRes.success).toBe(true);
      const ffData = ffListRes.data as { rows: Record<string, unknown>[]; total: number };
      expect(ffData.total).toBe(1);
      expect(ffData.rows[0].id).toBe(createdProjectId);
      expect(ffData.rows[0].fundFlow).toBeNull();

      const detailRes = await getFundFlowByProjectId(createdProjectId);
      expect(detailRes.success).toBe(true);
      expect((detailRes.data as Record<string, unknown>).reconciliationAvailable).toBe(true);
    });

    it("3. allows financial data entry in Fund Flow even when project had no FundFlow row yet", async () => {
      const countBefore = await prisma.project.count({ where: { id: createdProjectId } });
      expect(countBefore).toBe(1);

      const ffRes = await upsertFundFlow({
        projectId: createdProjectId,
        teamLeaderExp: "12000",
        residentialEngineerExp: "8000",
        designEngineerExp: "5000",
        siteEngineerExp: "3000",
        miscExp: "2000",
        totalProjectCost: "1000000",
        completedWorkAmt: "250000",
        feePercentage: 5,
        proposedDueBillAmount: "10000",
        feeReceived: "20000",
        distributionStartMonth: 4,
        distributionStartYear: 2026,
      } as never);

      expect(ffRes.success).toBe(true);
      expect(ffRes.data!.createdAllocations).toBe(6);

      // Still 1 project — no duplicate project created
      const countAfter = await prisma.project.count({ where: { id: createdProjectId } });
      expect(countAfter).toBe(1);

      const dbProject = await prisma.project.findUnique({
        where: { id: createdProjectId },
        include: { fundFlow: { include: { monthlyData: true } } },
      });
      expect(dbProject!.fundFlow).not.toBeNull();
      // Staff Exp = 12000 + 8000 + 5000 + 3000 + 2000 = 30000
      expect(dbProject!.fundFlow!.staffExp.toString()).toBe("30000");
      // Total Fee = 1,000,000 * 5% = 50,000
      expect(dbProject!.totalFee.toString()).toBe("50000");
      expect(dbProject!.fundFlow!.monthlyData).toHaveLength(6);
    });

    it("4. updating project master in Masters preserves Fund Flow data and syncs estimatedCost", async () => {
      const upRes = await updateProject({
        id: createdProjectId,
        name: "Brick1 Masters Project Updated",
        estimatedCost: "2000000.00" as unknown as Decimal,
      } as never);
      expect(upRes.success).toBe(true);

      const dbProject = await prisma.project.findUnique({
        where: { id: createdProjectId },
        include: { fundFlow: true },
      });
      expect(dbProject!.name).toBe("Brick1 Masters Project Updated");
      expect(dbProject!.fundFlow!.totalProjectCost.toString()).toBe("2000000");
      // Total Fee recomputed from stored 5% feePercentage: 2,000,000 * 5% = 100,000
      expect(dbProject!.totalFee.toString()).toBe("100000");
    });
  }
);
