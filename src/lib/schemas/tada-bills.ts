import { z } from "zod";
import { Prisma } from "@prisma/client";
import { cleanedString, cuid, positiveMoney } from "./shared";

function notFutureDate(d: Date) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return d <= endOfToday;
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
  regionId: z.string().cuid().optional().nullable(),
  travelExpense: positiveMoney.default(new Prisma.Decimal("0.00")),
  accommodationExp: positiveMoney.default(new Prisma.Decimal("0.00")),
  foodExpense: positiveMoney.default(new Prisma.Decimal("0.00")),
  localConveyance: positiveMoney.default(new Prisma.Decimal("0.00")),
  otherExpense: positiveMoney.default(new Prisma.Decimal("0.00")),
  advanceAmount: positiveMoney.optional().nullable(),
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
