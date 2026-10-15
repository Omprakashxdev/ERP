/**
 * Standard Indian Standard Time (IST / Asia/Kolkata) Date & Time Utilities
 * SAEC ERP operates strictly in Indian Standard Time (UTC+05:30).
 */

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

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns today's calendar date in IST (Asia/Kolkata) as "YYYY-MM-DD"
 */
export function getTodayISTDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Converts any Date or ISO string into "YYYY-MM-DD" in IST for HTML date inputs (<input type="date">)
 */
export function toInputDateIST(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Formats a Date or ISO string into standard Indian format (DD/MM/YYYY) in IST
 */
export function formatDateIST(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formats a Date or ISO string into full Indian date and time (DD/MM/YYYY, hh:mm A) in IST
 */
export function formatDateTimeIST(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Computes calendar age in days relative to today strictly in IST.
 * - Today in IST => 0 days
 * - Yesterday in IST => 1 day
 * - Never returns a negative number
 */
export function computeAgeInDaysIST(receivedDate: Date | string): number {
  if (!receivedDate) return 0;
  const receivedStr = toInputDateIST(receivedDate);
  const todayStr = getTodayISTDateString();

  const [ry, rm, rd] = receivedStr.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);

  const receivedUtc = Date.UTC(ry, rm - 1, rd);
  const todayUtc = Date.UTC(ty, tm - 1, td);

  const diffMs = todayUtc - receivedUtc;
  const diffDays = Math.round(diffMs / 86400000);
  return Math.max(0, diffDays);
}

/**
 * Returns the Indian Financial Year string (e.g. "2026-27") for a given date in IST.
 * Financial Year in India begins on April 1 and ends on March 31.
 */
export function getIndianFinancialYear(value?: Date | string | null): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [yearStr, monthStr] = value.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = (fyStart + 1).toString().slice(-2);
    return `${fyStart}-${fyEnd}`;
  }
  const dStr = value ? toInputDateIST(value) : getTodayISTDateString();
  if (!dStr) return getIndianFinancialYear(new Date());
  const [yearStr, monthStr] = dStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1 to 12
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = (fyStart + 1).toString().slice(-2);
  return `${fyStart}-${fyEnd}`;
}
