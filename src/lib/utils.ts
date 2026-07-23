import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Prisma } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function isDecimal(value: unknown): value is { toNumber(): number } {
  if (value instanceof Prisma.Decimal) return true;
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.toNumber === "function" && typeof v.toFixed === "function" && "d" in v && "e" in v && "s" in v;
}

function serializeValue(value: unknown): unknown {
  if (isDecimal(value)) {
    return value.toNumber();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value instanceof Date) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeValue(v);
  }
  return out;
}

export function serialize<T>(data: T): T {
  return serializeValue(data) as T;
}
