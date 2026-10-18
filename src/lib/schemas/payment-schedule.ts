import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  PaymentScheduleCategory,
  PaymentScheduleStatus,
} from "@prisma/client";
import { positiveMoney, cleanedString } from "./shared";

function notFutureDate(d: Date | undefined) {
  if (!d) return true;
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return d <= endOfToday;
}

export const paymentScheduleCreateSchema = z
  .object({
    date: z.coerce.date().optional().refine(notFutureDate, "Date cannot be in the future"),
    dueDate: z.coerce.date().optional().nullable(),
    paymentType: cleanedString(100).optional().nullable(),
    category: z
      .nativeEnum(PaymentScheduleCategory)
      .default(PaymentScheduleCategory.GST),
    detail: cleanedString(500).optional().nullable(),
    amount: positiveMoney.default(new Prisma.Decimal("0.00")),
    status: z
      .nativeEnum(PaymentScheduleStatus)
      .refine(
        (s) => s !== PaymentScheduleStatus.CANCELLED,
        "Cannot create a payment schedule with CANCELLED status"
      )
      .default(PaymentScheduleStatus.PENDING),
    billCopyPath: cleanedString(500).optional().nullable(),
    remarks: cleanedString(500).optional().nullable(),
    /** Create a linked To-Do follow-up task for the due date (not stored
        on the PaymentSchedule row — handled by the action). */
    createFollowUpTask: z.boolean().optional(),
    /** Staff member responsible for the follow-up task. */
    followUpAssigneeId: cleanedString(50).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.date && data.dueDate) {
        // Normalize both dates to midnight to compare just the calendar days
        const dDate = new Date(data.date);
        dDate.setHours(0, 0, 0, 0);
        const due = new Date(data.dueDate);
        due.setHours(0, 0, 0, 0);
        return due >= dDate;
      }
      return true;
    },
    {
      message: "Due date cannot be before the payment schedule date",
      path: ["dueDate"],
    }
  )
  .refine(
    (data) => {
      if (data.createFollowUpTask && !data.dueDate) {
        return false;
      }
      return true;
    },
    {
      message: "A due date is required to create a follow-up task",
      path: ["createFollowUpTask"],
    }
  )
  .refine(
    (data) => {
      if (data.createFollowUpTask && !data.followUpAssigneeId) {
        return false;
      }
      return true;
    },
    {
      message: "Choose the employee responsible for the follow-up task",
      path: ["followUpAssigneeId"],
    }
  );

export const paymentScheduleUpdateSchema = z.object({
  id: z.string().cuid(),
  date: z.coerce.date().optional().refine(notFutureDate, "Date cannot be in the future"),
  dueDate: z.coerce.date().optional().nullable(),
  paymentType: cleanedString(100).optional().nullable(),
  category: z.nativeEnum(PaymentScheduleCategory).optional(),
  detail: cleanedString(500).optional().nullable(),
  amount: positiveMoney.optional(),
  status: z.nativeEnum(PaymentScheduleStatus).optional(),
  billCopyPath: cleanedString(500).optional().nullable(),
  remarks: cleanedString(500).optional().nullable(),
  createFollowUpTask: z.boolean().optional(),
  followUpAssigneeId: cleanedString(50).optional().nullable(),
}).refine(
  (data) => {
    if (data.date && data.dueDate) {
      const dDate = new Date(data.date);
      dDate.setHours(0, 0, 0, 0);
      const due = new Date(data.dueDate);
      due.setHours(0, 0, 0, 0);
      return due >= dDate;
    }
    return true;
  },
  {
    message: "Due date cannot be before the payment schedule date",
    path: ["dueDate"],
  }
).refine(
  (data) => {
    if (data.createFollowUpTask && !data.dueDate) {
      return false;
    }
    return true;
  },
  {
    message: "A due date is required to create a follow-up task",
    path: ["createFollowUpTask"],
  }
).refine(
  (data) => {
    if (data.createFollowUpTask && !data.followUpAssigneeId) {
      return false;
    }
    return true;
  },
  {
    message: "Choose the employee responsible for the follow-up task",
    path: ["followUpAssigneeId"],
  }
);

export const paymentScheduleFilterSchema = z.object({
  search: z.string().optional(),
  category: z.nativeEnum(PaymentScheduleCategory).optional(),
  status: z.nativeEnum(PaymentScheduleStatus).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
});

export type PaymentScheduleCreateInput = z.infer<
  typeof paymentScheduleCreateSchema
>;
export type PaymentScheduleUpdateInput = z.infer<
  typeof paymentScheduleUpdateSchema
>;
export type PaymentScheduleFilterInput = z.infer<
  typeof paymentScheduleFilterSchema
>;
