/**
 * In-Out "Received by" export/import round-trip — integration tests on a
 * disposable database. Requires:
 *   RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: CSV + XLSX export of a linked employee, re-import resolving
 * back to the same staff id, duplicate-name ambiguity rejection,
 * employeeCode resolution, and Gujarati legacy names surviving intact.
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

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { createInOutRegister } from "../actions/in-out-register";
import { exportModule, importModule } from "../actions/export-import";
import { parseCsv } from "../export-import";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
let clientId = "";
let clientName = "";
let staffId = "";
let staffName = "";
let dupAId = "";
let dupBId = "";
let codedId = "";
const recordIds: string[] = [];
const staffIds: string[] = [];
let refSeq = 0;

const DUP_NAME = "RB Duplicate Name";
const GUJ_NAME = "ચોકીદાર મગનભાઈ";
const CODE = "RBCODE-X1";

function nextRef() {
  return `RBX-${++refSeq}`;
}

async function createEntry(extra: object = {}) {
  const res = await createInOutRegister({
    direction: "INWARD" as const,
    documentDate: new Date("2026-10-15"),
    receivedDate: new Date("2026-10-15"),
    clientId,
    actionSuggestedStaffId: staffId,
    documentRefNo: nextRef(),
    ...extra,
  });
  if (res.success) recordIds.push(res.data!.id);
  return res;
}

// CSV header mirrors the inOutRegister import template columns.
const IMPORT_HEADER =
  "direction,documentDate,receivedDate,documentRefNo,details,client,department,actionSuggestedStaff,mode,letterPad,inwardType,receivedByPersonName,receivedByStaff,replyDueDate,parentInwardRefNo";

function importRow(overrides: Record<string, string> = {}) {
  const cols = {
    direction: "INWARD",
    documentDate: "2026-10-15",
    receivedDate: "2026-10-15",
    documentRefNo: nextRef(),
    details: "rb import test",
    client: clientName,
    department: "",
    actionSuggestedStaff: staffName,
    mode: "",
    letterPad: "",
    inwardType: "INFORMATIVE",
    receivedByPersonName: "",
    receivedByStaff: "",
    replyDueDate: "",
    parentInwardRefNo: "",
    ...overrides,
  };
  return Object.values(cols)
    .map((v) => (v.includes(",") ? `"${v}"` : v))
    .join(",");
}

async function importCsv(rows: string[]) {
  const res = await importModule({
    module: "inOutRegister",
    format: "csv",
    data: [IMPORT_HEADER, ...rows].join("\n"),
  } as never);
  return res;
}

async function findByRef(ref: string) {
  return prisma.inOutRegister.findFirst({ where: { documentRefNo: ref } });
}

(SKIP ? describe.skip : describe)(
  "in-out received-by export/import — disposable DB",
  () => {
    beforeAll(async () => {
      const client = await prisma.client.findFirst({
        select: { id: true, name: true },
      });
      if (client) {
        clientId = client.id;
        clientName = client.name;
      } else {
        const c = await prisma.client.create({
          data: { name: "RBX Test Client", abbreviation: "RBXC" },
        });
        clientId = c.id;
        clientName = c.name;
      }
      const staff = await prisma.staff.findFirst({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      if (staff) {
        staffId = staff.id;
        staffName = staff.name;
      } else {
        const s = await prisma.staff.create({
          data: { name: "RBX Staff", employeeCode: "RBX-1" },
        });
        staffId = s.id;
        staffName = s.name;
        staffIds.push(staffId);
      }
      const dupA = await prisma.staff.create({
        data: { name: DUP_NAME, employeeCode: `${CODE}-A` },
      });
      const dupB = await prisma.staff.create({
        data: { name: DUP_NAME, employeeCode: `${CODE}-B` },
      });
      const coded = await prisma.staff.create({
        data: { name: "RBX Coded Staff", employeeCode: CODE },
      });
      dupAId = dupA.id;
      dupBId = dupB.id;
      codedId = coded.id;
      staffIds.push(dupAId, dupBId, codedId);
    });

    afterAll(async () => {
      await prisma.inOutRegisterDocument.deleteMany({
        where: { inOutRegisterId: { in: recordIds } },
      });
      // imported rows are tracked by ref prefix
      const imported = await prisma.inOutRegister.findMany({
        where: { documentRefNo: { startsWith: "RBX-" } },
        select: { id: true },
      });
      await prisma.inOutRegister.deleteMany({
        where: { id: { in: [...recordIds, ...imported.map((r) => r.id)] } },
      });
      await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
    });

    it("exports the linked employee name in CSV", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const ref = (await findByRef(`RBX-${refSeq}`))!.documentRefNo!;
      const exp = await exportModule({
        module: "inOutRegister",
        format: "csv",
      } as never);
      expect(exp.success).toBe(true);
      const rows = parseCsv(exp.data!.content);
      const row = rows.find((r) => r.documentRefNo === ref);
      expect(row).toBeTruthy();
      expect(row!.receivedByStaff).toBe(staffName);
    });

    it("exports the linked employee name in XLSX", async () => {
      const res = await createEntry({ receivedByStaffId: staffId });
      expect(res.success).toBe(true);
      const ref = (await findByRef(`RBX-${refSeq}`))!.documentRefNo!;
      const exp = await exportModule({
        module: "inOutRegister",
        format: "xlsx",
      } as never);
      expect(exp.success).toBe(true);
      const wb = XLSX.read(Buffer.from(exp.data!.content, "base64"), {
        type: "buffer",
      });
      const sheet = XLSX.utils.sheet_to_json<Record<string, string>>(
        wb.Sheets[wb.SheetNames[0]]
      );
      const row = sheet.find((r) => r.documentRefNo === ref);
      expect(row).toBeTruthy();
      expect(row!.receivedByStaff).toBe(staffName);
    });

    it("re-import resolves the employee name back to the same staff id", async () => {
      const ref = nextRef();
      const res = await importCsv([
        importRow({ documentRefNo: ref, receivedByStaff: staffName }),
      ]);
      expect(res.success).toBe(true);
      expect(res.data!.imported).toBe(1);
      const row = await findByRef(ref);
      expect(row?.receivedByStaffId).toBe(staffId);
    });

    it("rejects an ambiguous employee name instead of picking silently", async () => {
      const ref = nextRef();
      const res = await importCsv([
        importRow({ documentRefNo: ref, receivedByStaff: DUP_NAME }),
      ]);
      expect(res.success).toBe(true);
      expect(res.data!.imported).toBe(0);
      expect(res.data!.errors.join(" ")).toMatch(/matches .*employees/i);
      expect(await findByRef(ref)).toBeNull();
    });

    it("resolves an employee by employeeCode even with duplicate names", async () => {
      const ref = nextRef();
      const res = await importCsv([
        importRow({ documentRefNo: ref, receivedByStaff: `${CODE}-A` }),
      ]);
      expect(res.success).toBe(true);
      expect(res.data!.imported).toBe(1);
      const row = await findByRef(ref);
      expect(row?.receivedByStaffId).toBe(dupAId);
    });

    it("round-trips a Gujarati manual name without corruption", async () => {
      const res = await createEntry({ receivedByPersonName: GUJ_NAME });
      expect(res.success).toBe(true);
      const ref = (await findByRef(`RBX-${refSeq}`))!.documentRefNo!;
      const exp = await exportModule({
        module: "inOutRegister",
        format: "csv",
      } as never);
      expect(exp.data!.content).toContain(GUJ_NAME);
      const rows = parseCsv(exp.data!.content);
      const row = rows.find((r) => r.documentRefNo === ref);
      expect(row!.receivedByPersonName).toBe(GUJ_NAME);

      // import the same value into a fresh entry — byte-identical
      const ref2 = nextRef();
      const imp = await importCsv([
        importRow({ documentRefNo: ref2, receivedByPersonName: GUJ_NAME }),
      ]);
      expect(imp.data!.imported).toBe(1);
      const stored = await findByRef(ref2);
      expect(stored?.receivedByPersonName).toBe(GUJ_NAME);
      expect(stored?.receivedByStaffId).toBeNull();
    });
  }
);
