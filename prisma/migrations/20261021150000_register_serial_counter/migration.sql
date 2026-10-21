-- Permanent unique register serial numbers (INW|OUT/FY-YY/NNN)
-- Idempotent: safe on DBs where serialNo was already applied via db push.

-- 1. Monotonic counter table — one row per direction+FY scope
CREATE TABLE IF NOT EXISTS "RegisterSerialCounter" (
    "scope" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RegisterSerialCounter_pkey" PRIMARY KEY ("scope")
);

-- 2. Ensure serialNo exists (adds only if missing) and is unique
ALTER TABLE "InOutRegister" ADD COLUMN IF NOT EXISTS "serialNo" TEXT;
ALTER TABLE "InOutRegister" ALTER COLUMN "documentRefNo" DROP NOT NULL;
DROP INDEX IF EXISTS "InOutRegister_serialNo_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "InOutRegister_serialNo_key" ON "InOutRegister"("serialNo");

-- 3. Initialize counters from existing issued serials.
--    Only well-formed INW|OUT/FY-YY/NNN values seed the counters;
--    NULL and free-form legacy values are left untouched (nullable legacy preserved).
INSERT INTO "RegisterSerialCounter" ("scope", "lastSeq")
SELECT split_part("serialNo", '/', 1) || '/' || split_part("serialNo", '/', 2) AS scope,
       MAX(NULLIF(regexp_replace(split_part("serialNo", '/', 3), '[^0-9]', '', 'g'), '')::int) AS lastSeq
FROM "InOutRegister"
WHERE "serialNo" ~ '^(INW|OUT)/\d{4}-\d{2}/\d+$'
GROUP BY 1
ON CONFLICT ("scope") DO NOTHING;
