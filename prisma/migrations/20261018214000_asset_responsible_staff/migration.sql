-- P3: stable Staff identity for Asset.responsiblePerson (property list gr
-- row 15). Additive nullable FK; existing responsiblePerson text preserved.
ALTER TABLE "Asset" ADD COLUMN "responsiblePersonId" TEXT;
CREATE INDEX "Asset_responsiblePersonId_idx" ON "Asset"("responsiblePersonId");
ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_responsiblePersonId_fkey"
  FOREIGN KEY ("responsiblePersonId") REFERENCES "Staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
