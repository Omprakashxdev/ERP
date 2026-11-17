/**
 * Server-authoritative serial issuance — integration tests on a disposable
 * database (saec_erp_serial_test). Requires:
 *   RUN_INTEGRATION_TESTS=1
 *   TEST_DATABASE_URL pointing at the disposable DB
 * Creates a minimal Client fixture, then exercises the real issue path.
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
  getNextRegisterRefNo,
} from "../actions/in-out-register";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
let clientId = "";
const recordIds: string[] = [];
let staffId = "";
let refSeq = 0;

// Helpers ----------------------------------------------------------------
async function createEntry(dir: "INWARD" | "OUTWARD", extra: object = {}) {
  const res = await createInOutRegister({
    direction: dir,
    documentDate: new Date("2026-10-15"),
    receivedDate: new Date("2026-10-15"),
    clientId,
    documentRefNo: `ST-DOC-${++refSeq}`,
    actionSuggestedStaffId: staffId,
    ...extra,
  });
  if (res.success) recordIds.push(res.data!.id);
  return res;
}
async function serialOf(id: string) {
  return (await prisma.inOutRegister.findUnique({ where: { id } }))!.serialNo;
}

(SKIP ? describe.skip : describe)("serial issuance — disposable DB", () => {
  beforeAll(async () => {
    // Disposable DB only — wipe prior run's records AND counters so the
    // suite is deterministic; counters are otherwise intentionally monotonic.
    await prisma.inOutRegister.deleteMany({});
    await prisma.registerSerialCounter.deleteMany({});
    const c = await prisma.client.create({
      data: { name: "SerialTest Client", abbreviation: "STT" },
    });
    clientId = c.id;
    const s = await prisma.staff.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    staffId =
      s?.id ??
      (await prisma.staff.create({
        data: { name: "SerialTest Staff", employeeCode: "STT-001" },
      })).id;
  });
  afterAll(async () => {
    await prisma.inOutRegister.deleteMany({ where: { clientId } });
    await prisma.client.delete({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("INWARD issues INW/<currentFY>/001 then /002", async () => {
    const fy = currentFy();
    const a = await createEntry("INWARD");
    const b = await createEntry("INWARD");
    expect(await serialOf(a.data!.id)).toBe(`INW/${fy}/001`);
    expect(await serialOf(b.data!.id)).toBe(`INW/${fy}/002`);
  });

  it("OUTWARD has an independent sequence starting at 001", async () => {
    const fy = currentFy();
    const a = await createEntry("OUTWARD");
    expect(await serialOf(a.data!.id)).toBe(`OUT/${fy}/001`);
  });

  it("forged client serialNo is ignored — server issues its own", async () => {
    const fy = currentFy();
    const r = await createEntry("INWARD", { serialNo: "X/FORGED/999" });
    const s = await serialOf(r.data!.id);
    expect(s).toBe(`INW/${fy}/003`);
  });

  it("20 concurrent creates → 20 unique serials", async () => {
    const fy = currentFy();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createEntry("OUTWARD"))
    );
    expect(results.every((r) => r.success)).toBe(true);
    const serials = await Promise.all(results.map((r) => serialOf(r.data!.id)));
    const set = new Set(serials);
    expect(set.size).toBe(20);
    // and they are exactly /002../021 (001 was issued earlier)
    const nums = [...set]
      .map((s) => parseInt(s!.split("/")[2], 10))
      .sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
  });

  it("edit never renumbers an issued serial", async () => {
    const before = await prisma.inOutRegister.findFirst({
      where: { clientId }, select: { id: true, serialNo: true },
    });
    const { updateInOutRegister } = await import("../actions/in-out-register");
    await updateInOutRegister({
      id: before!.id,
      details: "edited once",
      serialNo: "INW/HACK/999" as never,
    });
    const after = await prisma.inOutRegister.findUnique({
      where: { id: before!.id },
    });
    expect(after!.serialNo).toBe(before!.serialNo);
    expect(after!.details).toBe("edited once");
  });

  it("deleted serials are never reused", async () => {
    const fy = currentFy();
    const r = await createEntry("OUTWARD");
    const s = await serialOf(r.data!.id); // e.g. OUT/FY/022
    await prisma.inOutRegister.delete({ where: { id: r.data!.id } });
    recordIds.pop();
    const next = await createEntry("OUTWARD");
    const s2 = await serialOf(next.data!.id);
    expect(s2).not.toBe(s); // recycled number not reissued
    expect(parseInt(s2!.split("/")[2])).toBe(
      parseInt(s!.split("/")[2]) + 1
    );
    expect(s2).toMatch(new RegExp(`^OUT/${fy}/`));
  });

  it("counter survives a failed create (rollback leaves no gap debt)", async () => {
    // Force a failure: invalid clientId → FK error inside the transaction
    const before = await prisma.registerSerialCounter.findUnique({
      where: { scope: `OUT/${currentFy()}` },
    });
    await createInOutRegister({
      direction: "OUTWARD",
      documentDate: new Date("2026-10-15"),
      receivedDate: new Date("2026-10-15"),
      clientId: "cfake0000000000000000000x",
      documentRefNo: `ST-DOC-FAIL-${++refSeq}`,
      actionSuggestedStaffId: staffId,
    }).catch(() => {});
    const after = await prisma.registerSerialCounter.findUnique({
      where: { scope: `OUT/${currentFy()}` },
    });
    expect(after!.lastSeq).toBe(before!.lastSeq); // rolled back, not burned
  });

  it("DB-level uniqueness rejects a direct duplicate insert", async () => {
    const existing = await prisma.inOutRegister.findFirst({
      where: { clientId },
    });
    await expect(
      prisma.inOutRegister.create({
        data: {
          direction: "OUTWARD",
          documentDate: new Date("2026-10-15"),
          receivedDate: new Date("2026-10-15"),
          clientId,
          serialNo: existing!.serialNo,
        },
      })
    ).rejects.toThrow(/unique/i);
  });

  it("preview getNextRegisterRefNo matches the next counter", async () => {
    const fy = currentFy();
    const counter = await prisma.registerSerialCounter.findUnique({
      where: { scope: `OUT/${fy}` },
    });
    const r = await getNextRegisterRefNo("OUTWARD", new Date());
    expect(r.data!.refNo).toBe(
      `OUT/${fy}/${String(counter!.lastSeq + 1).padStart(3, "0")}`
    );
  });

  it("FY boundary: 31 Mar → previous FY, 1 Apr → new FY (IST)", async () => {
    const { issueRegisterSerialNo } = await import("@/lib/register-serial");
    // INW/2026-27 counter may already be non-zero (current FY) — capture it.
    const prior = await prisma.registerSerialCounter.findUnique({
      where: { scope: "INW/2026-27" },
    });
    const expectedNum = String((prior?.lastSeq ?? 0) + 1).padStart(3, "0");
    const seqs = await prisma.$transaction(async (tx) => [
      // 31 Mar 2027 23:59:59 IST = 18:29:59 UTC — last instant of FY 2026-27
      await issueRegisterSerialNo(tx, "INWARD", new Date("2027-03-31T18:29:59Z")),
      // 1 Apr 2027 00:00 IST = 31 Mar 18:30 UTC — first instant of FY 2027-28
      await issueRegisterSerialNo(tx, "INWARD", new Date("2027-03-31T18:30:00Z")),
      await issueRegisterSerialNo(tx, "INWARD", new Date("2027-04-01T06:00:00Z")),
      await issueRegisterSerialNo(tx, "OUTWARD", new Date("2027-04-01T06:00:00Z")),
    ]);
    expect(seqs[0]).toBe(`INW/2026-27/${expectedNum}`);
    expect(seqs[1]).toBe("INW/2027-28/001");
    expect(seqs[2]).toBe("INW/2027-28/002");
    expect(seqs[3]).toBe("OUT/2027-28/001"); // independent outward seq
  });

  it("sequence edges: 009→010, 099→100, 999→1000", async () => {
    const { bumpRegisterSerialCounter, issueRegisterSerialNo } =
      await import("@/lib/register-serial");
    const scope = `INW/${currentFy()}`;
    for (const [bumpTo, expectNext] of [
      [9, "010"],
      [99, "100"],
      [999, "1000"],
    ] as const) {
      await prisma.$transaction(async (tx) => {
        await tx.registerSerialCounter.upsert({
          where: { scope },
          create: { scope, lastSeq: bumpTo },
          update: { lastSeq: bumpTo },
        });
        const serial = await issueRegisterSerialNo(tx, "INWARD", new Date());
        expect(serial).toBe(`${scope}/${expectNext}`);
      });
    }
  });

  it("counter init from existing records preserves history", async () => {
    const { issueRegisterSerialNo } = await import("@/lib/register-serial");
    // simulate pre-migration data: serial exists, no counter row yet
    const legacy = await prisma.inOutRegister.create({
      data: {
        direction: "INWARD",
        documentDate: new Date("2026-10-15"),
        receivedDate: new Date("2026-10-15"),
        clientId,
        serialNo: `INW/${currentFy()}/777`,
      },
    });
    recordIds.push(legacy.id);
    await prisma.registerSerialCounter.delete({
      where: { scope: `INW/${currentFy()}` },
    }); // simulate counter never initialized
    const next = await prisma.$transaction((tx) =>
      issueRegisterSerialNo(tx, "INWARD")
    );
    expect(next).toBe(`INW/${currentFy()}/778`); // initialized from max
  });

  it("manual documentRefNo with serial-like pattern does not change counters", async () => {
    const scope = `INW/${currentFy()}`;
    const before = await prisma.registerSerialCounter.findUnique({
      where: { scope },
    });
    const r = await createEntry("INWARD", {
      documentRefNo: `INW/${currentFy()}/900`, // looks like a serial
    });
    const after = await prisma.registerSerialCounter.findUnique({
      where: { scope },
    });
    expect(after!.lastSeq).toBe(before!.lastSeq + 1); // +1 only, not 900
    const s = await serialOf(r.data!.id);
    expect(s).not.toContain("900");
  });
});

function currentFy(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}
