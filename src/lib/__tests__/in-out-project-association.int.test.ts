import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { ProjectStatus } from "@prisma/client";
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
import {
  createInOutRegister,
  updateInOutRegister,
  getInOutRegisters,
  getInOutRegisterById,
} from "../actions/in-out-register";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;

(SKIP ? describe.skip : describe)(
  "Brick 2 — Inward Project Association integration (disposable DB)",
  () => {
    const ids = {
      regionId: "",
      clientAId: "",
      clientBId: "",
      staffId: "",
      projectAId: "",
      projectBId: "",
      inwardWithProjectId: "",
      inwardGeneralId: "",
      secondInwardSameProjectId: "",
      outwardReplyId: "",
    };

    beforeAll(async () => {
      await prisma.user
        .create({
          data: { id: "int-test", email: "int-test@local", hashedPassword: "x" },
        })
        .catch(() => {});

      const stamp = Date.now();
      const region = await prisma.region.create({
        data: { name: `Brick2 Region ${stamp}` },
      });
      ids.regionId = region.id;

      const clientA = await prisma.client.create({
        data: { name: `Brick2 Client A ${stamp}`, abbreviation: "B2A" },
      });
      ids.clientAId = clientA.id;
      const clientB = await prisma.client.create({
        data: { name: `Brick2 Client B ${stamp}`, abbreviation: "B2B" },
      });
      ids.clientBId = clientB.id;

      const staff = await prisma.staff.create({
        data: {
          name: "Brick2 Action Staff",
          employeeCode: `B2-${stamp.toString().slice(-5)}`,
          regionId: region.id,
        },
      });
      ids.staffId = staff.id;

      const projectA = await prisma.project.create({
        data: {
          regionId: region.id,
          clientId: clientA.id,
          name: `Brick2 Project A ${stamp}`,
          abbreviation: "B2PA",
          workOrderDate: new Date("2026-01-15T00:00:00Z"),
          timeLimitMonths: "12",
          estimatedCost: "500000",
          workType: "Building",
          serviceType: "PMC",
          status: ProjectStatus.ACTIVE,
        },
      });
      ids.projectAId = projectA.id;

      const projectB = await prisma.project.create({
        data: {
          regionId: region.id,
          clientId: clientB.id,
          name: `Brick2 Project B ${stamp}`,
          abbreviation: "B2PB",
          workOrderDate: new Date("2026-01-15T00:00:00Z"),
          timeLimitMonths: "6",
          estimatedCost: "250000",
          workType: "Road",
          serviceType: "TPI",
          status: ProjectStatus.ACTIVE,
        },
      });
      ids.projectBId = projectB.id;
    });

    afterAll(async () => {
      const entryIds = [
        ids.inwardWithProjectId,
        ids.inwardGeneralId,
        ids.secondInwardSameProjectId,
        ids.outwardReplyId,
      ].filter(Boolean);
      if (entryIds.length) {
        await prisma.inOutRegister.deleteMany({ where: { id: { in: entryIds } } }).catch(() => {});
      }
      for (const pid of [ids.projectAId, ids.projectBId].filter(Boolean)) {
        await prisma.project.delete({ where: { id: pid } }).catch(() => {});
      }
      for (const cid of [ids.clientAId, ids.clientBId].filter(Boolean)) {
        await prisma.client.delete({ where: { id: cid } }).catch(() => {});
      }
      if (ids.staffId) {
        await prisma.staff.delete({ where: { id: ids.staffId } }).catch(() => {});
      }
      if (ids.regionId) {
        await prisma.region.delete({ where: { id: ids.regionId } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    const baseEntry = {
      direction: "INWARD" as const,
      documentDate: "2026-05-01" as unknown as Date,
      receivedDate: "2026-05-02" as unknown as Date,
      details: "Brick2 test letter",
    };

    it("1. creates an inward entry linked to a Masters project; serial issued; client mismatch rejected", async () => {
      const res = await createInOutRegister({
        ...baseEntry,
        documentRefNo: `B2/INW/${Date.now()}/001`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        projectId: ids.projectAId,
      } as never);

      expect(res.success).toBe(true);
      ids.inwardWithProjectId = res.data!.id;

      const row = await prisma.inOutRegister.findUnique({
        where: { id: ids.inwardWithProjectId },
      });
      expect(row!.projectId).toBe(ids.projectAId);
      expect(row!.serialNo).toMatch(/^INW\/\d{4}-\d{2}\/\d{3}$/);

      // Cross-client project must be rejected
      const bad = await createInOutRegister({
        ...baseEntry,
        documentRefNo: `B2/INW/${Date.now()}/002`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        projectId: ids.projectBId,
      } as never);
      expect(bad.success).toBe(false);
      expect(bad.error).toMatch(/different client/i);

      // Nonexistent project must be rejected
      const ghost = await createInOutRegister({
        ...baseEntry,
        documentRefNo: `B2/INW/${Date.now()}/003`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        projectId: "cm00000000000000000000999",
      } as never);
      expect(ghost.success).toBe(false);
      expect(ghost.error).toMatch(/does not exist/i);
    });

    it("2. general correspondence saves with NULL projectId and two entries can share one project", async () => {
      const general = await createInOutRegister({
        ...baseEntry,
        documentRefNo: `B2/INW/${Date.now()}/004`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
      } as never);
      expect(general.success).toBe(true);
      ids.inwardGeneralId = general.data!.id;

      const row = await prisma.inOutRegister.findUnique({
        where: { id: ids.inwardGeneralId },
      });
      expect(row!.projectId).toBeNull();

      // A second entry (simulating another branch/branch office) links the
      // same project — no uniqueness constraint blocks it.
      const second = await createInOutRegister({
        ...baseEntry,
        documentRefNo: `B2/INW/${Date.now()}/005`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        projectId: ids.projectAId,
      } as never);
      expect(second.success).toBe(true);
      ids.secondInwardSameProjectId = second.data!.id;

      const linked = await prisma.inOutRegister.count({
        where: { projectId: ids.projectAId },
      });
      expect(linked).toBeGreaterThanOrEqual(2);
    });

    it("3. list and detail return the project; outward reply inherits the inward project read-only", async () => {
      const listRes = await getInOutRegisters({
        projectId: ids.projectAId,
      });
      expect(listRes.success).toBe(true);
      const rows = (listRes.data as { rows: { id: string; project?: { name: string } | null }[] }).rows;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const r of rows) {
        expect(r.project?.name).toContain("Brick2 Project A");
      }

      const detailRes = await getInOutRegisterById(ids.inwardWithProjectId);
      expect(detailRes.success).toBe(true);
      const detail = detailRes.data as { project?: { name: string } | null };
      expect(detail.project?.name).toContain("Brick2 Project A");

      // Outward reply linked to the inward — projectId stays NULL on the
      // outward row but the parent inward's project is exposed read-only.
      const reply = await createInOutRegister({
        ...baseEntry,
        direction: "OUTWARD",
        documentRefNo: `B2/OUT/${Date.now()}/001`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        parentInwardId: ids.inwardWithProjectId,
        projectId: ids.projectAId, // must be stripped by schema guard
      } as never);
      expect(reply.success).toBe(false);

      const replyOk = await createInOutRegister({
        ...baseEntry,
        direction: "OUTWARD",
        documentRefNo: `B2/OUT/${Date.now()}/002`,
        clientId: ids.clientAId,
        actionSuggestedStaffId: ids.staffId,
        parentInwardId: ids.inwardWithProjectId,
      } as never);
      expect(replyOk.success).toBe(true);
      ids.outwardReplyId = replyOk.data!.id;

      const outRow = await prisma.inOutRegister.findUnique({
        where: { id: ids.outwardReplyId },
      });
      expect(outRow!.projectId).toBeNull();

      const outDetail = await getInOutRegisterById(ids.outwardReplyId);
      const outData = outDetail.data as {
        project?: { name: string } | null;
        parentInward?: { project?: { name: string } | null } | null;
      };
      expect(outData.project ?? null).toBeNull();
      expect(outData.parentInward?.project?.name).toContain("Brick2 Project A");
    });

    it("4. update changes/clears the link and historical NULL rows stay valid", async () => {
      const change = await updateInOutRegister({
        id: ids.secondInwardSameProjectId,
        projectId: null,
      } as never);
      expect(change.success).toBe(true);

      const cleared = await prisma.inOutRegister.findUnique({
        where: { id: ids.secondInwardSameProjectId },
      });
      expect(cleared!.projectId).toBeNull();

      // Re-linking works again
      const relink = await updateInOutRegister({
        id: ids.secondInwardSameProjectId,
        projectId: ids.projectAId,
      } as never);
      expect(relink.success).toBe(true);

      // Wrong-client update is rejected
      const wrong = await updateInOutRegister({
        id: ids.secondInwardSameProjectId,
        projectId: ids.projectBId,
      } as never);
      expect(wrong.success).toBe(false);
      expect(wrong.error).toMatch(/different client/i);

      // Historical NULL row can be re-saved with other fields intact
      const resave = await updateInOutRegister({
        id: ids.inwardGeneralId,
        details: "Brick2 test letter — resaved",
      } as never);
      expect(resave.success).toBe(true);
      const historical = await prisma.inOutRegister.findUnique({
        where: { id: ids.inwardGeneralId },
      });
      expect(historical!.projectId).toBeNull();
      expect(historical!.details).toBe("Brick2 test letter — resaved");
      expect(historical!.serialNo).toMatch(/^INW\//);
    });
  }
);
