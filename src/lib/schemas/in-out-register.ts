import { z } from "zod";
import { cleanedString, cuid } from "./shared";

function isNotFutureCalendarDate(d: Date): boolean {
  // 24-hour buffer allows for timezone differences (e.g. IST UTC+5:30 vs UTC midnight)
  const maxAllowed = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d <= maxAllowed;
}

const inOutRegisterBaseFields = z.object({
  direction: z.enum(["INWARD", "OUTWARD"]).default("INWARD"),
  documentDate: z.coerce.date({
    error: "Document date is required and must be a valid date",
  }).refine((d) => isNotFutureCalendarDate(d), "Document date cannot be in the future"),
  receivedDate: z.coerce.date({
    error: "Received/Sent date is required and must be a valid date",
  }).refine((d) => isNotFutureCalendarDate(d), "Received/Sent date cannot be in the future"),
  serialNo: cleanedString(100).optional().nullable(),
  documentRefNo: cleanedString(100).optional().nullable(),
  details: cleanedString(500).optional().nullable(),
  clientId: cuid,
  actionSuggestedStaffId: z.string().cuid().optional().nullable(),
  ccStaffIds: z.array(cuid).optional(),
  documents: z.array(cleanedString(500)).optional(),
  inwardType: z.enum(["INFORMATIVE", "ACTION_REQUIRED", "COMPLAINT", "QUERY", "NOTICE"]).optional().nullable(),
  receivedByPersonName: cleanedString(200).optional().nullable(),
  department: cleanedString(200).optional().nullable(),
  replyDueDate: z.coerce.date().optional().nullable(),
  parentInwardId: z.string().cuid().optional().nullable(),
});

export const inOutRegisterCreateSchema = inOutRegisterBaseFields.refine(
  (data) => data.receivedDate >= data.documentDate,
  {
    message: "Received/Sent date cannot be before document date",
    path: ["receivedDate"],
  }
).refine(
  (data) => !data.replyDueDate || data.replyDueDate >= data.documentDate,
  {
    message: "Reply due date cannot be before document date",
    path: ["replyDueDate"],
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
      if (!data.replyDueDate || !data.documentDate) return true;
      return data.replyDueDate >= data.documentDate;
    },
    {
      message: "Reply due date cannot be before document date",
      path: ["replyDueDate"],
    }
  );

export const inOutRegisterFilterSchema = z.object({
  search: z.string().optional(),
  direction: z.enum(["INWARD", "OUTWARD", "null"]).optional(),
  clientId: z.string().cuid().optional(),
  actionSuggestedStaffId: z.string().cuid().optional(),
  ccStaffId: z.string().cuid().optional(),
  hasDeadline: z.enum(["true", "false"]).optional(),
  receivedDateFrom: z.coerce.date().optional(),
  receivedDateTo: z.coerce.date().optional(),
  ageDue: z.enum(["15", "20", "25"]).optional(),
  department: z.string().optional(),
  replyDueDateFrom: z.coerce.date().optional(),
  replyDueDateTo: z.coerce.date().optional(),
});

export type InOutRegisterCreateInput = z.infer<typeof inOutRegisterCreateSchema>;
export type InOutRegisterUpdateInput = z.infer<typeof inOutRegisterUpdateSchema>;
export type InOutRegisterFilterInput = z.infer<typeof inOutRegisterFilterSchema>;
