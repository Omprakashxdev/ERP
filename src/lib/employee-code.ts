import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Issue the next SAECnnn employee code.
 *
 * Concurrency-safe: the counter row is inserted/incremented in a single
 * statement, so concurrent creators serialize on the row lock and can never
 * receive the same code. Self-seeds from the highest existing SAECnnn code
 * (covers db-push environments where the migration seed never ran) and
 * GREATEST-resyncs if the counter ever falls behind real data. Burned
 * numbers from rolled-back transactions are never reused.
 */
export async function issueEmployeeCode(
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  const rows = await db.$queryRaw<{ seq: number }[]>`
    INSERT INTO "EmployeeCodeCounter" ("scope", "lastSeq")
    SELECT 'SAEC',
      COALESCE(MAX(CAST(SUBSTRING("employeeCode" FROM 'SAEC([0-9]+)') AS INTEGER)), 0) + 1
    FROM "Staff"
    ON CONFLICT ("scope") DO UPDATE
    SET "lastSeq" = GREATEST(
      "EmployeeCodeCounter"."lastSeq",
      (SELECT COALESCE(MAX(CAST(SUBSTRING("employeeCode" FROM 'SAEC([0-9]+)') AS INTEGER)), 0) FROM "Staff")
    ) + 1
    RETURNING "lastSeq" AS "seq"
  `;
  const seq = rows[0]?.seq;
  if (!seq) throw new Error("Failed to issue employee code");
  return `SAEC${String(seq).padStart(3, "0")}`;
}
