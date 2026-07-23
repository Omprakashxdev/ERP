"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  assetCreateSchema,
  assetUpdateSchema,
  assetFilterSchema,
  AssetCreateInput,
  AssetUpdateInput,
  AssetFilterInput,
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
    const asset = await prisma.asset.findUnique({ where: { id } });

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
