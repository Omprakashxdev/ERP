-- Phase FINAL: RA Bill fields per wip gr rows 17-20 and contractor gr row 17.
-- Additive, nullable; existing raBillNPath remains the bill copy.
ALTER TABLE "WorkInProgress"
  ADD COLUMN "raBill1WoNo" TEXT,
  ADD COLUMN "raBill1Details" TEXT,
  ADD COLUMN "raBill1CertificatePath" TEXT,
  ADD COLUMN "raBill1TestCopyPath" TEXT,
  ADD COLUMN "raBill2WoNo" TEXT,
  ADD COLUMN "raBill2Details" TEXT,
  ADD COLUMN "raBill2CertificatePath" TEXT,
  ADD COLUMN "raBill2TestCopyPath" TEXT,
  ADD COLUMN "raBill3WoNo" TEXT,
  ADD COLUMN "raBill3Details" TEXT,
  ADD COLUMN "raBill3CertificatePath" TEXT,
  ADD COLUMN "raBill3TestCopyPath" TEXT,
  ADD COLUMN "raBill4WoNo" TEXT,
  ADD COLUMN "raBill4Details" TEXT,
  ADD COLUMN "raBill4CertificatePath" TEXT,
  ADD COLUMN "raBill4TestCopyPath" TEXT;
