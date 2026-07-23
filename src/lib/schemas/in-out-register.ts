import { z } from "zod";
import { cleanedString, cuid } from "./shared";

export const inOutRegisterCreateSchema = z.object({
  direction: z.enum(["INWARD", "OUTWARD"]).default("INWARD"),
  documentDate: z.coerce.date(),
  receivedDate: z.coerce.date(),
  documentRefNo: cleanedString(100),
  details: cleanedString(500).optional().nullable(),
  clientId: cuid,
  actionSuggestedStaffId: z.string().cuid().optional().nullable(),
  ccStaffIds: z.array(cuid).optional(),
  documents: z.array(cleanedString(500)).optional(),
  replyDate: z.coerce.date().optional().nullable(),
});

export const inOutRegisterUpdateSchema = inOutRegisterCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ clientId: true });

export const inOutRegisterFilterSchema = z.object({
  search: z.string().optional(),
  direction: z.enum(["INWARD", "OUTWARD"]).optional(),
  clientId: z.string().cuid().optional(),
  actionSuggestedStaffId: z.string().cuid().optional(),
  ccStaffId: z.string().cuid().optional(),
  hasReply: z.enum(["true", "false"]).optional(),
  receivedDateFrom: z.coerce.date().optional(),
  receivedDateTo: z.coerce.date().optional(),
  ageDue: z.enum(["15", "20", "25"]).optional(),
});

export type InOutRegisterCreateInput = z.infer<typeof inOutRegisterCreateSchema>;
export type InOutRegisterUpdateInput = z.infer<typeof inOutRegisterUpdateSchema>;
export type InOutRegisterFilterInput = z.infer<typeof inOutRegisterFilterSchema>;
