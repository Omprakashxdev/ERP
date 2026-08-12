import { z } from "zod";
import { cleanedString, cuid } from "./shared";

const inOutRegisterBaseFields = z.object({
  direction: z.enum(["INWARD", "OUTWARD"]).default("INWARD"),
  documentDate: z.coerce.date({
    error: "Document date is required and must be a valid date",
  }).refine((d) => d <= new Date(), "Document date cannot be in the future"),
  receivedDate: z.coerce.date({
    error: "Received/Sent date is required and must be a valid date",
  }).refine((d) => d <= new Date(), "Received/Sent date cannot be in the future"),
  documentRefNo: cleanedString(100),
  details: cleanedString(500).optional().nullable(),
  clientId: cuid,
  actionSuggestedStaffId: z.string().cuid().optional().nullable(),
  ccStaffIds: z.array(cuid).optional(),
  documents: z.array(cleanedString(500)).optional(),
  replyDate: z.coerce.date().optional().nullable().refine(
    (d) => !d || d <= new Date(),
    "Reply date cannot be in the future"
  ),
  inwardType: z.enum(["INFORMATIVE", "ACTION_REQUIRED", "COMPLAINT", "QUERY", "NOTICE"]).optional().nullable(),
  receivedByPersonName: cleanedString(200).optional().nullable(),
});

export const inOutRegisterCreateSchema = inOutRegisterBaseFields.refine(
  (data) => data.receivedDate >= data.documentDate,
  {
    message: "Received/Sent date cannot be before document date",
    path: ["receivedDate"],
  }
).refine(
  (data) => !data.replyDate || data.replyDate >= data.receivedDate,
  {
    message: "Reply date cannot be before received/sent date",
    path: ["replyDate"],
  }
);

export const inOutRegisterUpdateSchema = inOutRegisterBaseFields
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ clientId: true })
  .refine(
    (data) => {
      if (!data.documentDate || !data.receivedDate) return true;
      return data.receivedDate >= data.documentDate;
    },
    {
      message: "Received/Sent date cannot be before document date",
      path: ["receivedDate"],
    }
  )
  .refine(
    (data) => {
      if (!data.replyDate || !data.receivedDate) return true;
      return data.replyDate >= data.receivedDate;
    },
    {
      message: "Reply date cannot be before received/sent date",
      path: ["replyDate"],
    }
  );

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
