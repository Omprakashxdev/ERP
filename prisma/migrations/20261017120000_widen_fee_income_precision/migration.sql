-- FF precision fix: widen Project.totalFee and FundFlowMonthly.income to
-- DECIMAL(23,6) — preserves 17 integer digits (unchanged) and allows six
-- fractional digits for workbook-sourced fee/installment values.
-- Lossless widening: existing values are preserved exactly.

ALTER TABLE "Project"
  ALTER COLUMN "totalFee" TYPE DECIMAL(23, 6);

ALTER TABLE "FundFlowMonthly"
  ALTER COLUMN "income" TYPE DECIMAL(23, 6);
