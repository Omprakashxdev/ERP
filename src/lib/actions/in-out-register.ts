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
import { issueRegisterSerialNo } from "@/lib/register-serial";
import { INOUT_PRIVATE_PREFIX } from "@/lib/in-out-documents";
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

const NEW_INWARD_TYPES = ["INFORMATIVE", "ACTION_REQUIRED"];

function normalizeDocumentRefNo(value: string): string {
  return value.trim();
}

/**
 * Customer requirement: the employee-entered document number must be
 * unique across register entries (trimmed, case-insensitive). The
 * partial unique index InOutRegister_documentRefNo_key is the final
 * guard for concurrent inserts; this check gives the friendly message.
 */
async function assertDocumentRefNoAvailable(
  refNo: string,
  excludeId?: string
) {
  const normalized = normalizeDocumentRefNo(refNo);
  const existing = await prisma.inOutRegister.findFirst({
    where: {
      documentRefNo: { equals: normalized, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, serialNo: true },
  });
  if (existing) {
    throw new Error(
      "This document number is already registered. Please enter a different number."
    );
  }
}

function isDocumentRefNoUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  const haystacks = [
    ...(Array.isArray(target) ? target : target ? [String(target)] : []),
    typeof (err as { message?: string }).message === "string"
      ? String((err as { message?: string }).message)
      : "",
  ];
  return haystacks.some((t) => t.includes("documentRefNo"));
}

function documentRefNoTakenMessage(err: unknown): never {
  if (isDocumentRefNoUniqueViolation(err)) {
    throw new Error(
      "This document number is already registered. Please enter a different number."
    );
  }
  throw err;
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

// A private upload may only be attached by the user who uploaded it —
// knowing another user's pending filename must not grant it. Paths
// already linked to a register document may be re-attached normally.
async function assertPrivatePathsAttachable(paths: string[], userId: string) {
  const candidates = paths.filter((p) => p.startsWith(INOUT_PRIVATE_PREFIX));
  if (candidates.length === 0) return;
  const names = candidates.map((p) => p.slice(INOUT_PRIVATE_PREFIX.length));
  const [owned, linked] = await Promise.all([
    prisma.pendingInOutUpload.findMany({
      where: { storedName: { in: names }, uploadedById: userId },
      select: { storedName: true },
    }),
    prisma.inOutRegisterDocument.findMany({
      where: { path: { in: candidates } },
      select: { path: true },
    }),
  ]);
  const allowed = new Set([
    ...owned.map((o) => INOUT_PRIVATE_PREFIX + o.storedName),
    ...linked.map((l) => l.path),
  ]);
  if (candidates.some((p) => !allowed.has(p))) {
    throw new Error(
      "One or more attachments are not available. Re-upload the file and try again."
    );
  }
}

// Once a pending file is linked to a register entry its access rule
// moves to the document record — drop the pending row (file untouched).
async function clearConsumedPendingUploads(paths: string[]) {
  const names = paths
    .filter((p) => p.startsWith(INOUT_PRIVATE_PREFIX))
    .map((p) => p.slice(INOUT_PRIVATE_PREFIX.length));
  if (names.length === 0) return;
  await prisma.pendingInOutUpload
    .deleteMany({ where: { storedName: { in: names } } })
    .catch(() => {});
}

export async function createInOutRegister(
  input: InOutRegisterCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "create", async (user) => {
    const parsed = inOutRegisterCreateSchema.parse(input);
    const { ccStaffIds, documents, ...data } = parsed;
    await checkRateLimit(user.id);

    const staff = await prisma.staff.findUnique({
      where: { id: data.actionSuggestedStaffId },
      select: { id: true },
    });
    if (!staff) {
      throw new Error("Action suggested to must be an existing staff member");
    }
    if (data.modeId) {
      const mode = await prisma.modeMaster.findUnique({
        where: { id: data.modeId },
        select: { isActive: true },
      });
      if (!mode) throw new Error("Selected mode does not exist");
      if (!mode.isActive) {
        throw new Error("Selected mode is inactive and cannot be used for new entries");
      }
    }
    await assertDocumentRefNoAvailable(data.documentRefNo);
    await assertPrivatePathsAttachable(documents ?? [], user.id);

    // Client-supplied serialNo is ignored — serials are server-authoritative,
    // issued from a monotonic per-scope counter inside the same transaction
    // as the row insert. A rollback returns the number unissued.
    const entry = await prisma.$transaction(async (tx) => {
      const serialNo = await issueRegisterSerialNo(
        tx,
        data.direction || "INWARD"
      );
      return tx.inOutRegister.create({
        data: {
          ...data,
          serialNo,
          documents: buildDocumentCreateInput(documents),
          ccStaff: buildCcStaffCreateInput(ccStaffIds),
        },
      }).catch(documentRefNoTakenMessage);
    });

    await clearConsumedPendingUploads(documents ?? []);

    await audit(user.id, "create", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    await createInOutRegisterLinkedTasks({
      inOutRegisterId: entry.id,
      documentRefNo: entry.documentRefNo || entry.serialNo || "",
      direction: entry.direction,
      inwardType: entry.inwardType,
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

    // Customer requirement: validate the EFFECTIVE record, not just the
    // patch — an employee editing an incomplete legacy record must first
    // complete the newly mandatory fields before it can be resaved.
    const effectiveRefNo =
      data.documentRefNo !== undefined
        ? data.documentRefNo
        : existing.documentRefNo;
    if (!effectiveRefNo || !effectiveRefNo.trim()) {
      throw new Error(
        "Document number is required. Enter the Incoming/Outgoing Document Ref. No before saving."
      );
    }
    const effectiveStaffId =
      data.actionSuggestedStaffId !== undefined
        ? data.actionSuggestedStaffId
        : existing.actionSuggestedStaffId;
    if (!effectiveStaffId) {
      throw new Error(
        "Action suggested to is required. Select a staff member before saving."
      );
    }
    if (data.actionSuggestedStaffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: data.actionSuggestedStaffId },
        select: { id: true },
      });
      if (!staff) {
        throw new Error("Action suggested to must be an existing staff member");
      }
    }
    // A newly chosen mode must exist and be active; an unchanged saved
    // reference (even to a since-deactivated mode) is preserved.
    if (data.modeId && data.modeId !== existing.modeId) {
      const mode = await prisma.modeMaster.findUnique({
        where: { id: data.modeId },
        select: { isActive: true },
      });
      if (!mode) throw new Error("Selected mode does not exist");
      if (!mode.isActive) {
        throw new Error("Selected mode is inactive and cannot be used for new entries");
      }
    }
    await assertDocumentRefNoAvailable(effectiveRefNo, id);

    // Legacy inward types remain valid only while unchanged — they cannot
    // be newly assigned to a record that did not already carry them.
    if (
      data.inwardType !== undefined &&
      data.inwardType !== existing.inwardType &&
      data.inwardType !== null &&
      !NEW_INWARD_TYPES.includes(data.inwardType)
    ) {
      throw new Error("Inward type must be Informative or Action Required");
    }

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
      await assertPrivatePathsAttachable(addedPaths, user.id);
      await prisma.inOutRegisterDocument.createMany({
        data: addedPaths.map((path) => ({ inOutRegisterId: id, path })),
      });
      await clearConsumedPendingUploads(addedPaths);
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

    // Ensure serialNo is immutable and cannot be changed on edit
    const { serialNo: _ignoredSerialNo, ...updateData } = data;

    const entry = await prisma.inOutRegister
      .update({
        where: { id },
        data: updateData,
      })
      .catch(documentRefNoTakenMessage);

    await audit(user.id, "update", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    // Create tasks for newly chosen staff; existing tasks and their
    // progress are never touched.
    await createInOutRegisterLinkedTasks({
      inOutRegisterId: entry.id,
      documentRefNo: entry.documentRefNo || entry.serialNo || "",
      direction: entry.direction,
      inwardType: entry.inwardType,
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
          mode: { select: { id: true, name: true, isActive: true } },
          documents: true,
          ccStaff: {
            include: { staff: true },
          },
          parentInward: {
            select: { id: true, serialNo: true, documentRefNo: true, details: true, documentDate: true },
          },
          replies: {
            select: { id: true, serialNo: true, documentRefNo: true, receivedDate: true, details: true },
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
        mode: { select: { id: true, name: true, isActive: true } },
        documents: true,
        ccStaff: {
          include: { staff: true },
        },
        parentInward: {
          select: { id: true, serialNo: true, documentRefNo: true, details: true, documentDate: true },
        },
        replies: {
          select: { id: true, serialNo: true, documentRefNo: true, receivedDate: true, details: true },
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

    // Non-authoritative preview for the form — the real serial is issued
    // server-side at create time. Reads the monotonic counter too so a
    // deleted record doesn't preview a recycled number.
    const [records, counter] = await Promise.all([
      prisma.inOutRegister.findMany({
        where: {
          direction,
          OR: [
            { serialNo: { startsWith: prefix, mode: "insensitive" } },
            { documentRefNo: { startsWith: prefix, mode: "insensitive" } },
          ],
        },
        select: { serialNo: true, documentRefNo: true },
      }),
      prisma.registerSerialCounter
        .findUnique({ where: { scope: prefix.slice(0, -1) } })
        .catch(() => null),
    ]);

    let maxSeq = counter?.lastSeq ?? 0;
    for (const rec of records) {
      for (const val of [rec.serialNo, rec.documentRefNo]) {
        if (val && val.toUpperCase().startsWith(prefix.toUpperCase())) {
          const parts = val.split("/");
          const lastPart = parts[parts.length - 1];
          const num = parseInt(lastPart, 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
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
