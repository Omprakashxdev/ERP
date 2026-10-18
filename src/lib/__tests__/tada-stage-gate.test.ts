import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";
import { requireAuth } from "@/lib/authz";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tadaClaim: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    staff: { findFirst: vi.fn(), findUnique: vi.fn() },
    forwardRecord: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v: any) => v),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;
const CLAIM_ID = "cclm000000000000000000001";
const MANAGER_STAFF = "cmgr000000000000000000001";

function mockUser(role: string, email = "admin@saec.com") {
  vi.mocked(requireAuth).mockResolvedValue({ id: "user-1", role, email } as any);
}

const baseClaim = { staffId: "cemp000000000000000000001" };
const claimWithManager = (status: string, managerId: string | null = MANAGER_STAFF) => ({
  status,
  staff: { reportingManagerId: managerId },
});

describe("TADA approval stage gate (Phase 4E)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.tadaClaim.update.mockResolvedValue({ id: CLAIM_ID, status: "X" });
    mockUser("ADMIN");
  });

  it("blocks skipping stages — mark_paid on a SUBMITTED claim is refused", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager("SUBMITTED"));
    const res = await processTadaApproval({ id: CLAIM_ID, action: "mark_paid" } as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("each approval stage");
    expect(prismaMock.tadaClaim.update).not.toHaveBeenCalled();
  });

  it("blocks accounts_verify before manager approval", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager("SUBMITTED"));
    const res = await processTadaApproval({ id: CLAIM_ID, action: "accounts_verify" } as any);
    expect(res.success).toBe(false);
    expect(prismaMock.tadaClaim.update).not.toHaveBeenCalled();
  });

  it("full order works: submitted → manager → accounts → finance → paid", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    const stages: [string, string][] = [
      ["SUBMITTED", "manager_approve"],
      ["MANAGER_APPROVED", "accounts_verify"],
      ["ACCOUNTS_VERIFIED", "finance_approve"],
      ["FINANCE_APPROVED", "mark_paid"],
    ];
    for (const [status, action] of stages) {
      prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager(status));
      const res = await processTadaApproval({ id: CLAIM_ID, action, remarks: "ok" } as any);
      expect(res.success).toBe(true);
    }
  });

  it("MANAGER role can manager-approve; STAFF cannot", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager("SUBMITTED"));

    mockUser("MANAGER", "manager@saec.com");
    const ok = await processTadaApproval({ id: CLAIM_ID, action: "manager_approve" } as any);
    expect(ok.success).toBe(true);

    mockUser("STAFF", "foram@saec.com");
    prismaMock.staff.findFirst.mockResolvedValue({ id: "cother00000000000000000" });
    const denied = await processTadaApproval({ id: CLAIM_ID, action: "manager_approve" } as any);
    expect(denied.success).toBe(false);
    expect(denied.error).toContain("not authorized");
  });

  it("the claim's own reporting manager (staff link) can approve even as STAFF", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager("SUBMITTED"));
    mockUser("STAFF", "manager@saec.com");
    prismaMock.staff.findFirst.mockResolvedValue({ id: MANAGER_STAFF });
    const res = await processTadaApproval({ id: CLAIM_ID, action: "manager_approve" } as any);
    expect(res.success).toBe(true);
  });

  it("only ADMIN can mark_paid — not MANAGER", async () => {
    const { processTadaApproval } = await import("../actions/tada-bills");
    prismaMock.tadaClaim.findUnique.mockResolvedValue(claimWithManager("FINANCE_APPROVED"));
    mockUser("MANAGER");
    const res = await processTadaApproval({ id: CLAIM_ID, action: "mark_paid" } as any);
    expect(res.success).toBe(false);
  });

  it("editing a rejected claim resubmits it to the queue", async () => {
    const { updateTadaClaim } = await import("../actions/tada-bills");
    vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "failed" };
      }
    });
    prismaMock.tadaClaim.findUnique.mockResolvedValue({
      id: CLAIM_ID,
      status: "MANAGER_REJECTED",
      travelExpense: { toString: () => "100" },
      accommodationExp: { toString: () => "0" },
      foodExpense: { toString: () => "0" },
      localConveyance: { toString: () => "0" },
      otherExpense: { toString: () => "0" },
    });
    prismaMock.tadaClaim.update.mockResolvedValue({ id: CLAIM_ID });
    const res = await updateTadaClaim({ id: CLAIM_ID, location: "Updated" } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.tadaClaim.update.mock.calls[0][0].data.status).toBe("SUBMITTED");
  });
});
