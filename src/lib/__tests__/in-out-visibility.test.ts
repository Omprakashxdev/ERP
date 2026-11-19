import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPerm = vi.fn(async (..._a: unknown[]) => false);
const mockStaffFindFirst = vi.fn(async (..._a: unknown[]) => null as unknown);
const mockRegisterFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
const mockRegisterFindFirst = vi.fn(async (..._a: unknown[]) => null as unknown);
const mockRegisterCount = vi.fn(async (..._a: unknown[]) => 0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: { findFirst: (...a: unknown[]) => mockStaffFindFirst(...a) },
    inOutRegister: {
      findMany: (...a: unknown[]) => mockRegisterFindMany(...a),
      findFirst: (...a: unknown[]) => mockRegisterFindFirst(...a),
      count: (...a: unknown[]) => mockRegisterCount(...a),
    },
  },
}));
vi.mock("@/lib/authz", () => ({
  hasPermissionWithOverrides: (...a: unknown[]) => mockPerm(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/wrapper", () => ({
  withPermission: vi.fn(
    async (_r: string, _a: string, fn: (u: unknown) => unknown) => {
      try {
        return { success: true, data: await fn(CURRENT_USER) };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }
  ),
  checkRateLimit: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
  sanitizeForAudit: vi.fn((x) => x),
}));

let CURRENT_USER: {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MANAGER" | "STAFF" | "AUDITOR";
} = { id: "u1", email: "a@b.c", name: "Admin", role: "ADMIN" };

const STAFF_USER = { id: "u2", email: "pc@saec.com", name: "Prakash Chudasama", role: "STAFF" as const };
const STAFF_ROW = { id: "s-prakash", name: "Prakash Chudasama", email: "pc@saec.com" };

describe("in-out visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CURRENT_USER = { id: "u1", email: "a@b.c", name: "Admin", role: "ADMIN" };
    mockStaffFindFirst.mockResolvedValue(null);
    mockPerm.mockResolvedValue(false);
  });

  it("ADMIN gets unrestricted where {}", async () => {
    const { buildInOutVisibilityWhere } = await import("@/lib/in-out-visibility");
    expect(await buildInOutVisibilityWhere(CURRENT_USER)).toEqual({});
    expect(mockStaffFindFirst).not.toHaveBeenCalled();
  });

  it("non-ADMIN with inOutRegister 'admin' override gets unrestricted", async () => {
    CURRENT_USER = { ...STAFF_USER, role: "MANAGER" };
    mockPerm.mockResolvedValue(true);
    const { buildInOutVisibilityWhere } = await import("@/lib/in-out-visibility");
    expect(await buildInOutVisibilityWhere(CURRENT_USER)).toEqual({});
    expect(mockPerm).toHaveBeenCalledWith("MANAGER", "inOutRegister", "admin", "u2");
  });

  it("staff-linked user sees only own/staff-tagged rows", async () => {
    CURRENT_USER = STAFF_USER;
    mockStaffFindFirst.mockResolvedValue(STAFF_ROW);
    const { buildInOutVisibilityWhere } = await import("@/lib/in-out-visibility");
    const where = await buildInOutVisibilityWhere(CURRENT_USER);
    expect(where).toEqual({
      OR: [
        { createdByUserId: "u2" },
        { receivedByStaffId: "s-prakash" },
        { actionSuggestedStaffId: "s-prakash" },
        { ccStaff: { some: { staffId: "s-prakash" } } },
        { receivedByPersonName: { equals: "Prakash Chudasama", mode: "insensitive" } },
      ],
    });
  });

  it("unmapped user sees only rows they created (fail-closed)", async () => {
    CURRENT_USER = { id: "u9", email: "ghost@x.com", name: "Ghost", role: "STAFF" };
    mockStaffFindFirst.mockResolvedValue(null);
    const { buildInOutVisibilityWhere } = await import("@/lib/in-out-visibility");
    const where = await buildInOutVisibilityWhere(CURRENT_USER);
    expect(where).toEqual({ OR: [{ createdByUserId: "u9" }] });
  });

  it("list query ANDs visibility into the filter where clause", async () => {
    CURRENT_USER = STAFF_USER;
    mockStaffFindFirst.mockResolvedValue(STAFF_ROW);
    const { getInOutRegisters } = await import("@/lib/actions/in-out-register");
    await getInOutRegisters();
    const call = mockRegisterFindMany.mock.calls[0][0] as { where: { AND: { OR: unknown[] }[] } };
    expect(call.where.AND).toHaveLength(1);
    expect(call.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { createdByUserId: "u2" },
        { receivedByStaffId: "s-prakash" },
        { actionSuggestedStaffId: "s-prakash" },
      ])
    );
  });

  it("list query passes an unmodified where for ADMIN", async () => {
    const { getInOutRegisters } = await import("@/lib/actions/in-out-register");
    await getInOutRegisters();
    const call = mockRegisterFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where).toEqual({});
  });

  it("getInOutRegisterById scopes the fetch for restricted users", async () => {
    CURRENT_USER = STAFF_USER;
    mockStaffFindFirst.mockResolvedValue(STAFF_ROW);
    const { getInOutRegisterById } = await import("@/lib/actions/in-out-register");
    await getInOutRegisterById("entry-1");
    const call = mockRegisterFindFirst.mock.calls[0][0] as { where: { AND: { OR?: unknown[] }[] } };
    expect(call.where.AND[0]).toEqual({ id: "entry-1" });
    expect(call.where.AND[1].OR).toEqual(
      expect.arrayContaining([{ createdByUserId: "u2" }])
    );
  });
});
