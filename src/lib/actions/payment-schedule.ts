"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  paymentScheduleCreateSchema,
  paymentScheduleUpdateSchema,
  paymentScheduleFilterSchema,
  PaymentScheduleCreateInput,
  PaymentScheduleUpdateInput,
  PaymentScheduleFilterInput,
} from "@/lib/schemas/payment-schedule";
import { buildPaymentScheduleWhere } from "@/lib/queries/payment-schedules";
import {
  createPaymentScheduleLinkedTask,
  syncPaymentScheduleTaskDueDate,
} from "./task-linking";

const PAYMENT_SCHEDULE_SOURCE = "PAYMENT_SCHEDULE";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

/** Calendar-day comparison: due today is NOT overdue — only dates
    strictly before today count. */
function computeIsOverdue(
  status: string,
  dueDate: Date | null
): boolean {
  if (status === "PAID" || status === "CANCELLED" || !dueDate) return false;
  const due = new Date(dueDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return due < startOfToday;
}

export async function createPaymentSchedule(
  input: PaymentScheduleCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "create", async (user) => {
    const parsed = paymentScheduleCreateSchema.parse(input);
    const { createFollowUpTask, followUpAssigneeId, ...data } = parsed;
    await checkRateLimit(user.id);

    const paymentSchedule = await prisma.paymentSchedule.create({
      data,
    });

    await audit(user.id, "create", "PaymentSchedule", paymentSchedule.id, {
      input: await sanitizeForAudit(data as Record<string, unknown>),
    });

    if (createFollowUpTask && parsed.dueDate && followUpAssigneeId) {
      const taskId = await createPaymentScheduleLinkedTask({
        scheduleId: paymentSchedule.id,
        paymentType: data.paymentType,
        category: data.category,
        detail: data.detail,
        amount: data.amount?.toString() ?? null,
        dueDate: parsed.dueDate,
        assignedToId: followUpAssigneeId,
        assignedById: user.id,
      });
      if (taskId) {
        await audit(user.id, "create", "Task", taskId, {
          source: "payment-schedule-follow-up",
          paymentScheduleId: paymentSchedule.id,
        });
        revalidatePath("/dashboard/tasks");
      }
    }

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function updatePaymentSchedule(
  input: PaymentScheduleUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "update", async (user) => {
    const parsed = paymentScheduleUpdateSchema.parse(input);
    const { id, createFollowUpTask, followUpAssigneeId, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.paymentSchedule.findUnique({
      where: { id },
      select: { dueDate: true },
    });

    const paymentSchedule = await prisma.paymentSchedule.update({
      where: { id },
      data,
    });

    await audit(user.id, "update", "PaymentSchedule", paymentSchedule.id, {
      input: await sanitizeForAudit(data as Record<string, unknown>),
    });

    if (createFollowUpTask && parsed.dueDate && followUpAssigneeId) {
      // Dedup inside — creates only when no linked task exists yet.
      const taskId = await createPaymentScheduleLinkedTask({
        scheduleId: paymentSchedule.id,
        paymentType: data.paymentType ?? paymentSchedule.paymentType,
        category: data.category ?? paymentSchedule.category,
        detail: data.detail ?? paymentSchedule.detail,
        amount:
          (data.amount ?? paymentSchedule.amount)?.toString() ?? null,
        dueDate: parsed.dueDate,
        assignedToId: followUpAssigneeId,
        assignedById: user.id,
      });
      if (taskId) {
        await audit(user.id, "create", "Task", taskId, {
          source: "payment-schedule-follow-up",
          paymentScheduleId: paymentSchedule.id,
        });
        revalidatePath("/dashboard/tasks");
      }
    }

    // Keep the linked task's due date in sync ONLY when safe: the
    // helper preserves deadlines an employee changed manually and never
    // touches completed/cancelled tasks.
    if (
      parsed.dueDate &&
      (!existing?.dueDate ||
        existing.dueDate.getTime() !== parsed.dueDate.getTime())
    ) {
      const { status, taskId } = await syncPaymentScheduleTaskDueDate(
        paymentSchedule.id,
        parsed.dueDate,
        existing?.dueDate ?? null
      );
      if (status === "synced") {
        await audit(user.id, "update", "Task", taskId!, {
          source: "payment-schedule-due-date-sync",
          paymentScheduleId: paymentSchedule.id,
          dueDate: parsed.dueDate.toISOString(),
        });
        revalidatePath("/dashboard/tasks");
      } else if (status === "kept-manual" || status === "closed") {
        // Provenance for the deliberate non-overwrite — no task field changed.
        await audit(user.id, "update", "Task", taskId!, {
          source: "payment-schedule-due-date-sync-skipped",
          reason:
            status === "kept-manual"
              ? "task due date was edited manually — employee's deadline preserved"
              : "task is completed/cancelled — not modified",
          paymentScheduleId: paymentSchedule.id,
        });
      }
    }

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function deletePaymentSchedule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("paymentSchedules", "delete", async (user) => {
    await checkRateLimit(user.id);

    // Never silently delete a linked follow-up task — its progress,
    // assignment and history are employee work. Block until the user
    // removes the task themselves in the Tasks module.
    const linkedTask = await prisma.task.findFirst({
      where: { sourceModule: PAYMENT_SCHEDULE_SOURCE, sourceEntityId: id },
      select: { id: true, title: true, status: true },
    });
    if (linkedTask) {
      throw new Error(
        `This payment schedule has a follow-up task ("${linkedTask.title}") ` +
          `in the To-Do list. Delete or cancel that task in Tasks first, ` +
          `then delete this schedule — the task's progress and history ` +
          `will otherwise be lost.`
      );
    }

    const paymentSchedule = await prisma.paymentSchedule.delete({
      where: { id },
    });

    await audit(user.id, "delete", "PaymentSchedule", paymentSchedule.id, {});

    revalidatePath("/dashboard/payment-schedules");
    return { id: paymentSchedule.id };
  });
}

export async function getPaymentSchedules(
  filter?: PaymentScheduleFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("paymentSchedules", "read", async () => {
    const parsed = filter
      ? paymentScheduleFilterSchema.parse(filter)
      : undefined;
    const where = buildPaymentScheduleWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.paymentSchedule.count({ where }),
    ]);

    const computedRows = rows.map((row) => ({
      ...row,
      isOverdue: computeIsOverdue(row.status, row.dueDate),
    }));

    return { rows: computedRows, total };
  });
}

export async function getPaymentScheduleById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("paymentSchedules", "read", async () => {
    const paymentSchedule = await prisma.paymentSchedule.findUnique({
      where: { id },
    });

    if (!paymentSchedule) return null;

    return {
      ...paymentSchedule,
      isOverdue: computeIsOverdue(
        paymentSchedule.status,
        paymentSchedule.dueDate
      ),
    };
  });
}

/** Returns the follow-up task linked to a payment schedule, if any. */
export async function getPaymentScheduleLinkedTask(
  scheduleId: string
): Promise<
  ActionResult<{
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    assigneeName: string;
  } | null>
> {
  return withPermission("paymentSchedules", "read", async () => {
    const parsedId = z.string().cuid().parse(scheduleId);
    const task = await prisma.task.findFirst({
      where: {
        sourceModule: PAYMENT_SCHEDULE_SOURCE,
        sourceEntityId: parsedId,
      },
      include: { assignedTo: { select: { name: true } } },
    });
    if (!task) return null;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      assigneeName: task.assignedTo.name,
    };
  });
}
