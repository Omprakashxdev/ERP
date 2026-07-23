import { z } from "zod";
import { Prisma, DueBillStatus } from "@prisma/client";
import { money, cleanedString } from "./shared";

export const dueBillCreateSchema = z.object({
  projectId: z.string().cuid(),
  scheme: cleanedString(100),
  grossAmount: money.default(new Prisma.Decimal("0.00")),
  sgst: money.default(new Prisma.Decimal("0.00")),
  cgst: money.default(new Prisma.Decimal("0.00")),
  chequeAmount: money.default(new Prisma.Decimal("0.00")),
  sd: money.default(new Prisma.Decimal("0.00")),
  itTds: money.default(new Prisma.Decimal("0.00")),
  billDate: z.coerce.date().optional().nullable(),
  receiveDate: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(DueBillStatus).default(DueBillStatus.PENDING),
  remarks: cleanedString(500).optional().nullable(),
  billCopyPath: cleanedString(500).optional().nullable(),
});

export const dueBillUpdateSchema = dueBillCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ projectId: true });

export const dueBillFilterSchema = z.object({
  projectId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  regionId: z.string().cuid().optional(),
  status: z.nativeEnum(DueBillStatus).optional(),
  scheme: z.string().optional(),
  billDateFrom: z.coerce.date().optional(),
  billDateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type DueBillCreateInput = z.infer<typeof dueBillCreateSchema>;
export type DueBillUpdateInput = z.infer<typeof dueBillUpdateSchema>;
export type DueBillFilterInput = z.infer<typeof dueBillFilterSchema>;
