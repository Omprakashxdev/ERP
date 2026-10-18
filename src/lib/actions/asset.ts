"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { AssetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assetCreateSchema,
  assetUpdateSchema,
  assetFilterSchema,
  assetMovementCreateSchema,
  AssetCreateInput,
  AssetUpdateInput,
  AssetFilterInput,
  AssetMovementCreateInput,
} from "@/lib/schemas/asset";
import { buildAssetWhere } from "@/lib/queries/assets";
import {
  withPermission,
  checkRateLimit,
  audit,
  sanitizeForAudit,
  ActionResult,
} from "./wrapper";

function toDecimal(value: Decimal | null | undefined): Decimal {
  return value ? new Decimal(value.toString()) : new Decimal("0.00");
}

function computeRemainingQuantity(
  quantity: Decimal,
  assignedQuantity: Decimal | null | undefined
): number {
  return Number(
    toDecimal(quantity).minus(toDecimal(assignedQuantity)).toFixed(2)
  );
}

function computeAssetFlags(asset: { billWarrantyPath: string | null }) {
  return {
    isWarrantyDocumentMissing: !asset.billWarrantyPath,
  };
}

function generateItemCode(): string {
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `AST-${Date.now()}-${random}`;
}

async function generateSecurityCode(
  category?: string | null,
  name?: string | null,
  make?: string | null
): Promise<string> {
  const catPart = category ? category.trim().slice(0, 3) : "Ast";
  const namePart = name ? name.trim().split(/\s+/)[0].slice(0, 10) : "Item";
  const makePart = make ? make.trim().split(/\s+/)[0].slice(0, 10) : "Gen";

  const count = await prisma.asset.count({
    where: category ? { category: { equals: category, mode: "insensitive" } } : undefined,
  });

  return `${catPart}/${namePart}/${makePart}/${count + 1}`;
}

export async function createAsset(
  input: AssetCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "create", async (user) => {
    const parsed = assetCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const securityCode =
      parsed.securityCode?.trim() ||
      (await generateSecurityCode(parsed.category, parsed.name, parsed.make));

    let currentHolderId: string | null = null;
    if (parsed.assigneeType === "PERSON") {
      // Prefer the explicit staff id sent by the form; fall back to an
      // exact name match only when no id was provided.
      if (parsed.assigneeStaffId) {
        const staffMember = await prisma.staff.findUnique({
          where: { id: parsed.assigneeStaffId },
        });
        if (!staffMember) throw new Error("Selected staff member not found");
        currentHolderId = staffMember.id;
      } else if (parsed.assignee) {
        const staffMember = await prisma.staff.findFirst({
          where: { name: { equals: parsed.assignee, mode: "insensitive" } },
        });
        if (staffMember) currentHolderId = staffMember.id;
      }
    }

    let status = parsed.status;
    if (
      status === AssetStatus.AVAILABLE &&
      (Number(parsed.assignedQuantity ?? 0) > 0 || parsed.assignee)
    ) {
      status = AssetStatus.ASSIGNED;
    }

    // Stable responsible-person identity: when the form sends a staff id,
    // verify it and keep the readable name in sync. A bare name is kept
    // as text only — never guessed into an id.
    let responsiblePersonName = parsed.responsiblePerson;
    if (parsed.responsiblePersonId) {
      const responsible = await prisma.staff.findUnique({
        where: { id: parsed.responsiblePersonId },
        select: { name: true },
      });
      if (!responsible) throw new Error("Selected responsible person not found");
      responsiblePersonName = responsible.name;
    }

    const { assigneeStaffId: _aid, ...rest } = parsed;
    const asset = await prisma.asset.create({
      data: {
        ...rest,
        assignee:
          parsed.assignee ??
          (currentHolderId
            ? (
                await prisma.staff.findUnique({
                  where: { id: currentHolderId },
                  select: { name: true },
                })
              )?.name ?? null
            : parsed.assignee),
        status,
        currentHolderId,
        responsiblePerson: responsiblePersonName,
        itemCode: generateItemCode(),
        securityCode,
      },
    });

    await audit(user.id, "create", "Asset", asset.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/property");
    return { id: asset.id };
  });
}

export async function updateAsset(
  input: AssetUpdateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "update", async (user) => {
    const parsed = assetUpdateSchema.parse(input);
    const { id, ...data } = parsed;
    await checkRateLimit(user.id);

    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new Error("Asset not found");

    // Merged quantity integrity — assigned can never exceed the total,
    // even when only one of the two fields is sent.
    const mergedQty = Number(data.quantity ?? existing.quantity);
    const mergedAssigned = Number(data.assignedQuantity ?? existing.assignedQuantity ?? 0);
    if (mergedQty < 0) {
      throw new Error("Quantity cannot be negative");
    }
    if (mergedAssigned < 0) {
      throw new Error("Assigned quantity cannot be negative");
    }
    if (mergedAssigned > mergedQty) {
      throw new Error("Assigned quantity cannot exceed total quantity");
    }

    let currentHolderId: string | null | undefined = undefined;
    if (data.assigneeType === "PERSON") {
      if (data.assigneeStaffId) {
        const staffMember = await prisma.staff.findUnique({
          where: { id: data.assigneeStaffId },
        });
        if (!staffMember) throw new Error("Selected staff member not found");
        currentHolderId = staffMember.id;
        data.assignee = staffMember.name;
      } else if (data.assignee) {
        const staffMember = await prisma.staff.findFirst({
          where: { name: { equals: data.assignee, mode: "insensitive" } },
        });
        currentHolderId = staffMember ? staffMember.id : null;
      }
    } else if (
      data.assigneeType === "OFFICE" ||
      data.assignee === null ||
      data.assignee === ""
    ) {
      currentHolderId = null;
    }

    let status = data.status;
    if (
      status === AssetStatus.AVAILABLE &&
      (Number(data.assignedQuantity ?? 0) > 0 || data.assignee)
    ) {
      status = AssetStatus.ASSIGNED;
    }

    if (data.responsiblePersonId) {
      const responsible = await prisma.staff.findUnique({
        where: { id: data.responsiblePersonId },
        select: { name: true },
      });
      if (!responsible) throw new Error("Selected responsible person not found");
      data.responsiblePerson = responsible.name;
    }

    const { assigneeStaffId: _assigneeStaffId, ...rest } = data;
    const updatePayload: Record<string, unknown> = {
      ...rest,
      ...(status !== undefined ? { status } : {}),
      ...(currentHolderId !== undefined ? { currentHolderId } : {}),
    };

    const asset = await prisma.asset.update({
      where: { id },
      data: updatePayload as never,
    });

    await audit(user.id, "update", "Asset", asset.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/property");
    return { id: asset.id };
  });
}

export async function deleteAsset(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "delete", async (user) => {
    await checkRateLimit(user.id);

    const movementCount = await prisma.assetMovement.count({
      where: { assetId: id },
    });
    if (movementCount > 0) {
      throw new Error(
        `This asset has ${movementCount} recorded movement(s). ` +
          `Deleting it would erase its transfer history — mark it as ` +
          `retired or inactive instead.`
      );
    }
    const asset = await prisma.asset.delete({ where: { id } });

    await audit(user.id, "delete", "Asset", asset.id, {});

    revalidatePath("/dashboard/property");
    return { id: asset.id };
  });
}

export async function getAssets(
  filter?: AssetFilterInput,
  page = 1,
  pageSize = 25
): Promise<ActionResult<{ rows: unknown[]; total: number }>> {
  return withPermission("assets", "read", async () => {
    const parsed = filter ? assetFilterSchema.parse(filter) : undefined;
    const where = buildAssetWhere(parsed);

    const [rows, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: { currentHolder: true },
        orderBy: { itemCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({ where }),
    ]);

    const computedRows = rows.map((asset) => ({
      ...asset,
      remainingQuantity: computeRemainingQuantity(
        asset.quantity,
        asset.assignedQuantity
      ),
      ...computeAssetFlags(asset),
    }));

    return { rows: computedRows, total };
  });
}

export async function getAssetById(
  id: string
): Promise<ActionResult<unknown | null>> {
  return withPermission("assets", "read", async () => {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        currentHolder: true,
        movements: {
          include: { fromStaff: true, toStaff: true },
          orderBy: { movementDate: "desc" },
        },
      },
    });

    if (!asset) return null;

    return {
      ...asset,
      remainingQuantity: computeRemainingQuantity(
        asset.quantity,
        asset.assignedQuantity
      ),
      ...computeAssetFlags(asset),
    };
  });
}

const MOVEMENT_STATUS_MAP: Record<string, string> = {
  ASSIGNED_TO_EMPLOYEE: "ASSIGNED",
  RETURNED_FROM_EMPLOYEE: "AVAILABLE",
  GONE_FOR_REPAIR: "UNDER_MAINTENANCE",
  RETURNED_FROM_REPAIR: "AVAILABLE",
  TRASH: "DISPOSED",
  NOT_WORKING: "NOT_WORKING",
  TRANSFERRED: "ASSIGNED",
};

export async function createAssetMovement(
  input: AssetMovementCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "update", async (user) => {
    const parsed = assetMovementCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const asset = await prisma.asset.findUnique({
      where: { id: parsed.assetId },
    });
    if (!asset) throw new Error("Asset not found");

    if (
      parsed.movementType === "ASSIGNED_TO_EMPLOYEE" &&
      asset.status === "ASSIGNED"
    ) {
      throw new Error(
        "This asset is already assigned. Please return it first, or use 'Transfer to another Employee' instead."
      );
    }

    if (
      parsed.movementType === "TRANSFERRED" &&
      asset.status !== "ASSIGNED"
    ) {
      throw new Error(
        "Cannot transfer an asset that is not currently assigned to anyone. Use 'Given to Employee' instead."
      );
    }


    const newStatus = MOVEMENT_STATUS_MAP[parsed.movementType] ?? asset.status;
    const newHolderId =
      parsed.movementType === "ASSIGNED_TO_EMPLOYEE" ||
      parsed.movementType === "TRANSFERRED"
        ? parsed.toStaffId ?? null
        : parsed.movementType === "RETURNED_FROM_EMPLOYEE" ||
          parsed.movementType === "RETURNED_FROM_REPAIR"
        ? null
        : asset.currentHolderId;

    const movement = await prisma.assetMovement.create({
      data: {
        assetId: parsed.assetId,
        movementType: parsed.movementType,
        fromStaffId: parsed.fromStaffId ?? asset.currentHolderId ?? null,
        toStaffId: parsed.toStaffId ?? null,
        notes: parsed.notes,
      },
    });

    await prisma.asset.update({
      where: { id: parsed.assetId },
      data: {
        status: newStatus as never,
        currentHolderId: newHolderId,
      },
    });

    await audit(user.id, "create", "AssetMovement", movement.id, {
      assetId: parsed.assetId,
      movementType: parsed.movementType,
      fromStaffId: parsed.fromStaffId,
      toStaffId: parsed.toStaffId,
    });

    revalidatePath("/dashboard/property");
    return { id: movement.id };
  });
}

export async function getAssetMovements(
  assetId: string
): Promise<ActionResult<unknown[]>> {
  return withPermission("assets", "read", async () => {
    const movements = await prisma.assetMovement.findMany({
      where: { assetId },
      include: { fromStaff: true, toStaff: true },
      orderBy: { movementDate: "desc" },
    });
    return movements;
  });
}
