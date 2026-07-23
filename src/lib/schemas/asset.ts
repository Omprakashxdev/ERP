import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AssetStatus } from "@prisma/client";
import { cleanedString, money } from "./shared";

export const assetCreateSchema = z.object({
  name: cleanedString(200),
  category: cleanedString(100).optional().nullable(),
  make: cleanedString(100).optional().nullable(),
  model: cleanedString(100).optional().nullable(),
  yearOfPurchase: z.coerce.number().int().min(1900).optional().nullable(),
  quantity: money.default(new Prisma.Decimal("1.00")),
  securityCode: cleanedString(100).optional().nullable(),
  billWarrantyPath: cleanedString(500).optional().nullable(),

  assigneeType: z.enum(["PERSON", "OFFICE"]).optional().nullable(),
  assignee: cleanedString(120).optional().nullable(),
  assignedQuantity: money.optional().nullable(),
  responsiblePerson: cleanedString(120).optional().nullable(),

  status: z.nativeEnum(AssetStatus).default(AssetStatus.AVAILABLE),
  remarks: cleanedString(500).optional().nullable(),
});

export const assetUpdateSchema = assetCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const assetFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  yearOfPurchase: z.coerce.number().int().min(1900).optional(),
});

export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;
export type AssetFilterInput = z.infer<typeof assetFilterSchema>;
