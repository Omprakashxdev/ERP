import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReport } from "../reports";
import { prisma } from "../prisma";

vi.mock("../prisma", () => ({
  prisma: {
    inOutRegister: {
      findMany: vi.fn(),
    },
  },
}));

describe("In-Out Register Reports with Filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("General Inward-Outward Register (inout-general)", () => {
    it("runs with no filters and returns correct columns", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "1",
          direction: "INWARD",
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "IN-001",
          details: "Site layout",
          clientId: "client-1",
          department: "Planning",
          replyDueDate: null,
          client: { name: "Client A" },
          actionSuggestedStaff: { name: "John Doe" },
        } as any,
      ]);

      const result = await runReport("inout-general");
      expect(result.columns).toEqual([
        "Direction",
        "Doc Date",
        "Received/Sent Date",
        "Doc Ref No",
        "Client",
        "Project",
        "Department",
        "Details",
        "Reply Due Date",
        "Action Staff",
        "Age (days)",
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Client"]).toBe("Client A");
      expect(result.rows[0]["Department"]).toBe("Planning");
      expect(result.rows[0]["Action Staff"]).toBe("John Doe");
      expect(result.rows[0]["Reply Due Date"]).toBe("—");
      expect(typeof result.rows[0]["Age (days)"]).toBe("number");
    });

    it("applies client, staff, date, and age filters correctly", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([]);

      await runReport("inout-general", {
        clientId: "client-123",
        staffId: "staff-456",
        dateFrom: new Date("2026-01-01"),
        dateTo: new Date("2026-01-31"),
        ageDue: "20",
      });

      expect(prisma.inOutRegister.findMany).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(prisma.inOutRegister.findMany).mock.calls[0][0];
      expect(callArg?.where?.clientId).toBe("client-123");
      expect(callArg?.where?.actionSuggestedStaffId).toBe("staff-456");
      expect(callArg?.where?.receivedDate).toBeDefined();
      expect((callArg?.where?.receivedDate as any).gte).toEqual(new Date("2026-01-01"));
      expect((callArg?.where?.receivedDate as any).lte).toBeInstanceOf(Date);
    });
  });

  describe("Pending for Reply Report (inout-pending-reply)", () => {
    it("queries only INWARD records with replyDueDate and filters by department", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "2",
          direction: "INWARD",
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "IN-002",
          details: "Urgent NOC",
          clientId: "client-2",
          department: "Rajkot Division",
          replyDueDate: new Date("2026-03-10"),
          client: { name: "Client B" },
          actionSuggestedStaff: { name: "Jane Smith" },
        } as any,
      ]);

      const result = await runReport("inout-pending-reply", {
        department: "Rajkot",
        ageDue: "15",
      });

      expect(prisma.inOutRegister.findMany).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(prisma.inOutRegister.findMany).mock.calls[0][0];
      expect(callArg?.where?.direction).toBe("INWARD");
      expect(callArg?.where?.replyDueDate).toEqual({ not: null });
      expect(callArg?.where?.department).toEqual({
        contains: "Rajkot",
        mode: "insensitive",
      });

      expect(result.columns).toEqual([
        "Received Date",
        "Doc Ref No",
        "Client",
        "Project",
        "Department",
        "Details",
        "Reply Due Date",
        "Due Status",
        "Action Staff",
        "Age (days)",
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Client"]).toBe("Client B");
      expect(result.rows[0]["Department"]).toBe("Rajkot Division");
      expect(result.rows[0]["Action Staff"]).toBe("Jane Smith");
    });
  });

  describe("Outward Register Report (inout-outward)", () => {
    it("queries only OUTWARD records and returns correct outward columns", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "3",
          direction: "OUTWARD",
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "OUT-001",
          details: "Work order dispatch",
          clientId: "client-3",
          department: "Vadodara Division",
          client: { name: "Client C" },
          actionSuggestedStaff: { name: "Mark Taylor" },
        } as any,
      ]);

      const result = await runReport("inout-outward", {
        department: "Vadodara",
        clientId: "client-3",
        ageDue: "25",
      });

      expect(prisma.inOutRegister.findMany).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(prisma.inOutRegister.findMany).mock.calls[0][0];
      expect(callArg?.where?.direction).toBe("OUTWARD");
      expect(callArg?.where?.clientId).toBe("client-3");
      expect(callArg?.where?.department).toEqual({
        contains: "Vadodara",
        mode: "insensitive",
      });

      expect(result.columns).toEqual([
        "Doc Date",
        "Dispatched Date",
        "Outward Ref No",
        "Client",
        "Project",
        "Department",
        "Details",
        "Action Staff",
        "Age (days)",
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Client"]).toBe("Client C");
      expect(result.rows[0]["Outward Ref No"]).toBe("OUT-001");
      expect(result.rows[0]["Department"]).toBe("Vadodara Division");
      expect(result.rows[0]["Action Staff"]).toBe("Mark Taylor");
      expect(typeof result.rows[0]["Age (days)"]).toBe("number");
    });
  });
});
