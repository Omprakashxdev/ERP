"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  withPermission,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskFilterSchema,
  TaskCreateInput,
  TaskUpdateInput,
  TaskFilterInput,
} from "@/lib/schemas/task-management";
import { buildTaskWhere } from "@/lib/queries/task-management";

export async function createTask(
  input: TaskCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("taskManagement", "create", async (user) => {
    const parsed = taskCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const task = await prisma.task.create({
      data: {
        ...parsed,
        assignedById: user.id,
        dueDate: parsed.dueDate ?? null,
        projectId: parsed.projectId ?? null,
      },
    });

    await audit(user.id, "create", "Task", task.id, {
      title: parsed.title,
      assignedToId: parsed.assignedToId,
    });

    revalidatePath("/dashboard/tasks");
    return { id: task.id };
  });
}

export async function updateTask(
  input: TaskUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("taskManagement", "update", async (user) => {
    const parsed = taskUpdateSchema.parse(input);
    const { id, ...data } = parsed as { id: string } & Record<string, unknown>;
    await checkRateLimit(user.id);

    if (data.status === "COMPLETED" && !data.completedAt) {
      data.completedAt = new Date();
    }

    if (data.reworkReason) {
      const existing = await prisma.task.findUnique({ where: { id } });
      data.reworkCount = (existing?.reworkCount ?? 0) + 1;
    }

    const task = await prisma.task.update({
      where: { id },
      data: data as never,
    });

    await audit(user.id, "update", "Task", task.id, {
      status: data.status,
    });

    revalidatePath("/dashboard/tasks");
    return { id: task.id };
  });
}

export async function deleteTask(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("taskManagement", "delete", async (user) => {
    await prisma.task.delete({ where: { id } });

    await audit(user.id, "delete", "Task", id, {});

    revalidatePath("/dashboard/tasks");
    return { id };
  });
}

export async function getTasks(
  filter?: TaskFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("taskManagement", "read", async () => {
    const parsed = filter ? taskFilterSchema.parse(filter) : undefined;
    const where = buildTaskWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, designation: true } },
          assignedBy: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return { rows, total };
  });
}

export async function getTaskById(
  id: string
): Promise<ActionResult<unknown>> {
  return withPermission("taskManagement", "read", async () => {
    return prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: true,
        assignedBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
  });
}
