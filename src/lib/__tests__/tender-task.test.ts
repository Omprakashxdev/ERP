import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tender: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    task: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    staff: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  audit: vi.fn().mockResolvedValue(undefined),
  sanitizeForAudit: vi.fn(async (v: any) => v),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;
const STAFF_ID = "cst000000000000000000001";
const TENDER_ID = "cten00000000000000000001";

function mockSession(role = "ADMIN") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

describe("Tender → Task linking (Phase 3A)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.task.findMany.mockResolvedValue([]);
    mockSession();
  });

  it("creates independent tasks for each dated event on one tender", async () => {
    const { createTenderLinkedTasks } = await import("../actions/task-linking");
    prismaMock.task.findFirst.mockResolvedValue(null); // no existing task
    prismaMock.task.create.mockResolvedValue({});

    await createTenderLinkedTasks({
      tenderId: TENDER_ID,
      tenderName: "Road Tender 12",
      biddingLastDate: new Date("2026-11-01"),
      dateOfOpening: new Date("2026-11-10"),
      emdReturnCollectionDate: new Date("2026-12-01"),
      concernAuthorityId: STAFF_ID,
    });

    // three distinct events → three creates, each with its own title
    expect(prismaMock.task.create).toHaveBeenCalledTimes(3);
    const titles = prismaMock.task.create.mock.calls.map(
      (c: any) => c[0].data.title
    );
    expect(titles[0]).toContain("EMD return collection");
    expect(titles[1]).toContain("Bidding last date");
    expect(titles[2]).toContain("Tender opening date");
    // all carry the tender link + the explicitly chosen person
    for (const call of prismaMock.task.create.mock.calls) {
      expect(call[0].data.sourceModule).toBe("TENDER");
      expect(call[0].data.sourceEntityId).toBe(TENDER_ID);
      expect(call[0].data.assignedToId).toBe(STAFF_ID);
    }
  });

  it("creates NOTHING when no responsible person is chosen — never invents an assignee", async () => {
    const { createTenderLinkedTasks } = await import("../actions/task-linking");
    await createTenderLinkedTasks({
      tenderId: TENDER_ID,
      tenderName: "Road Tender 12",
      biddingLastDate: new Date("2026-11-01"),
      dateOfOpening: new Date("2026-11-10"),
      concernAuthorityId: null,
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
    expect(prismaMock.staff.findFirst).not.toHaveBeenCalled();
  });

  it("reopening/re-saving a tender does not duplicate existing event tasks", async () => {
    const { createTenderLinkedTasks } = await import("../actions/task-linking");
    // bidding task already exists — unkeyed legacy row matching the
    // module+entity+title+assignee signature → adopted (keyed) not duplicated
    prismaMock.task.findFirst.mockResolvedValue(null); // no keyed task
    prismaMock.task.findMany.mockImplementation(async ({ where }: any) =>
      where.title?.startsWith("Bidding last date")
        ? [{ id: "t-existing" }]
        : []
    );

    await createTenderLinkedTasks({
      tenderId: TENDER_ID,
      tenderName: "Road Tender 12",
      biddingLastDate: new Date("2026-11-05"),
      dateOfOpening: new Date("2026-11-10"),
      concernAuthorityId: STAFF_ID,
    });

    // only the new opening-date task is created; the legacy bidding
    // task is adopted (keyed) — its deadline/progress are untouched
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-existing", sourceEventKey: null },
        data: { sourceEventKey: "bidding_last" },
      })
    );
    expect(prismaMock.task.create.mock.calls[0][0].data.title).toContain(
      "Tender opening date"
    );
  });

  it("tender delete is blocked while linked tasks exist — tasks preserved", async () => {
    const { deleteTender } = await import("../actions/tender");
    prismaMock.task.count.mockResolvedValue(2);
    const res = await deleteTender(TENDER_ID);
    expect(res.success).toBe(false);
    expect(res.error).toContain("follow-up task");
    expect(prismaMock.tender.delete).not.toHaveBeenCalled();
  });

  it("tender delete proceeds when no linked tasks exist", async () => {
    const { deleteTender } = await import("../actions/tender");
    prismaMock.task.count.mockResolvedValue(0);
    prismaMock.tender.delete.mockResolvedValue({ id: TENDER_ID });
    const res = await deleteTender(TENDER_ID);
    expect(res.success).toBe(true);
  });

  it("unauthorized user cannot create a tender (tasks never touched)", async () => {
    vi.mocked(withPermission).mockImplementation(async () => ({
      success: false,
      error: "Forbidden",
    }));
    const { createTender } = await import("../actions/tender");
    const res = await createTender({ name: "X" } as any);
    expect(res.success).toBe(false);
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });
});
