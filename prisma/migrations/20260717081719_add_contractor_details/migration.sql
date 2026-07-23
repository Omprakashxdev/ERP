-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "completionCertificatePath" TEXT,
ADD COLUMN     "detailedOrder" TEXT,
ADD COLUMN     "dprReference" TEXT,
ADD COLUMN     "drawingsPath" TEXT,
ADD COLUMN     "finalProgressAmount" DECIMAL(19,2),
ADD COLUMN     "finalProgressProjectExpense" DECIMAL(19,2),
ADD COLUMN     "raBillDetails" TEXT,
ADD COLUMN     "scheduleBAmount" DECIMAL(19,2),
ADD COLUMN     "scheduleBPath" TEXT,
ADD COLUMN     "serviceType" "ServiceType",
ADD COLUMN     "tenderId" TEXT,
ADD COLUMN     "tsAaReference" TEXT,
ADD COLUMN     "workName" TEXT,
ADD COLUMN     "workOrderCopyPath" TEXT,
ADD COLUMN     "workType" "WorkType";

-- CreateIndex
CREATE INDEX "Contractor_name_idx" ON "Contractor"("name");
