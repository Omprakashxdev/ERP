import { describe, it, expect, vi, beforeEach } from "vitest";
import { importModule } from "@/lib/actions/export-import";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/actions/wrapper", () => ({
  withPermission: async (_res: string, _act: string, fn: (user: { id: string }) => Promise<unknown>) => {
    try {
      const data = await fn({ id: "test-admin" });
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
  checkRateLimit: async () => {},
  audit: async () => {},
  sanitizeForAudit: async (x: unknown) => x,
}));

vi.mock("@/lib/register-serial", () => ({
  issueRegisterSerialNo: vi.fn(async (_tx: unknown, dir: string) =>
    dir === "OUTWARD" ? "OUT/MOCK/001" : "INW/MOCK/001"
  ),
  bumpRegisterSerialCounter: vi.fn(async () => {}),
}));

// In-memory store simulating the InOutRegister table
let store: any[] = [];

const txMock = {
  inOutRegister: {
    create: async (args: any) => {
      const rec = { id: `id-${store.length + 1}`, ...args.data };
      store.push(rec);
      return rec;
    },
  },
};

function mockPrisma() {
  vi.spyOn(prisma.client, "findFirst").mockResolvedValue({
    id: "client-gsphc-id",
    name: "GSPHC",
    abbreviation: "GSPHC",
  } as any);

  vi.spyOn(prisma.staff, "findFirst").mockResolvedValue({
    id: "staff-amit-id",
    name: "Amit Desai",
    employeeCode: "EMP001",
  } as any);

  // Dedup prefetch (select: serialNo/documentRefNo)
  (vi.spyOn(prisma.inOutRegister, "findMany") as any).mockImplementation(async () => store);

  (vi.spyOn(prisma.inOutRegister, "findFirst") as any).mockImplementation(async (args: any) => {
    const orList = args?.where?.OR || [args?.where];
    for (const clause of orList) {
      const target = clause?.serialNo?.equals || clause?.documentRefNo?.equals;
      if (target) {
        const found = store.find((r) => r.serialNo === target || r.documentRefNo === target);
        if (found) return found;
      }
    }
    return null;
  });

  (vi.spyOn(prisma, "$transaction") as any).mockImplementation(
    async (fn: any) => fn(txMock)
  );
}

const HEADER =
  "direction,documentDate,receivedDate,documentRefNo,details,client,department,actionSuggestedStaff,inwardType,receivedByPersonName";

const ROW_A =
  "INWARD,2026-10-01,2026-10-02,INW/TEST/2026/001,Site drawing approval,GSPHC,Engineering,Amit Desai,ACTION_REQUIRED,Ramesh";
const ROW_B =
  "INWARD,2026-10-03,2026-10-03,INW/TEST/2026/002,Bill verification letter,GSPHC,Accounts,Amit Desai,ACTION_REQUIRED,Suresh";
// Same documentRefNo as ROW_A — an intra-file duplicate
const ROW_A_DUP =
  "INWARD,2026-10-01,2026-10-02,INW/TEST/2026/001,Site drawing approval (duplicate line),GSPHC,Engineering,Amit Desai,ACTION_REQUIRED,Ramesh";

describe("In-Out Register import deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = [];
    mockPrisma();
  });

  it("skips intra-file duplicates sharing the same documentRefNo", async () => {
    const csv = [HEADER, ROW_A, ROW_A_DUP, ROW_B].join("\n");

    const res = await importModule({ module: "inOutRegister", format: "csv", data: csv });

    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.imported).toBe(2);
    expect(store).toHaveLength(2);
    expect(
      data.corrections.some((c: string) => c.includes("in-file duplicate") && c.startsWith("Row 2"))
    ).toBe(true);
    expect(new Set(store.map((r) => r.documentRefNo)).size).toBe(2);
  });

  it("is idempotent on re-upload: the same file imports zero new rows", async () => {
    const csv = [HEADER, ROW_A, ROW_B].join("\n");

    const first = await importModule({ module: "inOutRegister", format: "csv", data: csv });
    expect((first as any).data.imported).toBe(2);
    expect(store).toHaveLength(2);

    const second = await importModule({ module: "inOutRegister", format: "csv", data: csv });
    const data = (second as any).data;
    expect(data.imported).toBe(0);
    expect(store).toHaveLength(2);
    expect(
      data.corrections.filter((c: string) => c.includes("Skipped existing record")).length
    ).toBe(2);
  });

  it("matches an existing record via documentRefNo when the file supplies no serialNo", async () => {
    store = [
      {
        id: "existing-1",
        serialNo: "INW/2026-27/001",
        documentRefNo: "INW/TEST/2026/001",
        direction: "INWARD",
      },
    ];

    const csv = [HEADER, ROW_A, ROW_B].join("\n");
    const res = await importModule({ module: "inOutRegister", format: "csv", data: csv });

    const data = (res as any).data;
    expect(data.imported).toBe(1); // only ROW_B is new
    expect(store).toHaveLength(2);
    expect(
      data.corrections.some(
        (c: string) => c.startsWith("Row 1") && c.includes("Skipped existing record")
      )
    ).toBe(true);
  });
});
