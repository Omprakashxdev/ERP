import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildInOutRegisterWhere } from "@/lib/queries/in-out-register";
import { runReport } from "@/lib/reports";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inOutRegister: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("InOutRegister direction nullability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildInOutRegisterWhere", () => {
    it("filters by INWARD direction", () => {
      const where = buildInOutRegisterWhere({ direction: "INWARD" });
      expect(where.AND).toContainEqual({ direction: "INWARD" });
    });

    it("filters by OUTWARD direction", () => {
      const where = buildInOutRegisterWhere({ direction: "OUTWARD" });
      expect(where.AND).toContainEqual({ direction: "OUTWARD" });
    });

    it("filters by null direction (unclassified)", () => {
      const where = buildInOutRegisterWhere({ direction: "null" });
      expect(where.AND).toContainEqual({ direction: null });
    });

    it("does not include direction filter when not provided", () => {
      const where = buildInOutRegisterWhere({});
      expect(where.AND).toBeUndefined();
    });
  });

  describe("report direction labels", () => {
    it("labels INWARD as Inward", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "1",
          direction: "INWARD",
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "IN-001",
          details: "Test",
          clientId: "c1",
          department: "Planning",
          replyDueDate: null,
          client: { name: "Client A" },
          actionSuggestedStaff: { name: "John" },
        } as any,
      ]);

      const result = await runReport("inout-general");
      expect(result.rows[0].Direction).toBe("Inward");
    });

    it("labels OUTWARD as Outward", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "2",
          direction: "OUTWARD",
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "OUT-001",
          details: "Test",
          clientId: "c1",
          department: "Planning",
          replyDueDate: null,
          client: { name: "Client A" },
          actionSuggestedStaff: { name: "John" },
        } as any,
      ]);

      const result = await runReport("inout-general");
      expect(result.rows[0].Direction).toBe("Outward");
    });

    it("labels null direction as Unclassified", async () => {
      vi.mocked(prisma.inOutRegister.findMany).mockResolvedValueOnce([
        {
          id: "3",
          direction: null,
          documentDate: new Date("2026-03-01"),
          receivedDate: new Date("2026-03-02"),
          documentRefNo: "UN-001",
          details: "Test",
          clientId: "c1",
          department: "Planning",
          replyDueDate: null,
          client: { name: "Client A" },
          actionSuggestedStaff: { name: "John" },
        } as any,
      ]);

      const result = await runReport("inout-general");
      expect(result.rows[0].Direction).toBe("Unclassified");
    });
  });
});
