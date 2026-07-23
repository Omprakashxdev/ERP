import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  VehicleStatus,
  JourneyApprovalStatus,
} from "@prisma/client";
import { cleanedString, money, cuid } from "./shared";

export const vehicleCreateSchema = z.object({
  registrationNumber: cleanedString(50),
  make: cleanedString(100).optional().nullable(),
  model: cleanedString(100).optional().nullable(),
  year: z.coerce.number().int().min(1900).optional().nullable(),
  status: z.nativeEnum(VehicleStatus).default(VehicleStatus.ACTIVE),

  rcNumber: cleanedString(100).optional().nullable(),
  rcExpiryDate: z.coerce.date().optional().nullable(),
  rcCopyPath: cleanedString(500).optional().nullable(),

  insurancePolicyNumber: cleanedString(100).optional().nullable(),
  insuranceExpiryDate: z.coerce.date().optional().nullable(),
  insuranceCopyPath: cleanedString(500).optional().nullable(),

  pucExpiryDate: z.coerce.date().optional().nullable(),
  pucCopyPath: cleanedString(500).optional().nullable(),

  tyreWarrantyExpiryDate: z.coerce.date().optional().nullable(),
  batteryWarrantyExpiryDate: z.coerce.date().optional().nullable(),
});

export const vehicleUpdateSchema = vehicleCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const vehicleFilterSchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
});

const kmField = z
  .union([z.string(), z.number()])
  .transform((value) =>
    typeof value === "string" ? Number(value) : Number(value)
  )
  .superRefine((value, ctx) => {
    if (Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kilometers must be a non-negative number",
      });
    }
  })
  .transform((value) => new Prisma.Decimal(Number(value.toFixed(2))));

export const journeyLogCreateSchema = z.object({
  vehicleId: cuid,
  journeyDate: z.coerce.date(),
  fromLocation: cleanedString(200),
  toLocation: cleanedString(200),
  startKm: kmField,
  endKm: kmField,
  totalKm: kmField.optional().nullable(),

  fuelExpense: money.optional().nullable(),
  serviceExpense: money.optional().nullable(),
  maintenanceExpense: money.optional().nullable(),
  taxExpense: money.optional().nullable(),

  driverName: cleanedString(120).optional().nullable(),
  purpose: cleanedString(500).optional().nullable(),
  approvalStatus: z
    .nativeEnum(JourneyApprovalStatus)
    .default(JourneyApprovalStatus.PENDING),
  rejectedReason: cleanedString(500).optional().nullable(),

  photos: z.array(cleanedString(500)).optional(),
});

export const journeyLogUpdateSchema = journeyLogCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ vehicleId: true });

export const journeyLogFilterSchema = z.object({
  search: z.string().optional(),
  vehicleId: z.string().cuid().optional(),
  approvalStatus: z.nativeEnum(JourneyApprovalStatus).optional(),
  journeyDateFrom: z.coerce.date().optional(),
  journeyDateTo: z.coerce.date().optional(),
});

export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
export type VehicleFilterInput = z.infer<typeof vehicleFilterSchema>;

export type JourneyLogCreateInput = z.infer<typeof journeyLogCreateSchema>;
export type JourneyLogUpdateInput = z.infer<typeof journeyLogUpdateSchema>;
export type JourneyLogFilterInput = z.infer<typeof journeyLogFilterSchema>;
