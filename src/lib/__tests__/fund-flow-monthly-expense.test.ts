import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getMonthlyExpenses,
  upsertMonthlyExpense,
} from "../actions/fund-flow-monthly";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

// Mock audit log entries storage — filters by the where clause the action uses
let mockAuditLogEntries: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fundFlowMonthlyExpense: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v) => v),
}));

function mockWithPermission() {
  vi.mocked(withPermission).mockImplementation(async (_resource, _action, fn) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

function mockWithoutPermission() {
  vi.mocked(withPermission).mockImplementation(async () => ({
    success: false,
    error: "Unauthorized",
  }));
}

function rec(id: string, month: number, year: number, amount: string, updatedAt = "2026-05-01T00:00:00.000Z") {
  return {
    id,
    month,
    year,
    amount: new Decimal(amount),
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date(updatedAt),
  };
}

function provenanceFor(id: string, source = "ff-01m-workbook-expense") {
  return { entityId: id, action: "create", metadata: { source } };
}

describe("Worksheet-level monthly expenses (FF-01M, Excel Row 14)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWithPermission();
    mockAuditLogEntries = [];
    vi.mocked(prisma.auditLog.findMany).mockImplementation(((args: any) => {
      const where = args?.where;
      if (!where) return Promise.resolve([]);
      const entityIds = where.entityId?.in;
      if (!entityIds || !Array.isArray(entityIds)) return Promise.resolve([]);
      const filtered = mockAuditLogEntries.filter((e) => {
        if (!entityIds.includes(e.entityId)) return false;
        if (where.action && e.action !== where.action) return false;
        if (
          where.metadata?.path?.[0] === "source" &&
          e.metadata?.source !== where.metadata?.equals
        )
          return false;
        return true;
      });
      return Promise.resolve(filtered);
    }) as any);
  });

  describe("getMonthlyExpenses", () => {
    it("covers exactly 24 months Apr 2026 – Mar 2028 in order (T88)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([] as any);
      const result = await getMonthlyExpenses();
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.expenses).toHaveLength(24);
      expect(data.expenses[0]).toMatchObject({ month: 4, year: 2026 });
      expect(data.expenses[2]).toMatchObject({ month: 6, year: 2026 });
      expect(data.expenses[23]).toMatchObject({ month: 3, year: 2028 });
    });

    it("maps stored amounts to correct month slots (T89)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
        rec("e1", 4, 2026, "30.61"),
        rec("e2", 7, 2026, "15.56"),
      ] as any);
      mockAuditLogEntries = [provenanceFor("e1"), provenanceFor("e2")];
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.expenses[0].amount.toString()).toBe("30.61");
      expect(data.expenses[3].amount.toString()).toBe("15.56");
      expect(data.expenses[1].amount).toBeNull();
    });

    it("distinguishes missing month (null) from explicitly entered zero (T90)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
        rec("e1", 4, 2026, "0.00"),
      ] as any);
      mockAuditLogEntries = [provenanceFor("e1")];
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.expenses[0].amount).not.toBeNull();
      expect(data.expenses[0].amount.toFixed(2)).toBe("0.00");
      expect(data.expenses[1].amount).toBeNull();
      expect(data.expenses[0].unavailable).not.toBe(true);
    });

    it("sums only entered values for the AU14-equivalent total (T91)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
        rec("e1", 4, 2026, "30.61"),
        rec("e2", 5, 2026, "30.36"),
        rec("e3", 6, 2026, "0.00"),
      ] as any);
      mockAuditLogEntries = [provenanceFor("e1"), provenanceFor("e2"), provenanceFor("e3")];
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.total.toString()).toBe("60.97");
    });

    it("returns null total when no months are entered", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([] as any);
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.total).toBeNull();
    });

    it("preserves Decimal(19,2) precision for large amounts (T92)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
        rec("e1", 4, 2026, "99999999999999999.99"),
      ] as any);
      mockAuditLogEntries = [provenanceFor("e1")];
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.expenses[0].amount.toString()).toBe("99999999999999999.99");
      expect(data.total.toString()).toBe("99999999999999999.99");
    });

    it("marks records without ff-01m provenance as unavailable and excludes from total (T93)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findMany).mockResolvedValueOnce([
        rec("e1", 4, 2026, "10.00"),
        rec("e-amb", 5, 2026, "999.00"),
        rec("e-amb2", 6, 2026, "999.00"),
      ] as any);
      // e1 has valid provenance; e-amb has a different source; e-amb2 only an update audit
      mockAuditLogEntries = [
        provenanceFor("e1"),
        provenanceFor("e-amb", "some-other-source"),
        { entityId: "e-amb2", action: "update", metadata: { source: "ff-01m-workbook-expense" } },
      ];
      const result = await getMonthlyExpenses();
      const data = result.data as any;
      expect(data.expenses[0].amount.toFixed(2)).toBe("10.00");
      expect(data.expenses[1].unavailable).toBe(true);
      expect(data.expenses[1].amount).toBeNull();
      expect(data.expenses[2].unavailable).toBe(true);
      expect(data.total.toFixed(2)).toBe("10.00");
    });

    it("requires fundFlow read permission (T94)", async () => {
      mockWithoutPermission();
      const result = await getMonthlyExpenses();
      expect(result.success).toBe(false);
    });
  });

  describe("upsertMonthlyExpense", () => {
    it("creates a new record and audits with ff-01m source (T95)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.fundFlowMonthlyExpense.create).mockResolvedValueOnce({ id: "new-1" } as any);
      const { audit } = await import("../actions/wrapper");
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "30.61" });
      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthlyExpense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ month: 4, year: 2026, amount: expect.any(Decimal) }),
        })
      );
      const createCall = vi.mocked(prisma.fundFlowMonthlyExpense.create).mock.calls[0][0] as any;
      expect(createCall.data.amount.toString()).toBe("30.61");
      expect(vi.mocked(audit)).toHaveBeenCalledWith(
        "user-1", "create", "FundFlowMonthlyExpense", "new-1",
        expect.objectContaining({ source: "ff-01m-workbook-expense" })
      );
    });

    it("rejects out-of-window writes (e.g., Apr 2028 beyond AS) (T96)", async () => {
      const result = await upsertMonthlyExpense({ month: 4, year: 2028, amount: "10" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("outside the supported 24-month");
      expect(prisma.fundFlowMonthlyExpense.create).not.toHaveBeenCalled();
    });

    it("blank input on existing record is a no-op — no update, no delete (T97)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(
        rec("e1", 4, 2026, "30.61") as any
      );
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "  " });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "e1" });
      expect(prisma.fundFlowMonthlyExpense.updateMany).not.toHaveBeenCalled();
      expect(prisma.fundFlowMonthlyExpense.create).not.toHaveBeenCalled();
    });

    it("blank input on empty month creates nothing (T98)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(null);
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: null });
      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthlyExpense.create).not.toHaveBeenCalled();
      expect(prisma.fundFlowMonthlyExpense.updateMany).not.toHaveBeenCalled();
    });

    it("updates existing record when expectedUpdatedAt matches (T99)", async () => {
      const existing = rec("e1", 4, 2026, "30.61");
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(existing as any);
      mockAuditLogEntries = [provenanceFor("e1")];
      vi.mocked(prisma.fundFlowMonthlyExpense.updateMany).mockResolvedValueOnce({ count: 1 } as any);
      const { audit } = await import("../actions/wrapper");
      const result = await upsertMonthlyExpense({
        month: 4, year: 2026, amount: "31.00",
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      });
      expect(result.success).toBe(true);
      expect(prisma.fundFlowMonthlyExpense.updateMany).toHaveBeenCalledWith({
        where: { id: "e1", updatedAt: existing.updatedAt },
        data: { amount: expect.any(Decimal) },
      });
      expect(vi.mocked(audit)).toHaveBeenCalledWith(
        "user-1", "update", "FundFlowMonthlyExpense", "e1",
        expect.objectContaining({ source: "ff-01m-workbook-expense" })
      );
    });

    it("rejects update when expectedUpdatedAt is stale (concurrent modification) (T100)", async () => {
      const existing = rec("e1", 4, 2026, "30.61");
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(existing as any);
      mockAuditLogEntries = [provenanceFor("e1")];
      vi.mocked(prisma.fundFlowMonthlyExpense.updateMany).mockResolvedValueOnce({ count: 0 } as any);
      const result = await upsertMonthlyExpense({
        month: 4, year: 2026, amount: "31.00",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z", // stale token
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Concurrent update");
    });

    it("rejects update without expectedUpdatedAt on existing record (T101)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(
        rec("e1", 4, 2026, "30.61") as any
      );
      mockAuditLogEntries = [provenanceFor("e1")];
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "31.00" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Concurrent update");
      expect(prisma.fundFlowMonthlyExpense.updateMany).not.toHaveBeenCalled();
    });

    it("rejects updates to records without ff-01m create provenance (T102)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(
        rec("e1", 4, 2026, "30.61") as any
      );
      mockAuditLogEntries = [provenanceFor("e1", "some-other-source")];
      const result = await upsertMonthlyExpense({
        month: 4, year: 2026, amount: "31.00",
        expectedUpdatedAt: "2026-05-01T00:00:00.000Z",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("audit provenance missing");
      expect(prisma.fundFlowMonthlyExpense.updateMany).not.toHaveBeenCalled();
    });

    it("maps create unique-violation to a concurrency error (T104)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(null);
      const err = new Error("Unique constraint failed");
      (err as any).code = "P2002";
      vi.mocked(prisma.fundFlowMonthlyExpense.create).mockRejectedValueOnce(err);
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "30.61" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Concurrent update");
    });

    it("rejects invalid monetary amounts (T105)", async () => {
      vi.mocked(prisma.fundFlowMonthlyExpense.findUnique).mockResolvedValueOnce(null);
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "not-a-number" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid monetary amount");
    });

    it("requires fundFlow update permission (T103)", async () => {
      mockWithoutPermission();
      const result = await upsertMonthlyExpense({ month: 4, year: 2026, amount: "10" });
      expect(result.success).toBe(false);
      expect(prisma.fundFlowMonthlyExpense.findUnique).not.toHaveBeenCalled();
    });
  });
});
