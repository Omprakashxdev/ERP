import { z } from "zod";
import {
  Prisma,
  ProjectRole,
  ProjectStatus,
} from "@prisma/client";
import { cleanedString, money, months, optionalCuid } from "./shared";

export const projectAssignmentSchema = z.object({
  staffId: z.string().cuid(),
  role: z.nativeEnum(ProjectRole),
  allocation: z.coerce
    .number()
    .min(0, "Allocation must be at least 0")
    .max(1, "Allocation must be at most 1")
    .optional()
    .nullable(),
});

export const projectFeeStageSchema = z.object({
  id: optionalCuid,
  stageName: cleanedString(100),
  percentage: z.coerce
    .number()
    .min(0, "Percentage must be at least 0")
    .max(100, "Percentage must be at most 100")
    .optional()
    .nullable(),
  amount: money,
  dueDate: z.coerce.date().optional().nullable(),
});

export const projectCreateSchema = z.object({
  regionId: z.string().cuid(),
  clientId: z.string().cuid(),
  name: cleanedString(200),
  abbreviation: cleanedString(8).optional().nullable(),
  address: cleanedString(500).optional().nullable(),
  agreementDate: z.coerce.date().optional().nullable(),
  workOrderDate: z.coerce.date(),
  timeLimitMonths: months,
  additionalTimeMonths: months.optional().nullable(),
  targetTimeLimitMonths: months.optional().nullable(),
  stipulatedCompletionDate: z.coerce.date().optional().nullable(),
  targetCompletionDate: z.coerce.date().optional().nullable(),
  estimatedCost: money.default(new Prisma.Decimal("0.00")),
  totalFee: money.default(new Prisma.Decimal("0.00")),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
  workType: z.string(),
  serviceType: z.string(),
  contractorId: optionalCuid,
  assignments: z.array(projectAssignmentSchema).optional(),
  feeStages: z.array(projectFeeStageSchema).optional(),
});

export const projectUpdateSchema = projectCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ regionId: true });

export const projectFilterSchema = z.object({
  regionId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  workType: z.string().optional(),
  serviceType: z.string().optional(),
  workOrderDateFrom: z.coerce.date().optional(),
  workOrderDateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectFilterInput = z.infer<typeof projectFilterSchema>;
