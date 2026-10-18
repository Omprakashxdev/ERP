"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
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

    const { coAssigneeStaffIds, ...fields } = parsed;
    const task = await prisma.task.create({
      data: {
        ...fields,
        assignedById: user.id,
        dueDate: parsed.dueDate ?? null,
        projectId: parsed.projectId ?? null,
        coAssignees: coAssigneeStaffIds?.length
          ? {
              create: coAssigneeStaffIds
                .filter((id) => id !== parsed.assignedToId)
                .map((staffId) => ({ staffId })),
            }
          : undefined,
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

    // Status changes are governed by the Excel workflow — never applied
    // through a bare field update. Map the status pair to its transition
    // and enforce the same identity checks as performTaskTransition.
    if (data.status) {
      const existing = await prisma.task.findUnique({ where: { id } });
      if (existing && existing.status !== data.status) {
        const actor = await resolveActor(user);
        const action = transitionForStatusChange(
          existing.status,
          data.status as string
        );
        if (!action) {
          throw new Error(
            `Cannot move a task from ${existing.status} to ${String(data.status)}. Use the task actions instead.`
          );
        }
        const denial = actorAllowed(action, existing, actor, user.id);
        if (denial) throw new Error(denial);
        if (data.status === "COMPLETED" && !data.completedAt) {
          data.completedAt = new Date();
          if (existing.percentageCompletion < 100)
            data.percentageCompletion = 100;
        }
        if (action === "requestRework") {
          if (!data.reworkReason)
            throw new Error("A reason is required when sending a task back for changes.");
          data.reworkCount = existing.reworkCount + 1;
        }
      }
    }

    // Co-assignee sync — only the diff changes; rows untouched unless
    // the field is explicitly provided. Primary assignee is never
    // duplicated into co-assignees.
    const coIds = data.coAssigneeStaffIds as string[] | undefined;
    if (coIds !== undefined) {
      delete data.coAssigneeStaffIds;
      const current = await prisma.taskCoAssignee.findMany({
        where: { taskId: id },
        select: { staffId: true },
      });
      const cur = new Set(current.map((c) => c.staffId));
      const primaryId = data.assignedToId as string | undefined;
      const next = new Set(coIds.filter((sid) => sid !== primaryId));
      const toRemove = [...cur].filter((sid) => !next.has(sid));
      const toAdd = [...next].filter((sid) => !cur.has(sid));
      if (toRemove.length) {
        await prisma.taskCoAssignee.deleteMany({
          where: { taskId: id, staffId: { in: toRemove } },
        });
      }
      if (toAdd.length) {
        await prisma.taskCoAssignee.createMany({
          data: toAdd.map((staffId) => ({ taskId: id, staffId })),
        });
      }
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

/** Maps a raw status change to its governed workflow transition. */
function transitionForStatusChange(
  from: string,
  to: string
): TransitionAction | null {
  if (from === "OPEN" && to === "IN_PROGRESS") return "accept";
  if (from === "IN_PROGRESS" && to === "ON_HOLD") return "hold";
  if (from === "ON_HOLD" && to === "IN_PROGRESS") return "resume";
  if (from === "IN_PROGRESS" && to === "PENDING_REVIEW")
    return "submitForReview";
  if (from === "ON_HOLD" && to === "PENDING_REVIEW") return "submitForReview";
  if (from === "PENDING_REVIEW" && to === "COMPLETED") return "approve";
  if (from === "PENDING_REVIEW" && to === "IN_PROGRESS")
    return "requestRework";
  if (to === "CANCELLED") return "cancel";
  return null;
}

export async function getTaskAttachments(
  taskId: string
): Promise<
  ActionResult<{ id: string; filename: string; size: number | null }[]>
> {
  return withPermission("taskManagement", "read", async (user) => {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { assignedToId: true, assignedById: true, reviewerId: true },
    });
    if (!task) throw new Error("Task not found.");
    // Record-level check — module read alone does not expose files.
    const { canAccessTask } = await import("@/lib/task-access");
    if (!(await canAccessTask(user, task))) {
      throw new Error("You are not allowed to view this task's files.");
    }
    const rows = await prisma.taskAttachment.findMany({
      where: { taskId },
      select: { id: true, filename: true, size: true },
      orderBy: { createdAt: "asc" },
    });
    return rows;
  });
}

export async function deleteTask(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("taskManagement", "delete", async (user) => {
    // Never silently destroy attachment records — the FK is RESTRICT
    // anyway, so block first with a clear message.
    const attachmentCount = await prisma.taskAttachment.count({
      where: { taskId: id },
    });
    if (attachmentCount > 0) {
      throw new Error(
        `This task has ${attachmentCount} attached file(s). ` +
          `Remove the attachments in the task first, then delete the task.`
      );
    }
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
          coAssignees: { include: { staff: { select: { id: true, name: true } } } },
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
        coAssignees: { include: { staff: true } },
      },
    });
  });
}

// ─── Excel "To Do Task" workflow transitions (Phase 2C) ─────────
// Verified lifecycle: OPEN → IN_PROGRESS → PENDING_REVIEW → COMPLETED
// with hold/resume and reviewer rework paths. Every transition is
// identity-checked: assignee actions need the task's assigned staff,
// review actions need the task's reviewer — self-approval is denied
// for everyone except ADMIN.

const taskTransitionSchema = z.object({
  id: z.string().cuid(),
  action: z.enum([
    "accept",          // OPEN → IN_PROGRESS (assignee accepts the task)
    "updateProgress",  // percentageCompletion + optional activity note
    "submitForReview", // IN_PROGRESS → PENDING_REVIEW
    "approve",         // PENDING_REVIEW → COMPLETED (reviewer only)
    "requestRework",   // PENDING_REVIEW → IN_PROGRESS with reason
    "hold",            // IN_PROGRESS → ON_HOLD
    "resume",          // ON_HOLD → IN_PROGRESS
    "cancel",          // → CANCELLED (assigner/manager only)
  ]),
  percentageCompletion: z.number().int().min(0).max(100).optional(),
  note: z.string().trim().max(500).optional(),
  reworkReason: z.string().trim().min(1).max(500).optional(),
}).refine(
  (d) => d.action !== "requestRework" || !!d.reworkReason,
  {
    message: "A reason is required when sending a task back for changes.",
    path: ["reworkReason"],
  }
);

export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;

type TransitionAction = TaskTransitionInput["action"];

interface ActorContext {
  staffId: string | null;
  staffName: string;
  isAdmin: boolean;
  canManage: boolean; // taskManagement:update (ADMIN/MANAGER)
}

// There is no Staff↔User foreign key; the registration flow creates
// both records with the SAME email, so email is the reliable bridge.
// Null/mismatched email simply means "not identified" — denials stay safe.
async function resolveActor(user: { id: string; role?: string; email?: string | null }): Promise<ActorContext> {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  const staff = u?.email
    ? await prisma.staff.findFirst({
        where: { email: { equals: u.email, mode: "insensitive" } },
        select: { id: true, name: true },
      })
    : null;
  const role = String(user.role ?? "");
  return {
    staffId: staff?.id ?? null,
    staffName: staff?.name ?? "A user",
    isAdmin: role === "ADMIN",
    canManage: role === "ADMIN" || role === "MANAGER",
  };
}

function actorAllowed(
  action: TransitionAction,
  task: {
    status: string;
    assignedToId: string;
    assignedById: string | null;
    reviewerId: string | null;
  },
  actor: ActorContext,
  userId: string
): string | null {
  const isAssignee = actor.staffId != null && task.assignedToId === actor.staffId;
  const isReviewer = actor.staffId != null && task.reviewerId === actor.staffId;
  const isAssigner = task.assignedById === userId;

  switch (action) {
    case "accept":
      if (task.status !== "OPEN") return "Only an open task can be accepted.";
      return isAssignee || actor.canManage
        ? null
        : "Only the assigned employee can accept this task.";
    case "updateProgress":
      if (task.status !== "IN_PROGRESS" && task.status !== "ON_HOLD")
        return "Progress can only be updated while the task is in progress or on hold.";
      return isAssignee || actor.canManage
        ? null
        : "Only the assigned employee can update progress.";
    case "submitForReview":
      if (task.status !== "IN_PROGRESS" && task.status !== "ON_HOLD")
        return "Only a task in progress can be submitted for review.";
      return isAssignee || actor.canManage
        ? null
        : "Only the assigned employee can submit this task for review.";
    case "approve":
      if (task.status !== "PENDING_REVIEW")
        return "Only a task awaiting review can be approved.";
      if (isAssignee && !actor.isAdmin)
        return "You cannot approve your own work — the reviewer must approve it.";
      return isReviewer || actor.isAdmin
        ? null
        : "Only the assigned reviewer can approve this task.";
    case "requestRework":
      if (task.status !== "PENDING_REVIEW")
        return "Only a task awaiting review can be sent back for changes.";
      if (isAssignee && !actor.isAdmin)
        return "You cannot request changes on your own task — the reviewer does that.";
      return isReviewer || actor.isAdmin
        ? null
        : "Only the assigned reviewer can request changes.";
    case "hold":
    case "resume":
      if (action === "hold" && task.status !== "IN_PROGRESS")
        return "Only a task in progress can be put on hold.";
      if (action === "resume" && task.status !== "ON_HOLD")
        return "Only a task on hold can be resumed.";
      return isAssignee || actor.canManage
        ? null
        : "Only the assigned employee can hold or resume this task.";
    case "cancel":
      if (task.status === "COMPLETED" || task.status === "CANCELLED")
        return "This task is already finished.";
      return actor.canManage || isAssigner
        ? null
        : "Only the person who created the task or a manager can cancel it.";
  }
}

/** Sends an in-app notification; silently skipped when the staff
    member has no linked user account. Never throws. */
async function notifyStaff(
  staffId: string | null,
  title: string,
  message: string,
  taskId: string
) {
  if (!staffId) return;
  try {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId },
      select: { email: true },
    });
    if (!staff?.email) return;
    const user = await prisma.user.findFirst({
      where: { email: { equals: staff.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) return;
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "CUSTOM",
        module: "tasks",
        entityId: taskId,
        entityName: title,
        title,
        message,
        priority: "MEDIUM",
      },
    });
  } catch {
    // Notification delivery must never break the task transition.
  }
}

export async function performTaskTransition(
  input: TaskTransitionInput
): Promise<ActionResult<{ id: string; status: string }>> {
  // Read-level permission is enough — every transition then enforces
  // assignee/reviewer identity, which is what actually protects work.
  return withPermission("taskManagement", "read", async (user) => {
    const parsed = taskTransitionSchema.parse(input);
    await checkRateLimit(user.id);

    const task = await prisma.task.findUnique({ where: { id: parsed.id } });
    if (!task) throw new Error("Task not found.");

    const actor = await resolveActor(user);
    const denial = actorAllowed(parsed.action, task, actor, user.id);
    if (denial) throw new Error(denial);

    const data: Record<string, unknown> = {};
    let logLine: string | null = null;

    switch (parsed.action) {
      case "accept":
        data.status = "IN_PROGRESS";
        logLine = "Accepted the task";
        break;
      case "updateProgress":
        if (parsed.percentageCompletion !== undefined)
          data.percentageCompletion = parsed.percentageCompletion;
        if (parsed.note)
          logLine = `Progress ${parsed.percentageCompletion ?? task.percentageCompletion}% — ${parsed.note}`;
        break;
      case "submitForReview":
        data.status = "PENDING_REVIEW";
        logLine = "Submitted for review";
        break;
      case "approve":
        data.status = "COMPLETED";
        data.completedAt = new Date();
        // Preserve earned progress — mark 100 only if it wasn't already.
        if (task.percentageCompletion < 100) data.percentageCompletion = 100;
        logLine = "Approved — task completed";
        break;
      case "requestRework":
        data.status = "IN_PROGRESS";
        data.reworkReason = parsed.reworkReason ?? null;
        data.reworkCount = task.reworkCount + 1;
        logLine = `Sent back for changes${parsed.reworkReason ? `: ${parsed.reworkReason}` : ""}`;
        break;
      case "hold":
        data.status = "ON_HOLD";
        logLine = "Put on hold";
        break;
      case "resume":
        data.status = "IN_PROGRESS";
        logLine = "Resumed";
        break;
      case "cancel":
        data.status = "CANCELLED";
        logLine = "Cancelled the task";
        break;
    }

    // Append to the activity log — history is preserved, never reset.
    if (logLine) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const entry = `[${stamp}] ${actor.staffName}: ${logLine}`;
      data.activityLog = task.activityLog
        ? `${task.activityLog}\n${entry}`
        : entry;
    }

    await prisma.task.update({ where: { id: task.id }, data });

    await audit(user.id, "update", "Task", task.id, {
      transition: parsed.action,
      from: task.status,
      to: data.status ?? task.status,
    });

    // In-app notifications to the people who need to act next.
    if (parsed.action === "submitForReview") {
      await notifyStaff(
        task.reviewerId,
        "Task ready for review",
        `"${task.title}" was submitted for your review.`,
        task.id
      );
    } else if (parsed.action === "approve") {
      await notifyStaff(
        task.assignedToId,
        "Task approved",
        `"${task.title}" was approved and marked completed.`,
        task.id
      );
    } else if (parsed.action === "requestRework") {
      await notifyStaff(
        task.assignedToId,
        "Changes requested",
        `"${task.title}" was sent back${parsed.reworkReason ? `: ${parsed.reworkReason}` : ""}.`,
        task.id
      );
    }

    revalidatePath("/dashboard/tasks");
    return { id: task.id, status: String(data.status ?? task.status) };
  });
}
