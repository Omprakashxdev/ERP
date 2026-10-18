import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inOutRegister: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    inOutRegisterDocument: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    inOutRegisterCcStaff: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    task: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
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
const REG_ID = "creg000000000000000000001";
const STAFF_A = "csta000000000000000000001";
const STAFF_B = "cstb000000000000000000001";
const CLIENT_ID = "cclt000000000000000000001";

function mockSession(role = "ADMIN") {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return { success: true, data: await fn({ id: "user-1", role }) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  });
}

const entry = {
  id: REG_ID,
  documentRefNo: "GMB/XEN/C/339",
  details: "Payment reminder letter",
  receivedDate: new Date("2026-10-01"),
  replyDueDate: new Date("2026-10-20"),
  actionSuggestedStaffId: STAFF_A,
  direction: "INWARD",
};

describe("In-Out Register → Task linkage (Phase 4B)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.task.findMany.mockResolvedValue([]);
    mockSession();
  });

  it("dedups by assignee — a task for a different staff is NOT a duplicate", async () => {
    const { createInOutRegisterLinkedTasks } = await import("../actions/task-linking");
    // An action task keyed for staff A already exists; same doc CC'd to
    // staff B must still create a distinct task for B (keyed identity).
    prismaMock.task.findFirst.mockImplementation(async ({ where }: any) =>
      where.sourceEventKey === `action:${STAFF_A}` ? { id: "t-old" } : null
    );
    prismaMock.task.create.mockResolvedValue({});

    await createInOutRegisterLinkedTasks({
      inOutRegisterId: REG_ID,
      documentRefNo: "GMB/XEN/C/339",
      details: "Payment reminder",
      replyDueDate: new Date("2026-10-20"),
      actionSuggestedStaffId: STAFF_A,
      ccStaffIds: [STAFF_B],
    });

    // Only the CC task for B is created — A's action task already exists
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.create.mock.calls[0][0].data.title).toContain("CC Notification");
    expect(prismaMock.task.create.mock.calls[0][0].data.assignedToId).toBe(STAFF_B);
  });

  it("task due date uses reply-due date, never an invented offset", async () => {
    const { createInOutRegisterLinkedTasks } = await import("../actions/task-linking");
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.task.create.mockResolvedValue({});

    await createInOutRegisterLinkedTasks({
      inOutRegisterId: REG_ID,
      documentRefNo: "GMB/XEN/C/339",
      replyDueDate: new Date("2026-10-20"),
      receivedDate: new Date("2026-10-01"),
      actionSuggestedStaffId: STAFF_A,
    });

    const call = prismaMock.task.create.mock.calls[0][0].data;
    expect(call.dueDate).toEqual(new Date("2026-10-20"));
  });

  it("entry delete is blocked while linked tasks exist", async () => {
    const { deleteInOutRegister } = await import("../actions/in-out-register");
    prismaMock.task.count.mockResolvedValue(1);
    const res = await deleteInOutRegister(REG_ID);
    expect(res.success).toBe(false);
    expect(res.error).toContain("follow-up task");
    expect(prismaMock.inOutRegister.delete).not.toHaveBeenCalled();
  });

  it("update keeps unchanged documents — only adds/removes diffs", async () => {
    const { updateInOutRegister } = await import("../actions/in-out-register");
    prismaMock.inOutRegister.findUnique.mockResolvedValue({
      ...entry,
      documents: [{ path: "/uploads/a.pdf" }, { path: "/uploads/b.pdf" }],
      ccStaff: [{ staffId: STAFF_A }],
    });
    prismaMock.inOutRegister.update.mockResolvedValue(entry);

    const res = await updateInOutRegister({
      id: REG_ID,
      documentRefNo: "GMB/XEN/C/339",
      documents: ["/uploads/a.pdf", "/uploads/c.pdf"], // keep a, remove b, add c
      ccStaffIds: [STAFF_A], // unchanged
    } as any);

    expect(res.success).toBe(true);
    // b.pdf removed, c.pdf added, a.pdf untouched
    expect(prismaMock.inOutRegisterDocument.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ path: { in: ["/uploads/b.pdf"] } }),
      })
    );
    expect(prismaMock.inOutRegisterDocument.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ inOutRegisterId: REG_ID, path: "/uploads/c.pdf" }] })
    );
    // unchanged CC staff — no deletes or creates
    expect(prismaMock.inOutRegisterCcStaff.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.inOutRegisterCcStaff.createMany).not.toHaveBeenCalled();
  });
});
