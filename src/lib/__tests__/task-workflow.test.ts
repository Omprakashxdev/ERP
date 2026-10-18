import { describe, it, expect, vi, beforeEach } from "vitest";
import { performTaskTransition } from "../actions/task-management";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn() },
    staff: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    notification: { create: vi.fn() },
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

// Task ids must satisfy the cuid validator
const TASK_ID = "c1t2a3s4k5i6d7h8j9k0l1m2";
const STAFF_ASSIGNEE = "cst000000000000000000001"; // assignee staff id
const STAFF_REVIEWER = "cst000000000000000000002";
const STAFF_OTHER = "cst000000000000000000003";

const baseTask = {
  id: TASK_ID,
  title: "Check GST filing",
  status: "OPEN",
  assignedToId: STAFF_ASSIGNEE,
  assignedById: "user-mgr",
  reviewerId: STAFF_REVIEWER,
  percentageCompletion: 40,
  activityLog: "[2026-10-01 09:00] Manager: created",
  reworkCount: 0,
};

/** Wire the actor's staff identity: session user → user.email → staff. */
function mockActor(email: string, staffId: string | null, staffName = "Emp") {
  prismaMock.user.findUnique.mockResolvedValue({ email });
  prismaMock.staff.findFirst.mockImplementation(async ({ where }: any) => {
    if (where.email) {
      return staffId ? { id: staffId, name: staffName } : null;
    }
    // notifyStaff lookup by staff id → return email for user resolution
    if (where.id === STAFF_REVIEWER) return { email: "rev@saec.com" };
    if (where.id === STAFF_ASSIGNEE) return { email: "emp@saec.com" };
    return null;
  });
  prismaMock.user.findFirst.mockImplementation(async () => ({ id: "u-notify" }));
}

function mockSession(role: string) {
  vi.mocked(withPermission).mockImplementation(async (_r: any, _a: any, fn: any) => {
    try {
      return {
        success: true,
        data: await fn({ id: "user-1", role, email: "emp@saec.com" }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Action failed",
      };
    }
  });
}

describe("Task workflow transitions (Phase 2C)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession("STAFF");
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask });
    prismaMock.task.update.mockImplementation(async ({ data }: any) => ({ ...baseTask, ...data }));
    mockActor("emp@saec.com", STAFF_ASSIGNEE, "Foram Shah");
  });

  it("assignee accepts an open task → IN_PROGRESS with activity log entry", async () => {
    const res = await performTaskTransition({ id: TASK_ID, action: "accept" });
    expect(res.success).toBe(true);
    const upd = prismaMock.task.update.mock.calls[0][0].data;
    expect(upd.status).toBe("IN_PROGRESS");
    expect(upd.activityLog).toContain("created"); // history preserved
    expect(upd.activityLog).toContain("Foram Shah: Accepted the task");
  });

  it("non-assignee staff cannot accept someone else's task", async () => {
    mockActor("other@saec.com", STAFF_OTHER, "Neha Mehta");
    const res = await performTaskTransition({ id: TASK_ID, action: "accept" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("assigned employee");
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("assignee updates progress — percentage and note appended, history kept", async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "IN_PROGRESS" });
    const res = await performTaskTransition({
      id: TASK_ID,
      action: "updateProgress",
      percentageCompletion: 75,
      note: "half the filing done",
    });
    expect(res.success).toBe(true);
    const upd = prismaMock.task.update.mock.calls[0][0].data;
    expect(upd.percentageCompletion).toBe(75);
    expect(upd.status).toBeUndefined(); // progress never resets status
    expect(upd.activityLog).toContain("75% — half the filing done");
  });

  it("assignee submits for review → PENDING_REVIEW + reviewer notified", async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "IN_PROGRESS" });
    const res = await performTaskTransition({ id: TASK_ID, action: "submitForReview" });
    expect(res.success).toBe(true);
    expect(prismaMock.task.update.mock.calls[0][0].data.status).toBe("PENDING_REVIEW");
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    const note = prismaMock.notification.create.mock.calls[0][0].data;
    expect(note.userId).toBe("u-notify");
    expect(note.title).toContain("review");
  });

  it("reviewer approves → COMPLETED, completedAt set, progress → 100", async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "PENDING_REVIEW" });
    mockActor("rev@saec.com", STAFF_REVIEWER, "Jitendra Patel");
    const res = await performTaskTransition({ id: TASK_ID, action: "approve" });
    expect(res.success).toBe(true);
    const upd = prismaMock.task.update.mock.calls[0][0].data;
    expect(upd.status).toBe("COMPLETED");
    expect(upd.completedAt).toBeInstanceOf(Date);
    expect(upd.percentageCompletion).toBe(100);
  });

  it("manager who is neither reviewer nor admin cannot approve", async () => {
    mockSession("MANAGER");
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "PENDING_REVIEW" });
    mockActor("mgr@saec.com", STAFF_OTHER, "Rakesh Joshi");
    const res = await performTaskTransition({ id: TASK_ID, action: "approve" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("reviewer");
  });

  it("self-approval is blocked for a manager who is also the assignee", async () => {
    mockSession("MANAGER");
    prismaMock.task.findUnique.mockResolvedValue({
      ...baseTask,
      status: "PENDING_REVIEW",
      reviewerId: STAFF_ASSIGNEE, // reviewer = assignee = current staff
    });
    // actor staffId == STAFF_ASSIGNEE → isAssignee AND isReviewer
    const res = await performTaskTransition({ id: TASK_ID, action: "approve" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("own work");
  });

  it("admin may approve even when the task was assigned to them", async () => {
    mockSession("ADMIN");
    prismaMock.task.findUnique.mockResolvedValue({
      ...baseTask,
      status: "PENDING_REVIEW",
      reviewerId: STAFF_ASSIGNEE,
    });
    const res = await performTaskTransition({ id: TASK_ID, action: "approve" });
    expect(res.success).toBe(true);
  });

  it("requestRework requires a reason and returns the task to IN_PROGRESS", async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "PENDING_REVIEW" });
    mockActor("rev@saec.com", STAFF_REVIEWER, "Jitendra Patel");
    const noReason = await performTaskTransition({ id: TASK_ID, action: "requestRework" });
    expect(noReason.success).toBe(false);
    expect(noReason.error).toContain("reason");
    const res = await performTaskTransition({
      id: TASK_ID,
      action: "requestRework",
      reworkReason: "figures missing",
    });
    expect(res.success).toBe(true);
    const upd = prismaMock.task.update.mock.calls[0][0].data;
    expect(upd.status).toBe("IN_PROGRESS");
    expect(upd.reworkReason).toBe("figures missing");
    expect(upd.reworkCount).toBe(1);
    // progress is NOT reset
    expect(upd.percentageCompletion).toBeUndefined();
    // assignee notified
    expect(prismaMock.notification.create).toHaveBeenCalled();
  });

  it("completed tasks accept no further transitions", async () => {
    prismaMock.task.findUnique.mockResolvedValue({ ...baseTask, status: "COMPLETED" });
    const res = await performTaskTransition({ id: TASK_ID, action: "accept" });
    expect(res.success).toBe(false);
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("denied permission returns failure without touching the task", async () => {
    vi.mocked(withPermission).mockImplementation(async () => ({
      success: false,
      error: "Forbidden",
    }));
    const res = await performTaskTransition({ id: TASK_ID, action: "accept" });
    expect(res.success).toBe(false);
    expect(prismaMock.task.findUnique).not.toHaveBeenCalled();
  });
});
