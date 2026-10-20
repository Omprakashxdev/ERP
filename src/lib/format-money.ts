import type { Decimal } from "@prisma/client/runtime/library";

/**
 * Format a money value for display with Indian digit grouping.
 * String-based arithmetic only — Decimal(23,6) values are never passed
 * through Number(), so large magnitudes keep full precision.
 * Rounds half-up at maxDecimals (minimum two decimals shown).
 */
export function formatMoney(
  value: Decimal | string | number | null | undefined,
  maxDecimals = 2
): string {
  if (value === null || value === undefined) return "—";
  const s = String(value);
  const negative = s.startsWith("-");
  const [intStr, fracStr = ""] = (negative ? s.slice(1) : s).split(".");
  // Round half-up on the digit string — no Number() conversion, so
  // Decimal(23,6) magnitudes keep full precision. Keep at least two
  // decimals, at most maxDecimals.
  const keep = fracStr.length <= 2 ? 2 : Math.min(fracStr.length, maxDecimals);
  const fracDigits = fracStr.padEnd(keep, "0").slice(0, keep).split("");
  let intDigits = intStr.replace(/^0+/, "") || "0";
  if (Number(fracStr[keep] ?? "0") >= 5) {
    let i = keep - 1;
    while (i >= 0 && fracDigits[i] === "9") {
      fracDigits[i] = "0";
      i--;
    }
    if (i < 0) intDigits = (BigInt(intDigits) + BigInt(1)).toString();
    else fracDigits[i] = String(Number(fracDigits[i]) + 1);
  }
  const frac = fracDigits.join("");
  const grouped =
    intDigits.length <= 3
      ? intDigits
      : `${intDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${intDigits.slice(-3)}`;
  return `${negative ? "-" : ""}₹${grouped}.${frac}`;
}
