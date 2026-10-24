-- In-Out Register: link "Received by" to the Staff master.
--
-- Fully additive:
--   Nullable "receivedByStaffId" FK on "InOutRegister" -> "Staff"
--   with ON DELETE SET NULL so removing a staff record never cascades
--   into register history.
--
-- The legacy free-text "receivedByPersonName" column is untouched —
-- historical manual values remain on their records and stay visible.
-- No names are auto-mapped to staff IDs; employees link a staff member
-- explicitly when they next edit an entry.
-- Existing register rows keep NULL receivedByStaffId.

ALTER TABLE "InOutRegister"
  ADD COLUMN IF NOT EXISTS "receivedByStaffId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InOutRegister_receivedByStaffId_fkey'
  ) THEN
    ALTER TABLE "InOutRegister"
      ADD CONSTRAINT "InOutRegister_receivedByStaffId_fkey"
      FOREIGN KEY ("receivedByStaffId") REFERENCES "Staff"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InOutRegister_receivedByStaffId_idx"
  ON "InOutRegister" ("receivedByStaffId");
