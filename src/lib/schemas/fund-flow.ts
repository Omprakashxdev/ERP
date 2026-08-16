import { z } from "zod";
import { Prisma, ProjectStatus } from "@prisma/client";
import { money } from "./shared";

export const fundFlowCreateSchema = z.object({
  projectId: z.string().cuid(),
  miscExp: money.default(new Prisma.Decimal("0.00")),
  staffExp: money.default(new Prisma.Decimal("0.00")),
  totalProjectCost: money.default(new Prisma.Decimal("0.00")),
  completedWorkAmt: money.default(new Prisma.Decimal("0.00")),
  proposedDueBillAmount: money.default(new Prisma.Decimal("0.00")),
  feeReceived: money.default(new Prisma.Decimal("0.00")),
});

export const fundFlowUpdateSchema = fundFlowCreateSchema
  .partial()
  .extend({ projectId: z.string().cuid() });

export const fundFlowFilterSchema = z.object({
  regionId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  workType: z.string().optional(),
  serviceType: z.string().optional(),
  workOrderDateFrom: z.coerce.date().optional(),
  workOrderDateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type FundFlowCreateInput = z.infer<typeof fundFlowCreateSchema>;
export type FundFlowUpdateInput = z.infer<typeof fundFlowUpdateSchema>;
export type FundFlowFilterInput = z.infer<typeof fundFlowFilterSchema>;
