import { z } from "zod";
import { Prisma } from "@prisma/client";
import { cleanedString, cuid, money } from "./shared";

function notFutureDate(d: Date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d <= now;
}

const tadaClaimBaseSchema = z.object({
  staffId: cuid,
  tourPurpose: cleanedString(500),
  fromDate: z.coerce.date().refine(notFutureDate, {
    message: "From date cannot be in the future",
  }),
  toDate: z.coerce.date().refine(notFutureDate, {
    message: "To date cannot be in the future",
  }),
  location: cleanedString(200),
  travelExpense: money.default(new Prisma.Decimal("0.00")),
  accommodationExp: money.default(new Prisma.Decimal("0.00")),
  foodExpense: money.default(new Prisma.Decimal("0.00")),
  localConveyance: money.default(new Prisma.Decimal("0.00")),
  otherExpense: money.default(new Prisma.Decimal("0.00")),
  advanceAmount: money.optional().nullable(),
  billCopyPath: cleanedString(500).optional().nullable(),
});

export const tadaClaimCreateSchema = tadaClaimBaseSchema.refine(
  (data) => data.toDate >= data.fromDate,
  {
    message: "To date must be on or after From date",
    path: ["toDate"],
  }
);

export const tadaClaimUpdateSchema = tadaClaimBaseSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .refine(
    (data) => {
      if (!data.fromDate || !data.toDate) return true;
      return data.toDate >= data.fromDate;
    },
    {
      message: "To date must be on or after From date",
      path: ["toDate"],
    }
  );

export const tadaClaimFilterSchema = z.object({
  search: z.string().optional(),
  staffId: z.string().cuid().optional(),
  status: z
    .enum([
      "DRAFT",
      "SUBMITTED",
      "MANAGER_APPROVED",
      "MANAGER_REJECTED",
      "ACCOUNTS_VERIFIED",
      "ACCOUNTS_QUERY",
      "FINANCE_APPROVED",
      "PAID",
    ])
    .optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const tadaApprovalSchema = z.object({
  id: z.string().cuid(),
  action: z.enum([
    "manager_approve",
    "manager_reject",
    "accounts_verify",
    "accounts_query",
    "finance_approve",
    "mark_paid",
  ]),
  remarks: cleanedString(1000).optional().nullable(),
  paymentMode: cleanedString(100).optional().nullable(),
});

export type TadaClaimCreateInput = z.infer<typeof tadaClaimCreateSchema>;
export type TadaClaimUpdateInput = z.infer<typeof tadaClaimUpdateSchema>;
export type TadaClaimFilterInput = z.infer<typeof tadaClaimFilterSchema>;
export type TadaApprovalInput = z.infer<typeof tadaApprovalSchema>;
