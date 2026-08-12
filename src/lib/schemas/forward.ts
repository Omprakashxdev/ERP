import { z } from "zod";
import { cleanedString, cuid } from "./shared";

export const forwardCreateSchema = z.object({
  entityType: z.enum(["TASK", "ASSET", "TADA_CLAIM", "DUE_BILL", "IN_OUT_REGISTER"]),
  entityId: cuid,
  toStaffId: cuid.optional().nullable(),
  remarks: cleanedString(1000).optional().nullable(),
});

export const forwardAcknowledgeSchema = z.object({
  id: cuid,
  status: z.enum(["ACKNOWLEDGED", "ACTIONED", "RETURNED"]),
  remarks: cleanedString(1000).optional().nullable(),
});

export type ForwardCreateInput = z.infer<typeof forwardCreateSchema>;
export type ForwardAcknowledgeInput = z.infer<typeof forwardAcknowledgeSchema>;
