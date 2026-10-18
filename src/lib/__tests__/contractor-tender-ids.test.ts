import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tender: { findMany: vi.fn() },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;

function mockSession(role = "STAFF") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

describe("getTenderIdSuggestions (Phase 3B)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession();
  });

  it("returns only real tender IDs — no nulls, no fabrication", async () => {
    const { getTenderIdSuggestions } = await import("../actions/contractor");
    prismaMock.tender.findMany.mockResolvedValue([
      { tenderId: "GSPH/2026/001", name: "Road Tender 12" },
      { tenderId: null, name: "No-id tender" },
    ]);
    const res = await getTenderIdSuggestions();
    expect(res.success).toBe(true);
    expect(res.data).toEqual([
      { tenderId: "GSPH/2026/001", name: "Road Tender 12" },
    ]);
    // query restricted to records with an advertisement ID
    expect(prismaMock.tender.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenderId: { not: null } } })
    );
  });

  it("denied permission returns failure with no data", async () => {
    vi.mocked(withPermission).mockImplementation(async () => ({
      success: false,
      error: "Forbidden",
    }));
    const { getTenderIdSuggestions } = await import("../actions/contractor");
    const res = await getTenderIdSuggestions();
    expect(res.success).toBe(false);
    expect(prismaMock.tender.findMany).not.toHaveBeenCalled();
  });
});
