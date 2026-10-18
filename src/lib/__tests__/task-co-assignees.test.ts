import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    taskCoAssignee: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    staff: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("../actions/wrapper", () => ({
  withPermission: vi.fn(async (_m: string, _a: string, fn: any) => {
    const data = await fn({ id: "u1", role: "ADMIN", email: "a@x.com" });
    return { success: true, data };
  }),
  checkRateLimit: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
  sanitizeForAudit: vi.fn(async (x: any) => x),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const prismaMock = prisma as any;
const TASK_ID = "ctask00000000000000000001";
const STAFF_A = "csa0000000000000000000001";
const STAFF_B = "csb0000000000000000000001";
const STAFF_C = "csc0000000000000000000001";

describe("Task co-assignees (P4 multi-assignee)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.task.create.mockResolvedValue({ id: TASK_ID });
    prismaMock.task.update.mockResolvedValue({ id: TASK_ID });
    prismaMock.task.findUnique.mockResolvedValue({
      id: TASK_ID,
      status: "OPEN",
      assignedToId: STAFF_A,
    });
    prismaMock.taskCoAssignee.findMany.mockResolvedValue([]);
  });

  it("create stores co-assignees, skipping the primary assignee", async () => {
    const { createTask } = await import("../actions/task-management");
    await createTask({
      title: "T",
      assignedToId: STAFF_A,
      coAssigneeStaffIds: [STAFF_A, STAFF_B, STAFF_C],
    } as any);
    const data = prismaMock.task.create.mock.calls[0][0].data;
    expect(data.coAssignees.create.map((c: any) => c.staffId)).toEqual([
      STAFF_B,
      STAFF_C,
    ]);
  });

  it("update syncs the diff only — untouched when omitted", async () => {
    const { updateTask } = await import("../actions/task-management");
    prismaMock.task.findUnique.mockResolvedValue({
      id: TASK_ID,
      status: "OPEN",
      assignedToId: STAFF_A,
    });
    prismaMock.taskCoAssignee.findMany.mockResolvedValue([
      { staffId: STAFF_B },
    ]);
    await updateTask({ id: TASK_ID, coAssigneeStaffIds: [STAFF_C] } as any);
    expect(prismaMock.taskCoAssignee.deleteMany).toHaveBeenCalledWith({
      where: { taskId: TASK_ID, staffId: { in: [STAFF_B] } },
    });
    expect(prismaMock.taskCoAssignee.createMany).toHaveBeenCalledWith({
      data: [{ taskId: TASK_ID, staffId: STAFF_C }],
    });
  });

  it("update without coAssigneeStaffIds leaves rows untouched", async () => {
    const { updateTask } = await import("../actions/task-management");
    prismaMock.task.findUnique.mockResolvedValue({
      id: TASK_ID,
      status: "OPEN",
      assignedToId: STAFF_A,
    });
    await updateTask({ id: TASK_ID, title: "Renamed" } as any);
    expect(prismaMock.taskCoAssignee.findMany).not.toHaveBeenCalled();
  });
});
