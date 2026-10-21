-- Confirmed Fund Flow fields (Excel "Fund Flow" sheet) — additive, safe.
-- Defaults only; NULL for fields we must not invent (feePercentage, Start month).

ALTER TABLE "FundFlow"
  ADD COLUMN IF NOT EXISTS "teamLeaderExp"          DECIMAL(19,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "residentialEngineerExp" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "designEngineerExp"      DECIMAL(19,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "siteEngineerExp"        DECIMAL(19,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "feePercentage"          DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "distributionStartMonth" INTEGER,
  ADD COLUMN IF NOT EXISTS "distributionStartYear"  INTEGER;
