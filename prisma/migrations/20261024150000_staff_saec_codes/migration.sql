-- Standardize Staff employee codes to the SAECnnn format.
-- 1) previousEmployeeCode: auditable alias for the code a staff member had
--    before standardization (legacy imports/exports may still reference it).
-- 2) EmployeeCodeCounter: monotonic issuer for new codes — UPDATE increments
--    under a row lock so concurrent creates can never receive a duplicate.
-- 3) EMP001 → SAEC006 (verified production mapping; all other SAECnnn codes
--    are already correct). Guarded: skips silently when EMP001 is absent,
--    aborts loudly if SAEC006 is already taken.
-- 4) Seed the counter from the highest existing SAECnnn code so the next
--    issued code is SAEC007 on production.

ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "previousEmployeeCode" TEXT;

CREATE TABLE IF NOT EXISTS "EmployeeCodeCounter" (
  "scope" TEXT NOT NULL,
  "lastSeq" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "EmployeeCodeCounter_pkey" PRIMARY KEY ("scope")
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Staff" WHERE "employeeCode" = 'EMP001') THEN
    IF EXISTS (SELECT 1 FROM "Staff" WHERE "employeeCode" = 'SAEC006') THEN
      RAISE EXCEPTION 'Cannot standardize EMP001 → SAEC006: SAEC006 is already assigned to another staff member';
    END IF;
    UPDATE "Staff"
    SET "previousEmployeeCode" = 'EMP001',
        "employeeCode" = 'SAEC006'
    WHERE "employeeCode" = 'EMP001';
  END IF;
END $$;

INSERT INTO "EmployeeCodeCounter" ("scope", "lastSeq")
SELECT 'SAEC', COALESCE(
  MAX(CAST(SUBSTRING("employeeCode" FROM 'SAEC([0-9]+)') AS INTEGER)),
  0
)
FROM "Staff"
ON CONFLICT ("scope") DO NOTHING;
