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

function generateReplyRefNo(): string {
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `REP-${Date.now()}-${random}`;
}

function computeAgeInDays(receivedDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = new Date().getTime() - new Date(receivedDate).getTime();
  return Math.max(0, Math.floor(diff / msPerDay));
}

function computeInOutRegisterFlags(entry: {
  replyDate: Date | null;
  receivedDate: Date;
}) {
  return {
    isPendingReply: !entry.replyDate,
    ageInDays: computeAgeInDays(entry.receivedDate),
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
    const { ccStaffIds, documents, replyDate, ...data } = parsed;
    await checkRateLimit(user.id);

    const replyRefNo = replyDate ? generateReplyRefNo() : null;

    const entry = await prisma.inOutRegister.create({
      data: {
        ...data,
        replyDate,
        replyRefNo,
        documents: buildDocumentCreateInput(documents),
        ccStaff: buildCcStaffCreateInput(ccStaffIds),
      },
    });

    await audit(user.id, "create", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/in-out-register");
    return { id: entry.id };
  });
}

export async function updateInOutRegister(
  input: InOutRegisterUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "update", async (user) => {
    const parsed = inOutRegisterUpdateSchema.parse(input);
    const { id, ccStaffIds, documents, replyDate, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.inOutRegister.findUnique({
      where: { id },
    });
    if (!existing) throw new Error("In-out register entry not found");

    const replyRefNo =
      replyDate && !existing.replyRefNo ? generateReplyRefNo() : undefined;

    await prisma.inOutRegisterDocument.deleteMany({
      where: { inOutRegisterId: id },
    });
    await prisma.inOutRegisterCcStaff.deleteMany({
      where: { inOutRegisterId: id },
    });

    const entry = await prisma.inOutRegister.update({
      where: { id },
      data: {
        ...data,
        replyDate,
        replyRefNo,
        documents: buildDocumentCreateInput(documents),
        ccStaff: buildCcStaffCreateInput(ccStaffIds),
      },
    });

    await audit(user.id, "update", "InOutRegister", entry.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/in-out-register");
    return { id: entry.id };
  });
}

export async function deleteInOutRegister(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("inOutRegister", "delete", async (user) => {
    await checkRateLimit(user.id);

    const entry = await prisma.inOutRegister.delete({ where: { id } });

    await audit(user.id, "delete", "InOutRegister", entry.id, {});

    revalidatePath("/dashboard/in-out-register");
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
