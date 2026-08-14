"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
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

export async function createAsset(
  input: AssetCreateInput
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "create", async (user) => {
    const parsed = assetCreateSchema.parse(input);
    await checkRateLimit(user.id);

    const asset = await prisma.asset.create({
      data: { ...parsed, itemCode: generateItemCode() },
    });

    await audit(user.id, "create", "Asset", asset.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/assets");
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

    const asset = await prisma.asset.update({ where: { id }, data });

    await audit(user.id, "update", "Asset", asset.id, {
      input: await sanitizeForAudit(parsed as Record<string, unknown>),
    });

    revalidatePath("/dashboard/assets");
    return { id: asset.id };
  });
}

export async function deleteAsset(
  id: string
): Promise<ActionResult<{ id: string }>> {
  return withPermission("assets", "delete", async (user) => {
    await checkRateLimit(user.id);

    const asset = await prisma.asset.delete({ where: { id } });

    await audit(user.id, "delete", "Asset", asset.id, {});

    revalidatePath("/dashboard/assets");
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
        "This asset is already assigned. Please return it or use 'Transfer' instead."
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

    revalidatePath("/dashboard/assets");
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
