import { z } from "zod";
import { WipStatus, WipCoordinatorLevel } from "@prisma/client";
import { money, months, optionalCuid, cleanedString } from "./shared";

export const wipAssignmentSchema = z.object({
  staffId: z.string().cuid(),
  level: z.nativeEnum(WipCoordinatorLevel),
});

export const wipCreateSchema = z.object({
  projectId: z.string().cuid(),
  status: z.nativeEnum(WipStatus).default(WipStatus.NOT_STARTED),

  loiReceiptDate: z.coerce.date().optional().nullable(),
  agreementDate: z.coerce.date().optional().nullable(),
  workOrderDate: z.coerce.date().optional().nullable(),
  timeLimitMonths: months.optional().nullable(),
  stipulatedCompletionDate: z.coerce.date().optional().nullable(),
  targetCompletionDate: z.coerce.date().optional().nullable(),

  hoCoordinatorId: optionalCuid,
  roCoordinatorId: optionalCuid,

  securityDepositAmount: money.optional().nullable(),
  securityDepositStatus: cleanedString(40).optional().nullable(),
  securityDepositReturnDate: z.coerce.date().optional().nullable(),

  amountOfWorkDone: money.optional().nullable(),
  finalProgressAmount: money.optional().nullable(),

  raBill1Amount: money.optional().nullable(),
  raBill1Date: z.coerce.date().optional().nullable(),
  raBill1SaecFee: money.optional().nullable(),
  raBill1ProjectExpense: money.optional().nullable(),

  raBill2Amount: money.optional().nullable(),
  raBill2Date: z.coerce.date().optional().nullable(),
  raBill2SaecFee: money.optional().nullable(),
  raBill2ProjectExpense: money.optional().nullable(),

  raBill3Amount: money.optional().nullable(),
  raBill3Date: z.coerce.date().optional().nullable(),
  raBill3SaecFee: money.optional().nullable(),
  raBill3ProjectExpense: money.optional().nullable(),

  raBill4Amount: money.optional().nullable(),
  raBill4Date: z.coerce.date().optional().nullable(),
  raBill4SaecFee: money.optional().nullable(),
  raBill4ProjectExpense: money.optional().nullable(),

  annexure3aPath: cleanedString(500).optional().nullable(),
  completionCertificatePath: cleanedString(500).optional().nullable(),
  completionDate: z.coerce.date().optional().nullable(),

  remarks: cleanedString(500).optional().nullable(),
  assignments: z.array(wipAssignmentSchema).optional(),
});

export const wipUpdateSchema = wipCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ projectId: true });

export const wipFilterSchema = z.object({
  projectId: z.string().cuid().optional(),
  regionId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  status: z.nativeEnum(WipStatus).optional(),
  search: z.string().optional(),
});

export type WipCreateInput = z.infer<typeof wipCreateSchema>;
export type WipUpdateInput = z.infer<typeof wipUpdateSchema>;
export type WipFilterInput = z.infer<typeof wipFilterSchema>;
