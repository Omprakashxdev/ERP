/**
 * In-Out Register customer changes (Brick 1) — integration tests on a
 * disposable database. Requires:
 *   RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: mandatory documentRefNo + actionSuggestedStaffId (both
 * directions), 2-option inwardType on create, replyDueDate rules,
 * normalized unique document numbers, and legacy-record preservation.
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
const recordIds: string[] = [];

function base(extra: object = {}) {
  return {
    direction: "INWARD" as const,
    documentDate: new Date("2026-10-15"),
    receivedDate: new Date("2026-10-15"),
    clientId,
    actionSuggestedStaffId: staffId,
    documentRefNo: "DOC-UNIQUE-1",
    ...extra,
  };
}

async function createEntry(extra: object = {}) {
  const res = await createInOutRegister(base(extra));
  if (res.success) recordIds.push(res.data!.id);
  return res;
}

(SKIP ? describe.skip : describe)(
  "in-out register mandatory fields + uniqueness — disposable DB",
  () => {
    beforeAll(async () => {
      // Apply the release's partial unique index so the disposable DB
      // mirrors production (idempotent — same SQL as the migration).
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "InOutRegister_documentRefNo_key"
        ON "InOutRegister" (lower(btrim("documentRefNo")))
        WHERE "documentRefNo" IS NOT NULL`;
      const client = await prisma.client.findFirst({ select: { id: true } });
      if (client) {
        clientId = client.id;
      } else {
        clientId = (
          await prisma.client.create({
            data: { name: "InOut Mandatory Test Client", abbreviation: "IMTC" },
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
            data: { name: "Test Staff Member", employeeCode: "TST-999" },
          })
        ).id;
      }
    });

    afterAll(async () => {
      await prisma.inOutRegisterDocument.deleteMany({
        where: { inOutRegisterId: { in: recordIds } },
      });
      await prisma.inOutRegister.deleteMany({
        where: { id: { in: recordIds } },
      });
    });

    it("rejects a new Inward with missing document number", async () => {
      const res = await createInOutRegister(
        base({ documentRefNo: undefined })
      );
      expect(res.success).toBe(false);
    });

    it("rejects a new Inward with whitespace-only document number", async () => {
      const res = await createInOutRegister(base({ documentRefNo: "   " }));
      expect(res.success).toBe(false);
    });

    it("rejects a new Outward with missing document number", async () => {
      const res = await createInOutRegister(
        base({ direction: "OUTWARD", documentRefNo: undefined })
      );
      expect(res.success).toBe(false);
    });

    it("rejects a new Inward with missing action-suggested staff", async () => {
      const res = await createInOutRegister(
        base({ actionSuggestedStaffId: undefined })
      );
      expect(res.success).toBe(false);
    });

    it("rejects a new Outward with missing action-suggested staff", async () => {
      const res = await createInOutRegister(
        base({ direction: "OUTWARD", actionSuggestedStaffId: undefined })
      );
      expect(res.success).toBe(false);
    });

    it("rejects an action-suggested staff id that does not exist", async () => {
      const res = await createInOutRegister(
        base({ actionSuggestedStaffId: "clxxxxxxxxxxxxxxxxxxxxxx1" })
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/staff/i);
    });

    it("saves valid Inward and Outward entries", async () => {
      const inw = await createEntry();
      expect(inw.success).toBe(true);
      const out = await createEntry({
        direction: "OUTWARD",
        documentRefNo: "DOC-UNIQUE-2",
      });
      expect(out.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: out.data!.id },
      });
      expect(saved!.actionSuggestedStaffId).toBe(staffId);
      expect(saved!.serialNo).toMatch(/^OUT\//);
    });

    it("rejects legacy inward types on create", async () => {
      for (const legacy of ["COMPLAINT", "QUERY", "NOTICE"]) {
        const res = await createEntry({ inwardType: legacy, documentRefNo: `L-${legacy}` });
        expect(res.success).toBe(false);
      }
    });

    it("saves a new Informative inward without a reply deadline", async () => {
      const res = await createEntry({
        inwardType: "INFORMATIVE",
        documentRefNo: "DOC-INFO-1",
        replyDueDate: null,
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
      });
      expect(saved!.replyDueDate).toBeNull();
      expect(saved!.inwardType).toBe("INFORMATIVE");
    });

    it("saves a new Action Required inward with a reply deadline", async () => {
      const res = await createEntry({
        inwardType: "ACTION_REQUIRED",
        documentRefNo: "DOC-AR-1",
        replyDueDate: new Date("2026-10-30"),
      });
      expect(res.success).toBe(true);
      const saved = await prisma.inOutRegister.findUnique({
        where: { id: res.data!.id },
      });
      expect(saved!.replyDueDate?.toISOString().slice(0, 10)).toBe("2026-10-30");
    });

    it("rejects a duplicate document number on create", async () => {
      const res = await createEntry({ documentRefNo: "DOC-UNIQUE-1" });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already registered/i);
    });

    it("rejects duplicates ignoring case and outer spaces", async () => {
      const res = await createEntry({ documentRefNo: "  doc-unique-1  " });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already registered/i);
    });

    it("rejects a duplicate document number on edit of another record", async () => {
      const other = await createEntry({ documentRefNo: "DOC-OTHER-1" });
      expect(other.success).toBe(true);
      const res = await updateInOutRegister({
        id: other.data!.id,
        documentRefNo: "DOC-UNIQUE-1",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already registered/i);
    });

    it("allows editing a record keeping its own document number", async () => {
      const own = await createEntry({ documentRefNo: "DOC-OWN-1" });
      expect(own.success).toBe(true);
      const res = await updateInOutRegister({
        id: own.data!.id,
        details: "edited details",
      });
      expect(res.success).toBe(true);
    });

    it("lets only one of two concurrent duplicate submissions succeed", async () => {
      const [a, b] = await Promise.all([
        createEntry({ documentRefNo: "DOC-RACE-1" }),
        createEntry({ documentRefNo: "doc-race-1" }),
      ]);
      const ok = [a, b].filter((r) => r.success);
      const failed = [a, b].filter((r) => !r.success);
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].error).toMatch(/already registered/i);
    });

    it("requires completing mandatory fields when editing an incomplete legacy record", async () => {
      // Legacy-style record created directly: NULL docRefNo + NULL staff
      const legacy = await prisma.inOutRegister.create({
        data: {
          direction: "INWARD",
          documentDate: new Date("2026-01-10"),
          receivedDate: new Date("2026-01-10"),
          serialNo: "INW/2025-26/900",
          clientId,
          inwardType: "COMPLAINT",
          replyDueDate: new Date("2026-01-20"),
        },
      });
      recordIds.push(legacy.id);

      const res = await updateInOutRegister({
        id: legacy.id,
        details: "unrelated edit",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/document number|required/i);

      // Completing the mandatory fields lets the edit succeed and keeps
      // the legacy type + saved deadline untouched.
      const fixed = await updateInOutRegister({
        id: legacy.id,
        documentRefNo: "DOC-LEGACY-1",
        actionSuggestedStaffId: staffId,
        details: "unrelated edit",
      });
      expect(fixed.success).toBe(true);
      const after = await prisma.inOutRegister.findUnique({
        where: { id: legacy.id },
      });
      expect(after!.inwardType).toBe("COMPLAINT");
      expect(after!.replyDueDate).not.toBeNull();
      expect(after!.documentRefNo).toBe("DOC-LEGACY-1");
      expect(after!.actionSuggestedStaffId).toBe(staffId);
    });

    it("rejects assigning a legacy inward type to another record", async () => {
      const plain = await createEntry({
        inwardType: "INFORMATIVE",
        documentRefNo: "DOC-PLAIN-1",
      });
      const res = await updateInOutRegister({
        id: plain.data!.id,
        inwardType: "COMPLAINT",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Informative or Action Required/i);
    });
  }
);
