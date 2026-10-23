import { Decimal } from "@prisma/client/runtime/library";

/**
 * Confirmed Excel Fund Flow calculations (ERP - Work Flow Formats.xlsx,
 * "Fund Flow" sheet). Pure Decimal math — no rounding invention.
 */

/** Staff Exp. = Team Leader/PM + Residential + Design + Site + Misc (Excel col N). */
export function computeStaffExp(parts: {
  teamLeaderExp: Decimal | number | string;
  residentialEngineerExp: Decimal | number | string;
  designEngineerExp: Decimal | number | string;
  siteEngineerExp: Decimal | number | string;
  miscExp: Decimal | number | string;
}): Decimal {
  return new Decimal(parts.teamLeaderExp.toString())
    .plus(parts.residentialEngineerExp.toString())
    .plus(parts.designEngineerExp.toString())
    .plus(parts.siteEngineerExp.toString())
    .plus(parts.miscExp.toString());
}

/** remaining work amt = Total Project Cost − completed work amt. */
export function computeRemainingWorkAmt(
  totalProjectCost: Decimal | number | string,
  completedWorkAmt: Decimal | number | string
): Decimal {
  return new Decimal(totalProjectCost.toString()).minus(
    completedWorkAmt.toString()
  );
}

/** Total Fee = Total Project Cost × Fee percentage / 100 (exact, 6+ dp). */
export function computeTotalFee(
  totalProjectCost: Decimal | number | string,
  feePercentage: Decimal | number | string
): Decimal {
  return new Decimal(totalProjectCost.toString())
    .mul(feePercentage.toString())
    .div(100);
}

/** remaing fee = Total Fee − fee recvd. */
export function computeRemainingFee(
  totalFee: Decimal | number | string,
  feeReceived: Decimal | number | string
): Decimal {
  return new Decimal(totalFee.toString()).minus(feeReceived.toString());
}

/** Monthly distribution amount = remaing fee ÷ Target Time Limit (In Month), 6dp. */
export function computeMonthlyDistribution(
  remainingFee: Decimal | number | string,
  targetTimeLimitMonths: number
): Decimal {
  return new Decimal(remainingFee.toString())
    .div(targetTimeLimitMonths)
    .toDecimalPlaces(6);
}

/**
 * Split `amount` into `count` equal monthly installments at 6-decimal
 * precision. Every month except the last is amount ÷ count rounded to 6dp;
 * the last month absorbs the rounding residual so the installments always
 * sum to exactly `amount`.
 */
export function computeEqualInstallments(
  amount: Decimal | number | string,
  count: number
): Decimal[] {
  const total = new Decimal(amount.toString());
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Installment count must be a positive whole number.");
  }
  const perMonth = total.div(count).toDecimalPlaces(6);
  const installments: Decimal[] = Array.from(
    { length: count },
    () => perMonth
  );
  installments[count - 1] = total.minus(perMonth.mul(count - 1));
  return installments;
}
