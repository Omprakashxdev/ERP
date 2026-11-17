-- Brick 2: Mode Master + Letter pad for In-Out Register.
--
-- Fully additive:
--   1. New "ModeMaster" lookup table (id, name, isActive, timestamps).
--   2. Nullable "modeId" FK on "InOutRegister" -> "ModeMaster"
--      with ON DELETE RESTRICT so a Mode can never cascade-delete
--      register entries; modes are soft-deactivated via isActive.
--   3. Nullable "letterPad" text column on "InOutRegister".
--
-- No existing column, constraint, counter, document, task, CC staff,
-- attachment, audit or relationship is modified. Existing register rows
-- keep NULL modeId/letterPad until employees explicitly update them.
-- No seed modes are inserted.
--
-- Mode names are enforced unique after whitespace/case normalization via
-- a functional unique index on lower(btrim(name)); the application also
-- trims and case-insensitive-checks before writes.

CREATE TABLE IF NOT EXISTS "ModeMaster" (
    "id"        TEXT      NOT NULL,
    "name"      TEXT      NOT NULL,
    "isActive"  BOOLEAN   NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeMaster_pkey" PRIMARY KEY ("id")
);

-- Normalized uniqueness: "By Post", "by post ", "BY POST" collide.
CREATE UNIQUE INDEX IF NOT EXISTS "ModeMaster_name_key"
  ON "ModeMaster" (lower(btrim("name")));

ALTER TABLE "InOutRegister"
  ADD COLUMN IF NOT EXISTS "modeId" TEXT,
  ADD COLUMN IF NOT EXISTS "letterPad" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InOutRegister_modeId_fkey'
  ) THEN
    ALTER TABLE "InOutRegister"
      ADD CONSTRAINT "InOutRegister_modeId_fkey"
      FOREIGN KEY ("modeId") REFERENCES "ModeMaster"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InOutRegister_modeId_idx"
  ON "InOutRegister" ("modeId");

CREATE INDEX IF NOT EXISTS "ModeMaster_name_idx"
  ON "ModeMaster" ("name");
