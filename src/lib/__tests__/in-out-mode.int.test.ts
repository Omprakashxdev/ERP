/**
 * In-Out Register Brick 2 — Mode Master + Letter pad integration tests
 * on a disposable database. Requires:
 *   RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: Mode Master CRUD + normalized uniqueness + soft deactivation,
 * register modeId validation (active-only for new selections, preserved
 * inactive references), optional NULL mode, Letter pad persistence with
 * Unicode, and Brick 1 rules staying enforced.
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
  withAuth: async (
    fn: (u: { id: string; role?: string }) => unknown,
    _roles?: unknown
  ) => {
    try {
      return { success: true, data: await fn({ id: "int-test", role: "ADMIN" }) };
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
import {
  createMaster,
  updateMaster,
  deleteMaster,
  getActiveModes,
  getMasterList,
} from "../actions/masters";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
let clientId = "";
let staffId = "";
const recordIds: string[] = [];
const modeIds: string[] = [];

function base(extra: object = {}) {
  return {
    direction: "INWARD" as const,
    documentDate: new Date("2026-10-15"),
    receivedDate: new Date("2026-10-15"),
    clientId,
    actionSuggestedStaffId: staffId,
    documentRefNo: "MODE-DOC-1",
    ...extra,
  };
}

async function createEntry(extra: object = {}) {
  const res = await createInOutRegister(base(extra));
  if (res.success) recordIds.push(res.data!.id);
  return res;
}

(SKIP ? describe.skip : describe)(
  "mode master + letter pad — disposable DB",
  () => {
    let byPostId = "";
    let courierId = "";
    let inactiveId = "";

    beforeAll(async () => {
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "InOutRegister_documentRefNo_key"
        ON "InOutRegister" (lower(btrim("documentRefNo")))
        WHERE "documentRefNo" IS NOT NULL`;
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "ModeMaster_name_key"
        ON "ModeMaster" (lower(btrim("name")))`;
      const client = await prisma.client.findFirst({ select: { id: true } });
      clientId =
        client?.id ??
        (
          await prisma.client.create({
            data: { name: "Mode Test Client", abbreviation: "MOTC" },
          })
        ).id;
      const staff = await prisma.staff.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      staffId =
        staff?.id ??
        (
          await prisma.staff.create({
            data: { name: "Mode Test Staff", employeeCode: "MODE-999" },
          })
        ).id;
    });

    afterAll(async () => {
      await prisma.inOutRegisterDocument.deleteMany({
        where: { inOutRegisterId: { in: recordIds } },
      });
      await prisma.inOutRegister.deleteMany({
        where: { id: { in: recordIds } },
      });
      await prisma.modeMaster.deleteMany({
        where: { id: { in: modeIds } },
      });
    });

    it("creates a Mode via the generic master action", async () => {
      const res = await createMaster("modeMaster", { name: "By Post" });
      expect(res.success).toBe(true);
      byPostId = res.data!.id;
      modeIds.push(byPostId);
      const saved = await prisma.modeMaster.findUnique({
        where: { id: byPostId },
      });
      expect(saved!.name).toBe("By Post");
      expect(saved!.isActive).toBe(true);
    });

    it("lists modes through getMasterList with search", async () => {
      const res = await getMasterList("modeMaster", "post");
      expect(res.success).toBe(true);
      expect((res.data as { id: string }[]).map((m) => m.id)).toContain(
        byPostId
      );
    });

    it("rejects duplicate mode names ignoring case and outer spaces", async () => {
      const res = await createMaster("modeMaster", { name: "  by POST " });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already exists/i);
      const res2 = await createMaster("modeMaster", { name: "BY POST" });
      expect(res2.success).toBe(false);
    });

    it("rejects a blank mode name", async () => {
      const res = await createMaster("modeMaster", { name: "   " });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/required/i);
    });

    it("edits a mode name and deactivates it", async () => {
      const res = await createMaster("modeMaster", { name: "Courier" });
      expect(res.success).toBe(true);
      courierId = res.data!.id;
      modeIds.push(courierId);

      const renamed = await updateMaster("modeMaster", {
        id: courierId,
        name: "Hand Delivery",
      });
      expect(renamed.success).toBe(true);
      const saved = await prisma.modeMaster.findUnique({
        where: { id: courierId },
      });
      expect(saved!.name).toBe("Hand Delivery");

      // rename collision with existing "By Post" is rejected
      const clash = await updateMaster("modeMaster", {
        id: courierId,
        name: "  BY POST",
      });
      expect(clash.success).toBe(false);
    });

    it("saves a register entry with an active mode and trims Letter pad", async () => {
      const res = await createEntry({
        documentRefNo: "MODE-DOC-2",
        modeId: byPostId,
        letterPad: "  Head Office pad  ",
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
        include: { mode: true },
      });
      expect(saved!.modeId).toBe(byPostId);
      expect(saved!.mode!.name).toBe("By Post");
      expect(saved!.letterPad).toBe("Head Office pad");
    });

    it("saves an entry with NULL mode and NULL letter pad (both optional)", async () => {
      const res = await createEntry({
        direction: "OUTWARD",
        documentRefNo: "MODE-DOC-3",
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
      });
      expect(saved!.modeId).toBeNull();
      expect(saved!.letterPad).toBeNull();
    });

    it("persists Gujarati/Unicode letter pad text", async () => {
      const gujarati = "શ્રી સરદાર પટેલ લેટર પેડ";
      const res = await createEntry({
        documentRefNo: "MODE-DOC-4",
        letterPad: gujarati,
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
      });
      expect(saved!.letterPad).toBe(gujarati);
    });

    it("works on an Outward entry with mode + letter pad", async () => {
      const res = await createEntry({
        direction: "OUTWARD",
        documentRefNo: "MODE-DOC-5",
        modeId: courierId,
        letterPad: "Regional pad",
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
      });
      expect(saved!.modeId).toBe(courierId);
      expect(saved!.letterPad).toBe("Regional pad");
    });

    it("rejects a nonexistent mode id on create", async () => {
      const res = await createEntry({
        documentRefNo: "MODE-DOC-6",
        modeId: "cl0000000000000000000000x",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/mode/i);
    });

    it("deactivates a mode and blocks it for new entries", async () => {
      const created = await createMaster("modeMaster", { name: "Fax" });
      expect(created.success).toBe(true);
      inactiveId = created.data!.id;
      modeIds.push(inactiveId);

      const off = await updateMaster("modeMaster", {
        id: inactiveId,
        isActive: false,
      });
      expect(off.success).toBe(true);

      const res = await createEntry({
        documentRefNo: "MODE-DOC-7",
        modeId: inactiveId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/inactive/i);

      const active = await getActiveModes();
      const ids = (active.data as { id: string }[]).map((m) => m.id);
      expect(ids).not.toContain(inactiveId);
      expect(ids).toContain(byPostId);
    });

    it("preserves a saved inactive-mode reference on ordinary edits", async () => {
      // create while Fax was still allowed? It is inactive now — create a
      // new active mode, use it, deactivate, then edit the entry.
      const m = await createMaster("modeMaster", { name: "Speed Post" });
      expect(m.success).toBe(true);
      const speedId = m.data!.id;
      modeIds.push(speedId);

      const entry = await createEntry({
        documentRefNo: "MODE-DOC-8",
        modeId: speedId,
      });
      expect(entry.success).toBe(true);

      await updateMaster("modeMaster", { id: speedId, isActive: false });

      // Unrelated edit keeps the now-inactive mode.
      const edit = await updateInOutRegister({
        id: entry.data!.id,
        details: "edited after deactivation",
      });
      expect(edit.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: entry.data!.id },
      });
      expect(saved!.modeId).toBe(speedId);

      // Re-selecting the same inactive id unchanged is also fine; picking
      // it fresh on another record is rejected.
      const other = await createEntry({ documentRefNo: "MODE-DOC-9" });
      expect(other.success).toBe(true);
      const reassign = await updateInOutRegister({
        id: other.data!.id,
        modeId: speedId,
      });
      expect(reassign.success).toBe(false);
      expect(reassign.error).toMatch(/inactive/i);

      // Switching to a still-active mode works.
      const swap = await updateInOutRegister({
        id: other.data!.id,
        modeId: byPostId,
      });
      expect(swap.success).toBe(true);
    });

    it("rejects a nonexistent mode id on update", async () => {
      const entry = await createEntry({ documentRefNo: "MODE-DOC-10" });
      expect(entry.success).toBe(true);
      const res = await updateInOutRegister({
        id: entry.data!.id,
        modeId: "cl0000000000000000000000y",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/mode/i);
    });

    it("refuses to delete a mode referenced by register entries", async () => {
      const res = await deleteMaster("modeMaster", byPostId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/deactivate/i);
    });

    it("deletes an unreferenced mode", async () => {
      const m = await createMaster("modeMaster", { name: "Pigeon" });
      expect(m.success).toBe(true);
      const res = await deleteMaster("modeMaster", m.data!.id);
      expect(res.success).toBe(true);
      // (not pushed into modeIds — already gone)
    });

    it("keeps Brick 1 rules intact alongside the new fields", async () => {
      // Missing doc number still rejected even with a valid mode.
      const noDoc = await createInOutRegister(
        base({ documentRefNo: undefined, modeId: byPostId })
      );
      expect(noDoc.success).toBe(false);
      // Missing staff still rejected.
      const noStaff = await createInOutRegister(
        base({ actionSuggestedStaffId: undefined, modeId: byPostId })
      );
      expect(noStaff.success).toBe(false);
      // Letter pad does not affect document-number uniqueness.
      const dup = await createEntry({
        documentRefNo: "mode-doc-2",
        letterPad: "x",
      });
      expect(dup.success).toBe(false);
      expect(dup.error).toMatch(/already registered/i);
    });
  }
);
