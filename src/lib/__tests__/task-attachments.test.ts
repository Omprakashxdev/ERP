import { describe, it, expect, vi, beforeEach } from "vitest";
import { canAccessTask } from "../task-access";
import { withPermission } from "../actions/wrapper";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    taskAttachment: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    staff: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
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
const TASK_ID = "c1t2a3s4k5i6d7h8j9k0l1m2";
const STAFF_A = "cst000000000000000000001";
const STAFF_B = "cst000000000000000000002";

const task = {
  assignedToId: STAFF_A,
  assignedById: "user-manager",
  reviewerId: STAFF_B,
};

/** Link a session user to a staff record by email (or unlinked). */
function actorWith(email: string | null, staffId: string | null) {
  prismaMock.user.findUnique.mockResolvedValue(email ? { email } : null);
  prismaMock.staff.findFirst.mockResolvedValue(
    staffId ? { id: staffId } : null
  );
}

describe("canAccessTask — record-level authorization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("admin/manager can access any task's files", async () => {
    expect(await canAccessTask({ id: "u1", role: "ADMIN" }, task)).toBe(true);
    expect(await canAccessTask({ id: "u1", role: "MANAGER" }, task)).toBe(true);
  });

  it("the assignee (staff resolved via email) can access", async () => {
    actorWith("foram@saec.com", STAFF_A);
    expect(await canAccessTask({ id: "u1", role: "STAFF" }, task)).toBe(true);
  });

  it("the reviewer can access", async () => {
    actorWith("jit@saec.com", STAFF_B);
    expect(await canAccessTask({ id: "u1", role: "STAFF" }, task)).toBe(true);
  });

  it("the task assigner can access", async () => {
    actorWith("mgr@saec.com", null);
    expect(
      await canAccessTask({ id: "user-manager", role: "STAFF" }, task)
    ).toBe(true);
  });

  it("unrelated staff CANNOT access — module read alone is not enough", async () => {
    actorWith("neha@saec.com", "cst99999999999999999999x");
    expect(await canAccessTask({ id: "u1", role: "STAFF" }, task)).toBe(false);
  });

  it("fails closed when the user has no email/staff link", async () => {
    actorWith(null, null);
    expect(await canAccessTask({ id: "u1", role: "STAFF" }, task)).toBe(false);
    // user row exists but no staff record
    actorWith("orphan@saec.com", null);
    expect(await canAccessTask({ id: "u2", role: "STAFF" }, task)).toBe(false);
  });
});

describe("Task deletion with attachments (data protection)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
      try {
        return { success: true, data: await fn({ id: "user-1", role: "ADMIN" }) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Action failed" };
      }
    });
  });

  it("blocks deletion when attachments exist — records and files preserved", async () => {
    const { deleteTask } = await import("../actions/task-management");
    prismaMock.taskAttachment.count.mockResolvedValue(2);
    const res = await deleteTask(TASK_ID);
    expect(res.success).toBe(false);
    expect(res.error).toContain("attached file");
    expect(prismaMock.task.delete).not.toHaveBeenCalled();
  });

  it("allows deletion when no attachments exist", async () => {
    const { deleteTask } = await import("../actions/task-management");
    prismaMock.taskAttachment.count.mockResolvedValue(0);
    prismaMock.task.delete.mockResolvedValue({ id: TASK_ID });
    const res = await deleteTask(TASK_ID);
    expect(res.success).toBe(true);
    expect(prismaMock.task.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } });
  });
});

describe("Task startDate schema", () => {
  it("accepts and preserves startDate; existing tasks may omit it", async () => {
    const { taskCreateSchema, taskUpdateSchema } = await import(
      "../schemas/task-management"
    );
    const withStart = taskCreateSchema.parse({
      title: "x",
      assignedToId: TASK_ID,
      startDate: "2026-10-20",
      dueDate: "2026-10-30",
    });
    expect(withStart.startDate).toBeInstanceOf(Date);
    // no startDate → undefined/null, not an error
    const without = taskCreateSchema.parse({ title: "x", assignedToId: TASK_ID });
    expect(without.startDate).toBeUndefined();
    const upd = taskUpdateSchema.parse({ id: TASK_ID, startDate: null });
    expect(upd.startDate).toBeNull();
  });
});
