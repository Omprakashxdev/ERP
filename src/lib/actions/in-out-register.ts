"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  inOutRegisterCreateSchema,
  inOutRegisterUpdateSchema,
  inOutRegisterFilterSchema,
  InOutRegisterCreateInput,
  InOutRegisterUpdateInput,
  InOutRegisterFilterInput,
} from "@/lib/schemas/in-out-register";
import { buildInOutRegisterWhere } from "@/lib/queries/in-out-register";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";
import { createInOutRegisterLinkedTasks, deleteLinkedTasks } from "./task-linking";
import {
  computeAgeInDaysIST,
  toInputDateIST,
  getTodayISTDateString,
  getIndianFinancialYear,
} from "@/lib/date-utils";

function computeInOutRegisterFlags(entry: {
  receivedDate: Date;
  replyDueDate?: Date | null;
  direction?: string | null;
  replies?: unknown[];
}) {
  const hasReply = Boolean(entry.replies && entry.replies.length > 0);
  const isPending = Boolean(entry.direction === "INWARD" && entry.replyDueDate && !hasReply);
  const nowStr = getTodayISTDateString();
  const dueDateStr = entry.replyDueDate ? toInputDateIST(entry.replyDueDate) : null;

  let isOverdue = false;
  let daysUntilDue: number | null = null;
  let daysOverdue: number | null = null;

  if (isPending && dueDateStr) {
    const [ny, nm, nd] = nowStr.split("-").map(Number);
    const [dy, dm, dd] = dueDateStr.split("-").map(Number);
    const nowUtc = Date.UTC(ny, nm - 1, nd);
    const dueUtc = Date.UTC(dy, dm - 1, dd);
    const diff = Math.round((dueUtc - nowUtc) / 86400000);

    if (diff < 0) {
      isOverdue = true;
      daysOverdue = Math.abs(diff);
    } else {
      daysUntilDue = diff;
    }
  }

  return {
    isPendingReply: isPending,
    isReplied: hasReply,
    isOverdue,
    daysUntilDue,
    daysOverdue,
    ageInDays: computeAgeInDaysIST(entry.receivedDate),
  };
}

function buildDocumentCreateInput(
  documents?: string[]
): { create: { path: string }[] } | undefined {
  if (!documents || documents.length === 0) return undefined;
  return { create: documents.map((path) => ({ path })) };
}

function buildCcStaffCreateInput(
  ccStaffIds?: string[]
): { create: { staffId: string }[] } | undefined {
  if (!ccStaffIds || ccStaffIds.length === 0) return undefined;
  return { create: ccStaffIds.map((staffId) => ({ staffId })) };
}

export async function createInOutRegister(
  input: InOutRegisterCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "create", async (user) => {
    const parsed = inOutRegisterCreateSchema.parse(input);
    const { ccStaffIds, documents, ...data } = parsed;
    await checkRateLimit(user.id);

    const entry = await prisma.inOutRegister.create({
      data: {
        ...data,
        documents: buildDocumentCreateInput(documents),
        ccStaff: buildCcStaffCreateInput(ccStaffIds),
      },
    });

    await audit(user.id, "create", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    await createInOutRegisterLinkedTasks({
      inOutRegisterId: entry.id,
      documentRefNo: entry.documentRefNo,
      details: entry.details,
      receivedDate: entry.receivedDate,
      replyDueDate: entry.replyDueDate,
      actionSuggestedStaffId: entry.actionSuggestedStaffId,
      ccStaffIds: ccStaffIds,
    }).catch(() => {});

    revalidatePath("/dashboard/in-out-register");
    revalidatePath("/dashboard/tasks");
    return { id: entry.id };
  });
}

export async function updateInOutRegister(
  input: InOutRegisterUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "update", async (user) => {
    const parsed = inOutRegisterUpdateSchema.parse(input);
    const { id, ccStaffIds, documents, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.inOutRegister.findUnique({
      where: { id },
      include: {
        documents: { select: { path: true } },
        ccStaff: { select: { staffId: true } },
      },
    });
    if (!existing) throw new Error("In-out register entry not found");

    // Surgical sync — remove only what the user removed, add only what is
    // new. Unchanged document/CC rows keep their original records.
    const keepPaths = documents ?? [];
    const removedPaths = existing.documents
      .map((d) => d.path)
      .filter((p) => !keepPaths.includes(p));
    const addedPaths = keepPaths.filter(
      (p) => !existing.documents.some((d) => d.path === p)
    );
    if (removedPaths.length > 0) {
      await prisma.inOutRegisterDocument.deleteMany({
        where: { inOutRegisterId: id, path: { in: removedPaths } },
      });
    }
    if (addedPaths.length > 0) {
      await prisma.inOutRegisterDocument.createMany({
        data: addedPaths.map((path) => ({ inOutRegisterId: id, path })),
      });
    }

    const keepStaffIds = ccStaffIds ?? [];
    const removedStaffIds = existing.ccStaff
      .map((c) => c.staffId)
      .filter((sid) => !keepStaffIds.includes(sid));
    const addedStaffIds = keepStaffIds.filter(
      (sid) => !existing.ccStaff.some((c) => c.staffId === sid)
    );
    if (removedStaffIds.length > 0) {
      await prisma.inOutRegisterCcStaff.deleteMany({
        where: { inOutRegisterId: id, staffId: { in: removedStaffIds } },
      });
    }
    if (addedStaffIds.length > 0) {
      await prisma.inOutRegisterCcStaff.createMany({
        data: addedStaffIds.map((staffId) => ({
          inOutRegisterId: id,
          staffId,
        })),
      });
    }

    const entry = await prisma.inOutRegister.update({
      where: { id },
      data,
    });

    await audit(user.id, "update", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Create tasks for newly chosen staff; existing tasks and their
    // progress are never touched.
    await createInOutRegisterLinkedTasks({
      inOutRegisterId: entry.id,
      documentRefNo: entry.documentRefNo,
      details: entry.details,
      receivedDate: entry.receivedDate,
      replyDueDate: entry.replyDueDate,
      actionSuggestedStaffId: entry.actionSuggestedStaffId,
      ccStaffIds: addedStaffIds,
    }).catch(() => {});

    revalidatePath("/dashboard/in-out-register");
    return { id: entry.id };
  });
}

export async function deleteInOutRegister(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "delete", async (user) => {
    await checkRateLimit(user.id);

    // Never silently delete linked follow-up tasks — their progress,
    // comments and history belong to the employees. Block instead.
    const linkedCount = await prisma.task.count({
      where: { sourceModule: "IN_OUT_REGISTER", sourceEntityId: id },
    });
    if (linkedCount > 0) {
      throw new Error(
        `This correspondence has ${linkedCount} linked follow-up task(s) ` +
          `in the To-Do list. Delete or cancel those tasks in Tasks first, ` +
          `then delete this entry.`
      );
    }

    const entry = await prisma.inOutRegister.delete({ where: { id } });

    await audit(user.id, "delete", "InOutRegister", entry.id, {});

    await deleteLinkedTasks("IN_OUT_REGISTER", id).catch(() => {});

    revalidatePath("/dashboard/in-out-register");
    revalidatePath("/dashboard/tasks");
    return { id: entry.id };
  });
}

export async function getInOutRegisters(
  filter?: InOutRegisterFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("inOutRegister", "read", async () => {
    const parsed = filter
      ? inOutRegisterFilterSchema.parse(filter)
      : undefined;
    const where = buildInOutRegisterWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.inOutRegister.findMany({
        where,
        include: {
          client: true,
          actionSuggestedStaff: true,
          documents: true,
          ccStaff: {
            include: { staff: true },
          },
          parentInward: {
            select: { id: true, documentRefNo: true, details: true, documentDate: true },
          },
          replies: {
            select: { id: true, documentRefNo: true, receivedDate: true, details: true },
          },
        },
        orderBy: { receivedDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inOutRegister.count({ where }),
    ]);

    const computedRows = rows.map((entry) => ({
      ...entry,
      ...computeInOutRegisterFlags(entry),
      ccStaffNames: entry.ccStaff.map((cs) => cs.staff.name).join(", "),
    }));

    return { rows: computedRows, total };
  });
}

export async function getInOutRegisterById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("inOutRegister", "read", async () => {
    const entry = await prisma.inOutRegister.findUnique({
      where: { id },
      include: {
        client: true,
        actionSuggestedStaff: true,
        documents: true,
        ccStaff: {
          include: { staff: true },
        },
        parentInward: {
          select: { id: true, documentRefNo: true, details: true, documentDate: true },
        },
        replies: {
          select: { id: true, documentRefNo: true, receivedDate: true, details: true },
        },
      },
    });

    if (!entry) return null;

    return {
      ...entry,
      ...computeInOutRegisterFlags(entry),
      ccStaffNames: entry.ccStaff.map((cs) => cs.staff.name).join(", "),
    };
  });
}

export async function getNextRegisterRefNo(
  direction: "INWARD" | "OUTWARD",
  dateInput?: string | Date | null
): Promise<ActionResult<{ refNo: string }>> {
  return withPermission("inOutRegister", "read", async () => {
    const fy = getIndianFinancialYear(dateInput || new Date());
    const prefix = direction === "INWARD" ? `INW/${fy}/` : `OUT/${fy}/`;

    const records = await prisma.inOutRegister.findMany({
      where: {
        direction,
        documentRefNo: {
          startsWith: prefix,
          mode: "insensitive",
        },
      },
      select: { documentRefNo: true },
    });

    let maxSeq = 0;
    for (const rec of records) {
      const parts = rec.documentRefNo.split("/");
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }

    const nextSeq = maxSeq + 1;
    const padded = String(nextSeq).padStart(3, "0");
    return { refNo: `${prefix}${padded}` };
  });
}


/** Tasks already linked to a register entry — shown when reopening it. */
export async function getInOutRegisterLinkedTasks(
  inOutRegisterId: string
): Promise<
  ActionResult<
    {
      id: string;
      title: string;
      status: string;
      dueDate: Date | null;
      assignedTo: { name: string } | null;
    }[]
  >
> {
  return withPermission("inOutRegister", "read", async () => {
    return prisma.task.findMany({
      where: { sourceModule: "IN_OUT_REGISTER", sourceEntityId: inOutRegisterId },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });
  });
}
