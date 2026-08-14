import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AssetStatus } from "@prisma/client";
import { cleanedString, money, cuid, optionalCuid } from "./shared";

const assetBaseSchema = z.object({
  name: cleanedString(200),
  category: cleanedString(100).optional().nullable(),
  make: cleanedString(100).optional().nullable(),
  model: cleanedString(100).optional().nullable(),
  yearOfPurchase: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
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

export const assetCreateSchema = assetBaseSchema.refine(
  (data) => {
    const qty = Number(data.quantity ?? 1);
    const assigned = Number(data.assignedQuantity ?? 0);
    return assigned <= qty;
  },
  {
    message: "Assigned quantity cannot exceed total quantity",
    path: ["assignedQuantity"],
  }
);

export const assetUpdateSchema = assetBaseSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .refine(
    (data) => {
      // For updates, we don't strictly know original quantity if it's not passed,
      // but if both are provided, we can validate.
      if (data.quantity !== undefined && data.assignedQuantity !== undefined) {
        const qty = Number(data.quantity ?? 1);
        const assigned = Number(data.assignedQuantity ?? 0);
        return assigned <= qty;
      }
      return true;
    },
    {
      message: "Assigned quantity cannot exceed total quantity",
      path: ["assignedQuantity"],
    }
  );

export const assetFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  yearOfPurchase: z.coerce.number().int().min(1900).optional(),
});

export const assetMovementCreateSchema = z.object({
  assetId: cuid,
  movementType: z.enum([
    "ASSIGNED_TO_EMPLOYEE",
    "RETURNED_FROM_EMPLOYEE",
    "GONE_FOR_REPAIR",
    "RETURNED_FROM_REPAIR",
    "TRASH",
    "NOT_WORKING",
    "TRANSFERRED",
  ]),
  fromStaffId: optionalCuid,
  toStaffId: optionalCuid,
  notes: cleanedString(500).optional().nullable(),
});

export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;
export type AssetFilterInput = z.infer<typeof assetFilterSchema>;
export type AssetMovementCreateInput = z.infer<typeof assetMovementCreateSchema>;
