/**
 * Server-authoritative register serial issuance (INW|OUT/FY-YY/NNN).
 *
 * - FY is derived from the server-side issuance timestamp in Asia/Kolkata
 *   (Apr–Mar), never from client-controlled dates.
 * - Issuance is a single atomic INSERT..ON CONFLICT DO UPDATE on
 *   RegisterSerialCounter, inside the caller's transaction — concurrent
 *   creates cannot receive the same number and a rolled-back transaction
 *   rolls the counter back too.
 * - Issued numbers are permanent: counters never decrease, so edited or
 *   deleted entries never recycle a serial.
 * - On first touch the counter self-initializes from the maximum
 *   well-formed serial already in InOutRegister, preserving history.
 */
import { Prisma } from "@prisma/client";
import { getIndianFinancialYear } from "@/lib/date-utils";

type SerialDirection = "INWARD" | "OUTWARD";
type Tx = Prisma.TransactionClient;

function scopeFor(direction: SerialDirection, fy: string): string {
  return `${direction === "INWARD" ? "INW" : "OUT"}/${fy}`;
}

/**
 * Atomically issue the next serial for a direction inside transaction `tx`.
 * `issuedAt` defaults to the server clock (IST FY); pass an explicit Date
 * only from trusted server-side flows (e.g. backfill), never from input.
 */
export async function issueRegisterSerialNo(
  tx: Tx,
  direction: SerialDirection,
  issuedAt?: Date
): Promise<string> {
  const fy = getIndianFinancialYear(issuedAt ?? new Date());
  const scope = scopeFor(direction, fy);

  const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "RegisterSerialCounter" ("scope", "lastSeq")
    SELECT ${scope},
           COALESCE((
             SELECT MAX(NULLIF(regexp_replace(
               split_part("serialNo", '/', 3), '[^0-9]', '', 'g'), '')::int)
             FROM "InOutRegister"
             WHERE "serialNo" LIKE ${scope + '/%'}
           ), 0) + 1
    ON CONFLICT ("scope")
    DO UPDATE SET "lastSeq" = "RegisterSerialCounter"."lastSeq" + 1
    RETURNING "lastSeq";
  `;

  const seq = rows[0].lastSeq;
  return `${scope}/${String(seq).padStart(3, "0")}`;
}

/**
 * Raise the counter for an explicit serial (bulk import of historical
 * records). Keeps future issuance above any imported number without
 * renumbering it. No-op for malformed values.
 */
export async function bumpRegisterSerialCounter(
  tx: Tx,
  serialNo: string
): Promise<void> {
  const m = /^((?:INW|OUT))\/(\d{4}-\d{2})\/(\d+)$/i.exec(serialNo.trim());
  if (!m) return;
  const scope = `${m[1].toUpperCase()}/${m[2]}`;
  const seq = parseInt(m[3], 10);
  await tx.$executeRaw`
    INSERT INTO "RegisterSerialCounter" ("scope", "lastSeq")
    VALUES (${scope}, ${seq})
    ON CONFLICT ("scope")
    DO UPDATE SET "lastSeq" = GREATEST("RegisterSerialCounter"."lastSeq", ${seq});
  `;
}
