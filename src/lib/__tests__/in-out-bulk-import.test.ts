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

// FY of "now" for expectations (issuance uses server clock, IST)
function currentFy(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const fyStart =
    now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

describe("In-Out Register Bulk Import with Linked Inward/Outward", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Route $transaction(cb) through the mocked prisma as the tx handle,
    // and stub the raw issuance queries (real behavior covered by the
    // integration suite on a disposable DB).
    (vi.spyOn(prisma, "$transaction") as any).mockImplementation(
      async (fn: any) => fn(prisma)
    );
    // $queryRaw returns the post-increment counter value (issuance)
    (vi.spyOn(prisma, "$queryRaw") as any).mockResolvedValue([
      { lastSeq: 6 },
    ]);
    (vi.spyOn(prisma, "$executeRaw") as any).mockResolvedValue(1);
  });

  it("imports inward records and automatically links outward replies via parentInwardRefNo", async () => {
    const csvData = [
      "direction,documentDate,receivedDate,documentRefNo,details,client,department,actionSuggestedStaff,inwardType,receivedByPersonName,replyDueDate,parentInwardRefNo",
      "INWARD,2026-10-01,2026-10-02,INW/TEST/2026/001,Site drawing approval,GSPHC,Engineering,Amit Desai,ACTION_REQUIRED,Ramesh,2026-10-20,",
      "OUTWARD,2026-10-10,2026-10-10,OUT/TEST/2026/001,Dispatching vetted approval drawing,GSPHC,Engineering,,,,,INW/TEST/2026/001",
    ].join("\n");

    const createdRecords: any[] = [];

    // Mock prisma queries
    vi.spyOn(prisma.client, "findFirst").mockResolvedValue({ id: "client-gsphc-id", name: "GSPHC", abbreviation: "GSPHC" } as any);
    vi.spyOn(prisma.staff, "findFirst").mockResolvedValue({ id: "staff-amit-id", name: "Amit Desai", employeeCode: "EMP001" } as any);
    (vi.spyOn(prisma.inOutRegister, "findFirst") as any).mockImplementation(async (args: any) => {
      const orList = args?.where?.OR || [args?.where];
      for (const clause of orList) {
        const target = clause?.serialNo?.equals || clause?.documentRefNo?.equals;
        if (target) {
          const found = createdRecords.find(
            (r) => r.serialNo === target || r.documentRefNo === target
          );
          if (found) return found;
        }
      }
      return null;
    });

    (vi.spyOn(prisma.inOutRegister, "create") as any).mockImplementation(async (args: any) => {
      const rec = { id: `id-${createdRecords.length + 1}`, ...args.data };
      createdRecords.push(rec);
      return rec;
    });

    const res = await importModule({
      module: "inOutRegister",
      format: "csv",
      data: csvData,
    });

    expect(res.success).toBe(true);
    if (res.success && res.data) {
      expect(res.data.imported).toBe(2);
    }

    expect(createdRecords).toHaveLength(2);

    // Verify Inward record
    const inwardRec = createdRecords[0];
    expect(inwardRec.direction).toBe("INWARD");
    expect(inwardRec.documentRefNo).toBe("INW/TEST/2026/001");
    expect(inwardRec.clientId).toBe("client-gsphc-id");
    expect(inwardRec.actionSuggestedStaffId).toBe("staff-amit-id");
    expect(inwardRec.replyDueDate).toBeDefined();

    // Verify Outward reply record
    const outwardRec = createdRecords[1];
    expect(outwardRec.direction).toBe("OUTWARD");
    expect(outwardRec.documentRefNo).toBe("OUT/TEST/2026/001");
    expect(outwardRec.replyDueDate).toBeNull(); // Outward must not have reply deadline
    expect(outwardRec.actionSuggestedStaffId).toBeNull(); // Outward does not suggest action to self
    expect(outwardRec.parentInwardId).toBe("id-1"); // Successfully linked to parent inward record!
  });

  it("auto-generates standard sequential INW/YYYY-YY/XXX when documentRefNo is blank in CSV", async () => {
    const csvData = [
      "direction,documentDate,receivedDate,documentRefNo,details,client,department,actionSuggestedStaff,inwardType,receivedByPersonName,replyDueDate,parentInwardRefNo",
      "INWARD,2026-10-01,2026-10-02,,Blank ref no letter,GSPHC,Engineering,Amit Desai,ACTION_REQUIRED,Ramesh,2026-10-20,",
    ].join("\n");

    const createdRecords: any[] = [];

    vi.spyOn(prisma.client, "findFirst").mockResolvedValue({ id: "client-gsphc-id", name: "GSPHC", abbreviation: "GSPHC" } as any);
    vi.spyOn(prisma.staff, "findFirst").mockResolvedValue({ id: "staff-amit-id", name: "Amit Desai", employeeCode: "EMP001" } as any);
    (vi.spyOn(prisma.inOutRegister, "findMany") as any).mockResolvedValue([
      { documentRefNo: "INW/2026-27/005" },
    ]);
    (vi.spyOn(prisma.inOutRegister, "create") as any).mockImplementation(async (args: any) => {
      const rec = { id: `id-${createdRecords.length + 1}`, ...args.data };
      createdRecords.push(rec);
      return rec;
    });

    const res = await importModule({
      module: "inOutRegister",
      format: "csv",
      data: csvData,
    });

    expect(res.success).toBe(true);
    expect(createdRecords).toHaveLength(1);
    // Counter at 5 (mocked $queryRaw) → issued INW/<currentFY>/006
    expect(createdRecords[0].serialNo).toBe(`INW/${currentFy()}/006`);
  });

  it("auto-heals when parentInwardRefNo is placed in replyDueDate column on outward row", async () => {
    // 4 commas after department places INW/2026-27/001 into replyDueDate column
    const csvData = [
      "direction,documentDate,receivedDate,documentRefNo,details,client,department,actionSuggestedStaff,inwardType,receivedByPersonName,replyDueDate,parentInwardRefNo",
      "INWARD,2026-10-01,2026-10-02,INW/2026-27/001,Site drawing approval,GSPHC,Engineering,Amit Desai,ACTION_REQUIRED,Ramesh,2026-10-20,",
      "OUTWARD,2026-10-10,2026-10-10,OUT/2026-27/001,Dispatching vetted approval drawing,GSPHC,Engineering,,,,INW/2026-27/001",
    ].join("\n");

    const createdRecords: any[] = [];

    vi.spyOn(prisma.client, "findFirst").mockResolvedValue({ id: "client-gsphc-id", name: "GSPHC", abbreviation: "GSPHC" } as any);
    vi.spyOn(prisma.staff, "findFirst").mockResolvedValue({ id: "staff-amit-id", name: "Amit Desai", employeeCode: "EMP001" } as any);
    (vi.spyOn(prisma.inOutRegister, "findFirst") as any).mockImplementation(async (args: any) => {
      const orList = args?.where?.OR || [args?.where];
      for (const clause of orList) {
        const target = clause?.serialNo?.equals || clause?.documentRefNo?.equals;
        if (target) {
          const found = createdRecords.find(
            (r) => r.serialNo === target || r.documentRefNo === target
          );
          if (found) return found;
        }
      }
      return null;
    });

    (vi.spyOn(prisma.inOutRegister, "create") as any).mockImplementation(async (args: any) => {
      const rec = { id: `id-${createdRecords.length + 1}`, ...args.data };
      createdRecords.push(rec);
      return rec;
    });

    const res = await importModule({
      module: "inOutRegister",
      format: "csv",
      data: csvData,
    });

    expect(res.success).toBe(true);
    expect(createdRecords).toHaveLength(2);
    // Verified that it didn't crash on invalid date, and linked to parent inward record id-1!
    expect(createdRecords[1].parentInwardId).toBe("id-1");
    expect(createdRecords[1].replyDueDate).toBeNull();
  });
});
