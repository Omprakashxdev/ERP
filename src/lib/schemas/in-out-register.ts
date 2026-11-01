import { z } from "zod";
import { cleanedString, cuid } from "./shared";

function isNotFutureCalendarDate(d: Date): boolean {
  // 24-hour buffer allows for timezone differences (e.g. IST UTC+5:30 vs UTC midnight)
  const maxAllowed = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d <= maxAllowed;
}

const LEGACY_INWARD_TYPES = ["INFORMATIVE", "ACTION_REQUIRED", "COMPLAINT", "QUERY", "NOTICE"] as const;
// Only these two types may be chosen for NEW inward entries (customer
// requirement). Older values remain valid on stored records and updates.
const NEW_INWARD_TYPES = ["INFORMATIVE", "ACTION_REQUIRED"] as const;

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
  modeId: z.string().cuid().optional().nullable(),
  letterPad: cleanedString(200).optional().nullable(),
  ccStaffIds: z.array(cuid).optional(),
  documents: z.array(cleanedString(500)).optional(),
  inwardType: z.enum(LEGACY_INWARD_TYPES).optional().nullable(),
  receivedByPersonName: cleanedString(200).optional().nullable(),
  receivedByStaffId: z.string().cuid().optional().nullable(),
  department: cleanedString(200).optional().nullable(),
  replyDueDate: z.coerce.date().optional().nullable(),
  parentInwardId: z.string().cuid().optional().nullable(),
  projectId: z.string().cuid().optional().nullable(),
});

export const inOutRegisterCreateSchema = inOutRegisterBaseFields
  .extend({
    // Customer requirement: employee-entered document number and the
    // "Action suggested to" staff assignment are mandatory for every new
    // entry, inward and outward alike. Legacy NULLs stay untouched.
    documentRefNo: cleanedString(100),
    actionSuggestedStaffId: cuid,
  })
  .refine(
    (data) => data.direction !== "INWARD" ||
      data.inwardType == null ||
      (NEW_INWARD_TYPES as readonly string[]).includes(data.inwardType),
    {
      message: "Inward type must be Informative or Action Required",
      path: ["inwardType"],
    }
  )
  .refine(
    (data) => data.receivedDate >= data.documentDate,
    {
      message: "Received/Sent date cannot be before document date",
      path: ["receivedDate"],
    }
  )
  .refine(
    (data) => !data.replyDueDate || data.replyDueDate >= data.documentDate,
    {
      message: "Reply due date cannot be before document date",
      path: ["replyDueDate"],
    }
  )
  .refine(
    // Project linkage is an Inward-register concept only — an Outward
    // reply inherits the linked Inward's project for display instead.
    (data) => data.direction === "INWARD" || !data.projectId,
    {
      message: "Related project can only be set on inward entries",
      path: ["projectId"],
    }
  );

export const inOutRegisterUpdateSchema = inOutRegisterBaseFields
  .partial()
  .extend({ id: z.string().cuid() })
  .omit({ clientId: true, direction: true })
  .extend({
    // Direction must not silently default to INWARD on update — the base
    // field's .default() survives .partial() and would flip every outward
    // record edited without an explicit direction.
    direction: z.enum(["INWARD", "OUTWARD"]).optional(),
  })
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
  projectId: z.string().cuid().optional(),
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
