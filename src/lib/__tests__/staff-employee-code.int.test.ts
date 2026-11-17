/**
 * Employee-code standardization — integration tests on a disposable database.
 * Requires: RUN_INTEGRATION_TESTS=1 + DATABASE_URL=...disposable
 * Covers: SAEC-format issuance, next-unused numbering, concurrent-creation
 * uniqueness, manual-code rejection, no-reuse after delete, and the import
 * path ignoring supplied codes.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../actions/wrapper", () => ({
  withAuth: async (fn: (u: { id: string }) => unknown) => {
    try {
      return { success: true, data: await fn({ id: "int-test" }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
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

import { prisma } from "@/lib/prisma";
import { issueEmployeeCode } from "../employee-code";
import { createStaff, updateStaff } from "../actions/staff";
import { importModule } from "../actions/export-import";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const staffIds: string[] = [];
let seq = 0;

function nextName() {
  return `Code Test ${++seq}`;
}

async function maxSaecNum() {
  const rows = await prisma.$queryRaw<{ m: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("employeeCode" FROM 'SAEC([0-9]+)') AS INTEGER)) AS m
    FROM "Staff"
  `;
  return rows[0]?.m ?? 0;
}

async function seedMaxSaec() {
  // Seed a floor well above any existing code so issued numbers are predictable
  const floor = (await maxSaecNum()) + 100;
  const s = await prisma.staff.create({
    data: {
      name: `Seed Max ${floor}`,
      employeeCode: `SAEC${String(floor).padStart(3, "0")}`,
    },
    select: { id: true },
  });
  staffIds.push(s.id);
  return floor;
}

beforeAll(async () => {
  if (SKIP) return;
  // Self-contained schema for any disposable DB (mirrors the migration)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "previousEmployeeCode" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "EmployeeCodeCounter" (
      "scope" TEXT NOT NULL, "lastSeq" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "EmployeeCodeCounter_pkey" PRIMARY KEY ("scope"))`
  );
  floor = await seedMaxSaec(); // next issued must land above the floor
});

let floor = 0;

afterAll(async () => {
  if (SKIP) return;
  await prisma.staff.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.$disconnect();
});

describe.skipIf(SKIP)("issueEmployeeCode", () => {
  it("issues the next unused SAEC code", async () => {
    const code = await issueEmployeeCode();
    expect(code).toMatch(/^SAEC\d+$/);
    expect(parseInt(code.slice(4), 10)).toBeGreaterThan(floor);
  });

  it("increments monotonically", async () => {
    const a = parseInt((await issueEmployeeCode()).slice(4), 10);
    const b = parseInt((await issueEmployeeCode()).slice(4), 10);
    expect(b).toBeGreaterThan(a);
  });

  it("never issues a duplicate under concurrency", async () => {
    const codes = await Promise.all(
      Array.from({ length: 6 }, () => issueEmployeeCode())
    );
    expect(new Set(codes).size).toBe(6);
    codes.forEach((c) => expect(c).toMatch(/^SAEC\d+$/));
  });
});

describe.skipIf(SKIP)("createStaff code generation", () => {
  it("generates a SAEC code server-side", async () => {
    const res = await createStaff({ name: nextName(), isActive: true } as never);
    expect(res.success).toBe(true);
    expect(res.data?.employeeCode).toMatch(/^SAEC\d+$/);
    staffIds.push(res.data!.id);
  });

  it("rejects a manually supplied employeeCode", async () => {
    const res = await createStaff({
      name: nextName(),
      employeeCode: "HACK001",
    } as never);
    expect(res.success).toBe(false);
    expect(
      await prisma.staff.count({ where: { employeeCode: "HACK001" } })
    ).toBe(0);
  });

  it("issues unique codes under concurrent creates", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createStaff({ name: nextName(), isActive: true } as never)
      )
    );
    const codes = results.map((r) => {
      expect(r.success).toBe(true);
      staffIds.push(r.data!.id);
      return r.data!.employeeCode;
    });
    expect(new Set(codes).size).toBe(5);
    codes.forEach((c) => expect(c).toMatch(/^SAEC\d+$/));
  });

  it("never reuses a code after its staff is deleted", async () => {
    const res = await createStaff({ name: nextName(), isActive: true } as never);
    const issued = res.data!.employeeCode!;
    await prisma.staff.delete({ where: { id: res.data!.id } });

    const next = await createStaff({ name: nextName(), isActive: true } as never);
    staffIds.push(next.data!.id);
    expect(next.data!.employeeCode).not.toBe(issued);
    expect(parseInt(next.data!.employeeCode!.slice(4), 10)).toBeGreaterThan(
      parseInt(issued.slice(4), 10)
    );
  });
});

describe.skipIf(SKIP)("updateStaff", () => {
  it("rejects employee-code changes", async () => {
    const created = await createStaff({ name: nextName(), isActive: true } as never);
    staffIds.push(created.data!.id);
    const res = await updateStaff({
      id: created.data!.id,
      employeeCode: "OVERRIDE1",
    } as never);
    expect(res.success).toBe(false);
    const after = await prisma.staff.findUnique({ where: { id: created.data!.id } });
    expect(after?.employeeCode).toBe(created.data!.employeeCode);
  });
});

describe.skipIf(SKIP)("import path", () => {
  it("ignores a supplied employeeCode and assigns a generated SAEC code", async () => {
    const csv = [
      "name,employeeCode,designation",
      `${nextName()},IMPORTED99,Importer`,
    ].join("\n");
    const res = await importModule({ module: "staff", format: "csv", data: csv } as never);
    expect(res.success).toBe(true);
    expect(res.data!.imported).toBe(1);

    const staff = await prisma.staff.findFirst({
      where: { designation: "Importer" },
      orderBy: { createdAt: "desc" },
    });
    expect(staff?.employeeCode).toMatch(/^SAEC\d+$/);
    expect(staff?.employeeCode).not.toBe("IMPORTED99");
    staffIds.push(staff!.id);
  });
});

describe.skipIf(SKIP)("legacy code alias", () => {
  it("resolves a previousEmployeeCode in import lookups", async () => {
    const s = await prisma.staff.create({
      data: {
        name: "Legacy Alias",
        employeeCode: "SAEC950",
        previousEmployeeCode: "EMPOLD01",
      },
      select: { id: true },
    });
    staffIds.push(s.id);
    const found = await prisma.staff.findFirst({
      where: {
        OR: [
          { employeeCode: { equals: "empold01", mode: "insensitive" } },
          { previousEmployeeCode: { equals: "empold01", mode: "insensitive" } },
        ],
      },
    });
    expect(found?.id).toBe(s.id);
  });
});
