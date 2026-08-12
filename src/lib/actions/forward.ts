"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  withPermission,
  withAuth,
  checkRateLimit,
  audit,
  ActionResult,
} from "./wrapper";
import {
  forwardCreateSchema,
  forwardAcknowledgeSchema,
  ForwardCreateInput,
  ForwardAcknowledgeInput,
} from "@/lib/schemas/forward";

export async function createForward(
  input: ForwardCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = forwardCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const record = await prisma.forwardRecord.create({
      data: {
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        fromUserId: user.id,
        toStaffId: parsed.toStaffId,
        remarks: parsed.remarks,
      },
    });

    await audit(user.id, "forward", parsed.entityType, parsed.entityId, {
      forwardRecordId: record.id,
      toStaffId: parsed.toStaffId,
    });

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/assets");
    revalidatePath("/dashboard/tada-bills");
    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/in-out-register");
    return { id: record.id };
  });
}

export async function acknowledgeForward(
  input: ForwardAcknowledgeInput
): Promise<ActionResult<{ id: string }>> {
  return withAuth(async (user) => {
    const parsed = forwardAcknowledgeSchema.parse(input);
    await checkRateLimit(user.id);

    const record = await prisma.forwardRecord.update({
      where: { id: parsed.id },
      data: {
        status: parsed.status,
        acknowledgedAt: new Date(),
      },
    });

    await audit(user.id, "acknowledge", "ForwardRecord", record.id, {
      entityType: record.entityType,
      entityId: record.entityId,
      status: parsed.status,
    });

    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/assets");
    revalidatePath("/dashboard/tada-bills");
    revalidatePath("/dashboard/due-bills");
    revalidatePath("/dashboard/in-out-register");
    return { id: record.id };
  });
}

export async function getForwardRecords(
  entityType: string,
  entityId: string
): Promise<ActionResult<unknown[]>> {
  return withAuth(async () => {
    const records = await prisma.forwardRecord.findMany({
      where: { entityType, entityId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toStaff: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { forwardedAt: "desc" },
    });
    return records;
  });
}

export async function getLatestForwardStatus(
  entityType: string,
  entityIds: string[]
): Promise<ActionResult<Record<string, unknown>>> {
  return withAuth(async () => {
    if (entityIds.length === 0) return {};

    const records = await prisma.forwardRecord.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
      },
      include: {
        toStaff: { select: { id: true, name: true } },
      },
      orderBy: { forwardedAt: "desc" },
    });

    const latestByEntity: Record<string, unknown> = {};
    for (const record of records) {
      if (!latestByEntity[record.entityId]) {
        latestByEntity[record.entityId] = {
          id: record.id,
          status: record.status,
          toStaffName: record.toStaff?.name ?? null,
          forwardedAt: record.forwardedAt,
          remarks: record.remarks,
        };
      }
    }
    return latestByEntity;
  });
}
