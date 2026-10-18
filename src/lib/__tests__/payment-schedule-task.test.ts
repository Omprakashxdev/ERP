import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createPaymentSchedule,
  updatePaymentSchedule,
  deletePaymentSchedule,
} from "../actions/payment-schedule";
import {
  createPaymentScheduleLinkedTask,
} from "../actions/task-linking";
import { prisma } from "@/lib/prisma";
import { withPermission } from "../actions/wrapper";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentSchedule: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    task: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
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

describe("Payment schedule → follow-up task (Phase 2A)", () => {
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

  it("create: with follow-up task flag creates one linked task with schedule due date", async () => {
    prismaMock.paymentSchedule.create.mockResolvedValue({
      id: "sched1",
      paymentType: "GST return",
      category: "GST",
      detail: "Q3 filing",
      amount: new Decimal("5000"),
      dueDate: new Date("2026-11-15"),
    });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.task.create.mockImplementation(async ({ data }: any) => ({ id: "task1", ...data }));

    const res = await createPaymentSchedule({
      date: "2026-10-17",
      dueDate: "2026-11-15",
      paymentType: "GST return",
      category: "GST",
      detail: "Q3 filing",
      amount: "5000",
      createFollowUpTask: true,
      followUpAssigneeId: "staff-9",
    } as any);

    expect(res.success).toBe(true);
    expect(prismaMock.task.findFirst).toHaveBeenCalledWith({
      where: { sourceModule: "PAYMENT_SCHEDULE", sourceEntityId: "sched1" },
      select: { id: true },
    });
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
    const taskData = prismaMock.task.create.mock.calls[0][0].data;
    expect(taskData.sourceModule).toBe("PAYMENT_SCHEDULE");
    expect(taskData.sourceEntityId).toBe("sched1");
    expect(taskData.assignedToId).toBe("staff-9");
    expect(taskData.title).toContain("GST return");
    expect(taskData.description).toContain("5000");
    expect(new Date(taskData.dueDate)).toEqual(new Date("2026-11-15"));
    expect(taskData.projectId).toBeNull(); // no project inference
  });

  it("reopening / second save never creates a duplicate task", async () => {
    prismaMock.task.findFirst.mockResolvedValue({ id: "task1" });
    const id = await createPaymentScheduleLinkedTask({
      scheduleId: "sched1",
      category: "GST",
      dueDate: new Date("2026-11-15"),
      assignedToId: "staff-9",
    });
    expect(id).toBe("task1");
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("create without the flag creates no task", async () => {
    prismaMock.paymentSchedule.create.mockResolvedValue({ id: "sched1" });
    const res = await createPaymentSchedule({
      date: "2026-10-17",
      dueDate: "2026-11-15",
      category: "GST",
      amount: "100",
    } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("create with flag but no due date is rejected by validation", async () => {
    const res = await createPaymentSchedule({
      date: "2026-10-17",
      category: "GST",
      amount: "100",
      createFollowUpTask: true,
      followUpAssigneeId: "staff-9",
    } as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain("due date");
  });

  it("update: due-date change syncs ONLY the linked task's dueDate", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      dueDate: new Date("2026-11-15"),
    });
    prismaMock.paymentSchedule.update.mockResolvedValue({
      id: "sched1",
      dueDate: new Date("2026-11-20"),
    });
    // task deadline still matches the schedule's previous due date —
    // untouched by the employee → safe to sync
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task1",
      dueDate: new Date("2026-11-15"),
      status: "OPEN",
    });
    prismaMock.task.update.mockResolvedValue({ id: "task1" });

    const res = await updatePaymentSchedule({
      id: "c5s1d1g8e2f3h4i5j6k7l8m9",
      dueDate: "2026-11-20",
    } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task1" },
      data: { dueDate: new Date("2026-11-20") },
    });
    // no other task fields touched
    const upd = prismaMock.task.update.mock.calls[0][0].data;
    expect(Object.keys(upd)).toEqual(["dueDate"]);
  });

  it("update: never overwrites a deadline the employee changed manually", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      dueDate: new Date("2026-11-15"),
    });
    prismaMock.paymentSchedule.update.mockResolvedValue({
      id: "sched1",
      dueDate: new Date("2026-11-20"),
    });
    // employee moved the task deadline to 18th — differs from the
    // schedule's previous due date → must be preserved
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task1",
      dueDate: new Date("2026-11-18"),
      status: "IN_PROGRESS",
    });

    const res = await updatePaymentSchedule({
      id: "c5s1d1g8e2f3h4i5j6k7l8m9",
      dueDate: "2026-11-20",
    } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("update: never touches a completed/cancelled task", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      dueDate: new Date("2026-11-15"),
    });
    prismaMock.paymentSchedule.update.mockResolvedValue({
      id: "sched1",
      dueDate: new Date("2026-11-20"),
    });
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task1",
      dueDate: new Date("2026-11-15"),
      status: "COMPLETED",
    });

    const res = await updatePaymentSchedule({
      id: "c5s1d1g8e2f3h4i5j6k7l8m9",
      dueDate: "2026-11-20",
    } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("update: unchanged due date does not touch the task", async () => {
    prismaMock.paymentSchedule.findUnique.mockResolvedValue({
      dueDate: new Date("2026-11-15T00:00:00.000Z"),
    });
    prismaMock.paymentSchedule.update.mockResolvedValue({ id: "sched1" });
    const res = await updatePaymentSchedule({
      id: "c5s1d1g8e2f3h4i5j6k7l8m9",
      dueDate: "2026-11-15",
      remarks: "note",
    } as any);
    expect(res.success).toBe(true);
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("delete: blocked while a linked task exists — task and schedule preserved", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task1",
      title: "Payment due — GST",
      status: "IN_PROGRESS",
    });
    const res = await deletePaymentSchedule("c5s1d1g8e2f3h4i5j6k7l8m9");
    expect(res.success).toBe(false);
    expect(res.error).toContain("follow-up task");
    // neither the task nor the schedule was deleted
    expect(prismaMock.task.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.paymentSchedule.delete).not.toHaveBeenCalled();
  });

  it("delete: succeeds when no linked task exists", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.paymentSchedule.delete.mockResolvedValue({ id: "sched1" });
    const res = await deletePaymentSchedule("c5s1d1g8e2f3h4i5j6k7l8m9");
    expect(res.success).toBe(true);
    expect(prismaMock.paymentSchedule.delete).toHaveBeenCalledWith({
      where: { id: "c5s1d1g8e2f3h4i5j6k7l8m9" },
    });
  });

  it("authorization rejection surfaces as failure", async () => {
    vi.mocked(withPermission).mockImplementation(async () => ({
      success: false,
      error: "Forbidden",
    }));
    const res = await createPaymentSchedule({ category: "GST", amount: "1" } as any);
    expect(res.success).toBe(false);
    expect(prismaMock.paymentSchedule.create).not.toHaveBeenCalled();
  });
});
