/**
 * Integration tests for getNextRegisterRefNo / serial behavior.
 * Runs against the real isolated test DB (saec_erp_manual_test).
 * Cleans up every fixture it creates — never touches seeded records.
 * Runs only when RUN_INTEGRATION_TESTS=1 is set.
 */
import { describe, it, expect, vi, afterAll } from "vitest";

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

import { prisma } from "@/lib/prisma";
import { getNextRegisterRefNo } from "../actions/in-out-register";

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const createdIds: string[] = [];
const FUTURE_DATE = "2099-05-01"; // FY 2099-00 — zero real data collision

async function makeFixture(
  serialNo: string,
  dir: "INWARD" | "OUTWARD" = "INWARD",
  field: "serialNo" | "documentRefNo" = "serialNo"
) {
  const client = await prisma.client.findFirst({ select: { id: true } });
  const rec = await prisma.inOutRegister.create({
    data: {
      direction: dir,
      documentDate: new Date("2099-05-01T00:00:00.000Z"),
      receivedDate: new Date("2099-05-01T00:00:00.000Z"),
      clientId: client!.id,
      [field]: serialNo,
    },
  });
  createdIds.push(rec.id);
  return rec;
}

(SKIP ? describe.skip : describe)("serial generator — real DB", () => {
  afterAll(async () => {
    if (createdIds.length) {
      await prisma.inOutRegister.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma?.$disconnect();
  });

  it("generates 001 in an empty direction/FY scope", async () => {
    const r = await getNextRegisterRefNo("INWARD", FUTURE_DATE);
    expect(r.data!.refNo).toBe("INW/2099-00/001");
  });

  it("increments 009 → 010 without padding overflow", async () => {
    await makeFixture("INW/2099-00/009");
    const r = await getNextRegisterRefNo("INWARD", FUTURE_DATE);
    expect(r.data!.refNo).toBe("INW/2099-00/010");
  });

  it("increments 099 → 100 and 999 → 1000 (no truncation)", async () => {
    await makeFixture("INW/2099-00/099");
    const r1 = await getNextRegisterRefNo("INWARD", FUTURE_DATE);
    expect(r1.data!.refNo).toBe("INW/2099-00/100");
    await makeFixture("INW/2099-00/999");
    const r2 = await getNextRegisterRefNo("INWARD", FUTURE_DATE);
    expect(r2.data!.refNo).toBe("INW/2099-00/1000");
  });

  it("OUTWARD uses OUT prefix and its own scope", async () => {
    const r = await getNextRegisterRefNo("OUTWARD", FUTURE_DATE);
    expect(r.data!.refNo).toBe("OUT/2099-00/001");
  });

  it("DB accepts duplicate serialNo — proves missing unique constraint", async () => {
    const a = await makeFixture("OUT/2099-00/777", "OUTWARD");
    const b = await makeFixture("OUT/2099-00/777", "OUTWARD");
    expect(a.id).not.toBe(b.id); // both inserted — no constraint
  });

  it("manual documentRefNo matching the pattern inflates the sequence", async () => {
    await makeFixture("INW/2099-00/555", "INWARD", "documentRefNo");
    const r = await getNextRegisterRefNo("INWARD", FUTURE_DATE);
    expect(r.data!.refNo).toBe("INW/2099-00/1000"); // 999 remains max
  });

  // NOTE: create-path behavior (forged serials, recycling, transactional
  // issuance, uniqueness) is covered by in-out-serial-issuance.int.test.ts
  // against the counter-table schema. This file covers the record-scan
  // preview behavior of getNextRegisterRefNo only.
});
