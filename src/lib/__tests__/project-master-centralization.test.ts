import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { ProjectRole, ProjectStatus } from "@prisma/client";
import { Role } from "@/types/auth";
import { hasPermission } from "@/lib/authz";
import { createProject, updateProject, getProjects } from "@/lib/actions/project";
import { getFundFlows, upsertFundFlow } from "@/lib/actions/fund-flow";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const mockTx = {
  project: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  projectAssignment: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  projectFeeStage: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  fundFlow: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  fundFlowMonthly: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    project: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

let currentUser: { id: string; role: Role } = { id: "u-admin", role: Role.ADMIN };

vi.mock("@/lib/actions/wrapper", () => ({
  withAuth: vi.fn(async (fn: (u: typeof currentUser) => Promise<unknown>, allowedRoles?: Role[]) => {
    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      return { success: false, error: "Forbidden" };
    }
    try {
      return { success: true, data: await fn(currentUser) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
  }),
  withPermission: vi.fn(async (resource: string, action: string, fn: (u: typeof currentUser) => Promise<unknown>) => {
    if (!hasPermission(currentUser.role, resource, action)) {
      return { success: false, error: "Forbidden" };
    }
    try {
      return { success: true, data: await fn(currentUser) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
  }),
  checkRateLimit: vi.fn(),
  audit: vi.fn(),
  sanitizeForAudit: vi.fn(async (x: unknown) => x),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const VALID_REGION_ID = "cm00000000000000000000001";
const VALID_CLIENT_ID = "cm00000000000000000000002";
const VALID_STAFF_ID = "cm00000000000000000000003";
const VALID_PROJECT_ID = "cm00000000000000000000004";

describe("Brick 1 — Centralized Project Master", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: "u-admin", role: Role.ADMIN };
  });

  describe("RBAC permissions for projectManagement", () => {
    it("allows ADMIN and MANAGER to create and update projects", () => {
      expect(hasPermission(Role.ADMIN, "projectManagement", "create")).toBe(true);
      expect(hasPermission(Role.ADMIN, "projectManagement", "update")).toBe(true);
      expect(hasPermission(Role.MANAGER, "projectManagement", "create")).toBe(true);
      expect(hasPermission(Role.MANAGER, "projectManagement", "update")).toBe(true);
    });

    it("restricts STAFF and AUDITOR to read-only access on projectManagement", () => {
      expect(hasPermission(Role.STAFF, "projectManagement", "read")).toBe(true);
      expect(hasPermission(Role.STAFF, "projectManagement", "create")).toBe(false);
      expect(hasPermission(Role.STAFF, "projectManagement", "update")).toBe(false);
      expect(hasPermission(Role.AUDITOR, "projectManagement", "read")).toBe(true);
      expect(hasPermission(Role.AUDITOR, "projectManagement", "create")).toBe(false);
      expect(hasPermission(Role.AUDITOR, "projectManagement", "update")).toBe(false);
    });
  });

  describe("createProject through Masters", () => {
    it("creates the Project with staff assignments and fee stages without auto-creating a FundFlow row", async () => {
      mockTx.project.create.mockResolvedValue({ id: VALID_PROJECT_ID });

      const res = await createProject({
        regionId: VALID_REGION_ID,
        clientId: VALID_CLIENT_ID,
        name: "Sabarmati Riverfront Phase II",
        abbreviation: "SRF2",
        address: "Ahmedabad",
        workOrderDate: "2026-04-01",
        timeLimitMonths: "12",
        additionalTimeMonths: "2",
        estimatedCost: "25000000.00",
        status: ProjectStatus.ACTIVE,
        workType: "Civil",
        serviceType: "PMC",
        assignments: [
          {
            staffId: VALID_STAFF_ID,
            role: ProjectRole.TEAM_LEADER,
            allocation: 0.5,
          },
        ],
        feeStages: [
          {
            stageName: "Mobilization",
            percentage: 20,
            amount: "100000.00",
            dueDate: "2026-05-01",
          },
        ],
      } as never);

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: VALID_PROJECT_ID });
      expect(mockTx.project.create).toHaveBeenCalledTimes(1);
      // Must NOT auto-create FundFlow or financial transactions during Masters creation
      expect(mockTx.fundFlow.upsert).not.toHaveBeenCalled();
      expect(mockTx.fundFlowMonthly.create).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/masters");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/fund-flow");
    });

    it("rejects unauthorized roles (STAFF) from creating projects", async () => {
      currentUser = { id: "u-staff", role: Role.STAFF };
      const res = await createProject({
        regionId: VALID_REGION_ID,
        clientId: VALID_CLIENT_ID,
        name: "Unauthorized Project",
        workOrderDate: new Date("2026-04-01T00:00:00Z"),
        timeLimitMonths: new Decimal("6"),
        estimatedCost: new Decimal("1000.00"),
        totalFee: new Decimal("0.00"),
        status: ProjectStatus.ACTIVE,
        workType: "Road",
        serviceType: "TPI",
      });
      expect(res.success).toBe(false);
      expect(mockTx.project.create).not.toHaveBeenCalled();
    });
  });

  describe("Fund Flow visibility & entry for Masters-created projects (fundFlow = null)", () => {
    it("getFundFlows returns Masters-created projects even when fundFlow is null", async () => {
      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: VALID_PROJECT_ID,
          name: "Sabarmati Riverfront Phase II",
          regionId: VALID_REGION_ID,
          clientId: VALID_CLIENT_ID,
          estimatedCost: new Decimal("25000000.00"),
          totalFee: new Decimal("0.00"),
          workOrderDate: new Date("2026-04-01T00:00:00Z"),
          timeLimitMonths: new Decimal("12"),
          status: ProjectStatus.ACTIVE,
          workType: "Civil",
          serviceType: "PMC",
          region: { id: VALID_REGION_ID, name: "Ahmedabad" },
          client: { id: VALID_CLIENT_ID, name: "AMC" },
          contractor: null,
          assignments: [],
          feeStages: [],
          fundFlow: null,
        } as never,
      ]);
      vi.mocked(prisma.project.count).mockResolvedValue(1);

      const res = await getFundFlows();
      expect(res.success).toBe(true);
      const rows = (res.data as { rows: Record<string, unknown>[]; total: number }).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(VALID_PROJECT_ID);
      expect(rows[0].fundFlow).toBeNull();
      expect((rows[0].remainingWorkAmt as Decimal).toString()).toBe("0");
      expect((rows[0].remainingFee as Decimal).toString()).toBe("0");
    });

    it("upsertFundFlow initializes the FundFlow row and computes staffExp & totalFee when project had no FundFlow row yet", async () => {
      mockTx.fundFlow.findUnique.mockResolvedValue(null);
      mockTx.fundFlow.upsert.mockImplementation(async ({ create }) => ({
        id: "ff-new-1",
        ...create,
      }));
      mockTx.project.findUnique.mockResolvedValue({
        id: VALID_PROJECT_ID,
        targetTimeLimitMonths: new Decimal("12"),
        totalFee: new Decimal("500000.000000"),
      });
      mockTx.project.update.mockResolvedValue({ id: VALID_PROJECT_ID });

      const res = await upsertFundFlow({
        projectId: VALID_PROJECT_ID,
        teamLeaderExp: "10000",
        residentialEngineerExp: "5000",
        designEngineerExp: "3000",
        siteEngineerExp: "2000",
        miscExp: "1000",
        totalProjectCost: "25000000",
        completedWorkAmt: "5000000",
        feePercentage: 2,
        proposedDueBillAmount: "50000",
        feeReceived: "100000",
      } as never);

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe("ff-new-1");
      expect(mockTx.fundFlow.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = mockTx.fundFlow.upsert.mock.calls[0][0];
      expect(upsertArg.where).toEqual({ projectId: VALID_PROJECT_ID });
      // 10000 + 5000 + 3000 + 2000 + 1000 = 21000
      expect(upsertArg.create.staffExp.toString()).toBe("21000");
      // 25,000,000 * 2% = 500,000
      expect(mockTx.project.update).toHaveBeenCalledWith({
        where: { id: VALID_PROJECT_ID },
        data: { totalFee: new Decimal("500000") },
      });
    });
  });

  describe("updateProject through Masters", () => {
    it("updates project master fields, assignments, and fee stages and revalidates both Masters and Fund Flow", async () => {
      mockTx.project.findUnique.mockResolvedValue({
        id: VALID_PROJECT_ID,
        workOrderDate: new Date("2026-04-01T00:00:00Z"),
        timeLimitMonths: new Decimal("12"),
        additionalTimeMonths: new Decimal("2"),
        targetTimeLimitMonths: new Decimal("14"),
        stipulatedCompletionDate: new Date("2027-04-01T00:00:00Z"),
        targetCompletionDate: new Date("2027-06-01T00:00:00Z"),
      });
      mockTx.project.update.mockResolvedValue({ id: VALID_PROJECT_ID });
      mockTx.fundFlow.findUnique.mockResolvedValue(null);

      const res = await updateProject({
        id: VALID_PROJECT_ID,
        name: "Sabarmati Riverfront Phase II (Revised)",
        estimatedCost: "30000000.00",
      } as never);

      expect(res.success).toBe(true);
      expect(mockTx.project.update).toHaveBeenCalledTimes(1);
      expect(mockTx.fundFlow.updateMany).toHaveBeenCalledTimes(1);
      const updateManyArg = mockTx.fundFlow.updateMany.mock.calls[0][0];
      expect(updateManyArg.where).toEqual({ projectId: VALID_PROJECT_ID });
      expect(updateManyArg.data.totalProjectCost.toString()).toBe("30000000");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/masters");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/fund-flow");
    });

    it("getProjects searches and filters projects for Masters", async () => {
      vi.mocked(prisma.project.findMany).mockResolvedValue([]);
      vi.mocked(prisma.project.count).mockResolvedValue(0);

      const res = await getProjects({ search: "Sabarmati" });
      expect(res.success).toBe(true);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: "Sabarmati", mode: "insensitive" } },
        })
      );
    });
  });
});
