import { Decimal } from "@prisma/client/runtime/library";

export function addMonths(date: Date, months: Decimal): Date {
  const value = months.toNumber();
  const wholeMonths = Math.trunc(value);
  const fractionalDays = Math.round((value - wholeMonths) * 30);

  const result = new Date(date);
  result.setMonth(result.getMonth() + wholeMonths);
  result.setDate(result.getDate() + fractionalDays);
  return result;
}
