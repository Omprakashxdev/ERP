import { z } from "zod";
import { Prisma } from "@prisma/client";
import { sanitizeInput } from "@/lib/sanitize";

function toNumber(value: string | number): number {
  return typeof value === "string" ? Number(sanitizeInput(value)) : Number(value);
}

export const money = z
  .union([z.string(), z.number()])
  .transform(toNumber)
  .superRefine((value, ctx) => {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid amount" });
      return;
    }
    const fixed = Number(value.toFixed(2));
    if (Math.abs(value - fixed) >= Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must have up to 2 decimal places",
      });
    }
  })
  .transform((value) => new Prisma.Decimal(Number(value).toFixed(2)));

export const positiveMoney = money.refine(
  (v) => Number(v.toString()) >= 0,
  "Amount must be non-negative"
);

export const months = z
  .union([z.string(), z.number()])
  .transform(toNumber)
  .superRefine((value, ctx) => {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid duration" });
      return;
    }
    if (value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration must be greater than 0",
      });
      return;
    }
    const fixed = Number(value.toFixed(4));
    if (Math.abs(value - fixed) >= Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration must have up to 4 decimal places",
      });
    }
  })
  .transform((value) => new Prisma.Decimal(Number(value).toFixed(4)));

export function cleanedString(max = 255) {
  return z
    .string()
    .transform((value) => sanitizeInput(value))
    .pipe(z.string().min(1, "Required").max(max, `Must be at most ${max} characters`));
}

export const optionalCuid = z
  .string()
  .cuid("Invalid reference")
  .optional()
  .nullable();

export const cuid = z.string().cuid("Invalid reference");
