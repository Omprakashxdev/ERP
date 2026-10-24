/**
 * In-Out Register "Received by" employee link — integration tests on a
 * disposable database. Requires:
 *   RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: linking a staff member on create, active-only rule for new
 * picks, preservation of an unchanged (now-inactive) link on edit,
 * clearing, and untouched legacy free-text values.
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
vi.mock("../actions/task-linking", () => ({
  createInOutRegisterLinkedTasks: async () => {},
  deleteLinkedTasks: async () => {},
}));

import { prisma } from "@/lib/prisma";
import {
  createInOutRegister,
  updateInOutRegister,
} from "../actions/in-out-register";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
let clientId = "";
let staffId = "";
let inactiveStaffId = "";
const recordIds: string[] = [];
const staffIds: string[] = [];
let refSeq = 0;

function base(extra: object = {}) {
  return {
    direction: "INWARD" as const,
    documentDate: new Date("2026-10-15"),
    receivedDate: new Date("2026-10-15"),
    clientId,
    actionSuggestedStaffId: staffId,
    documentRefNo: `RB-TEST-${++refSeq}`,
    ...extra,
  };
}

async function createEntry(extra: object = {}) {
  const res = await createInOutRegister(base(extra));
  if (res.success) recordIds.push(res.data!.id);
  return res;
}

async function getRow(id: string) {
  return prisma.inOutRegister.findUnique({ where: { id } });
}

(SKIP ? describe.skip : describe)(
  "in-out register received-by staff link — disposable DB",
  () => {
    beforeAll(async () => {
      const client = await prisma.client.findFirst({ select: { id: true } });
      if (client) {
        clientId = client.id;
      } else {
        clientId = (
          await prisma.client.create({
            data: { name: "ReceivedBy Test Client", abbreviation: "RBTC" },
          })
        ).id;
      }
      const staff = await prisma.staff.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (staff) {
        staffId = staff.id;
      } else {
        staffId = (
          await prisma.staff.create({
            data: { name: "RB Test Staff", employeeCode: "RB-001" },
          })
        ).id;
        staffIds.push(staffId);
      }
      const inactive = await prisma.staff.create({
        data: { name: "RB Inactive Staff", isActive: false },
      });
      inactiveStaffId = inactive.id;
      staffIds.push(inactiveStaffId);
    });

    afterAll(async () => {
      await prisma.inOutRegisterDocument.deleteMany({
        where: { inOutRegisterId: { in: recordIds } },
      });
      await prisma.inOutRegister.deleteMany({
        where: { id: { in: recordIds } },
      });
      await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
    });

    it("creates an inward entry linked to an active employee", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBe(staffId);
    });

    it("rejects a received-by link to a nonexistent employee", async () => {
      const res = await createEntry({
        receivedByStaffId: "c000000000000000000000001",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/does not exist/);
    });

    it("rejects a received-by link to an inactive employee on create", async () => {
      const res = await createEntry({ receivedByStaffId: inactiveStaffId });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/inactive/);
    });

    it("rejects a non-cuid receivedByStaffId at schema level", async () => {
      const res = await createEntry({ receivedByStaffId: "not-a-cuid" });
      expect(res.success).toBe(false);
    });

    it("preserves an unchanged received-by link even after deactivation", async () => {
      // Create a disposable active employee, link them, then deactivate —
      // resaving the entry with the same link must still succeed.
      const tempStaff = await prisma.staff.create({
        data: { name: "RB Temp Staff" },
      });
      staffIds.push(tempStaff.id);
      const res = await createEntry({ receivedByStaffId: tempStaff.id });
      expect(res.success).toBe(true);
      await prisma.staff.update({
        where: { id: tempStaff.id },
        data: { isActive: false },
      });
      const upd = await updateInOutRegister({
        id: res.data!.id,
        receivedByStaffId: tempStaff.id,
        details: "edited after deactivation",
      });
      expect(upd.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBe(tempStaff.id);
      expect(row?.details).toBe("edited after deactivation");
    });

    it("rejects switching the link to an inactive employee on edit", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const upd = await updateInOutRegister({
        id: res.data!.id,
        receivedByStaffId: inactiveStaffId,
      });
      expect(upd.success).toBe(false);
      expect(upd.error).toMatch(/inactive/);
    });

    it("clears the received-by link with an explicit null", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const upd = await updateInOutRegister({
        id: res.data!.id,
        receivedByStaffId: null,
      });
      expect(upd.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBeNull();
    });

    it("keeps the stored link when the field is omitted from an update", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const upd = await updateInOutRegister({
        id: res.data!.id,
        details: "no receiver field in payload",
      });
      expect(upd.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBe(staffId);
    });

    it("stores staff link and legacy manual name independently", async () => {
      const res = await createEntry({
        receivedByStaffId: staffId,
        receivedByPersonName: "ચોકીદાર મગન",
      });
      expect(res.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBe(staffId);
      expect(row?.receivedByPersonName).toBe("ચોકીદાર મગન");
    });

    it("never overwrites the legacy manual name on edit", async () => {
      const res = await createEntry({
        receivedByPersonName: "Manual Guard Name",
      });
      expect(res.success).toBe(true);
      const upd = await updateInOutRegister({
        id: res.data!.id,
        receivedByStaffId: staffId,
      });
      expect(upd.success).toBe(true);
      const row = await getRow(res.data!.id);
      expect(row?.receivedByStaffId).toBe(staffId);
      expect(row?.receivedByPersonName).toBe("Manual Guard Name");
    });

    it("rejects an edit to a nonexistent employee", async () => {
      const res = await createEntry({});
      expect(res.success).toBe(true);
      const upd = await updateInOutRegister({
        id: res.data!.id,
        receivedByStaffId: "c000000000000000000000002",
      });
      expect(upd.success).toBe(false);
      expect(upd.error).toMatch(/does not exist/);
    });
  }
);
