import { z } from "zod";
import { WorkType, ServiceType } from "@prisma/client";
import { cleanedString, money } from "./shared";

export const contractorCreateSchema = z.object({
  name: cleanedString(200),
  contactPerson: cleanedString(120).optional().nullable(),
  phone: cleanedString(20).optional().nullable(),
  email: z.string().email("Invalid email").max(120).optional().nullable(),
  address: cleanedString(500).optional().nullable(),
  contractAmount: money.optional().nullable(),
  agreementDate: z.coerce.date().optional().nullable(),
  workOrderDate: z.coerce.date().optional().nullable(),

  tenderId: cleanedString(120).optional().nullable(),
  detailedOrder: cleanedString(255).optional().nullable(),
  workName: cleanedString(255).optional().nullable(),
  workType: z.nativeEnum(WorkType).optional().nullable(),
  serviceType: z.nativeEnum(ServiceType).optional().nullable(),
  dprReference: cleanedString(120).optional().nullable(),
  tsAaReference: cleanedString(120).optional().nullable(),

  scheduleBAmount: money.optional().nullable(),
  scheduleBPath: cleanedString(500).optional().nullable(),

  raBillDetails: cleanedString(1000).optional().nullable(),

  finalProgressAmount: money.optional().nullable(),
  finalProgressProjectExpense: money.optional().nullable(),

  workOrderCopyPath: cleanedString(500).optional().nullable(),
  drawingsPath: cleanedString(500).optional().nullable(),
  completionCertificatePath: cleanedString(500).optional().nullable(),
});

export const contractorUpdateSchema = contractorCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

export const contractorFilterSchema = z.object({
  search: z.string().optional(),
});

export type ContractorCreateInput = z.infer<typeof contractorCreateSchema>;
export type ContractorUpdateInput = z.infer<typeof contractorUpdateSchema>;
export type ContractorFilterInput = z.infer<typeof contractorFilterSchema>;
