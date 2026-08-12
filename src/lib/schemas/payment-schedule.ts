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

export const paymentScheduleCreateSchema = z.object({
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
});

export const paymentScheduleUpdateSchema = paymentScheduleCreateSchema
  .partial()
  .extend({ id: z.string().cuid() });

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
