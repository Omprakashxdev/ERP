-- CreateEnum
CREATE TYPE "WipStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WipCoordinatorLevel" AS ENUM ('L1', 'L2', 'L3', 'L4');

-- CreateTable
CREATE TABLE "WorkInProgress" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "WipStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "loiReceiptDate" TIMESTAMP(3),
    "agreementDate" TIMESTAMP(3),
    "workOrderDate" TIMESTAMP(3),
    "timeLimitMonths" DECIMAL(8,4),
    "stipulatedCompletionDate" TIMESTAMP(3),
    "targetCompletionDate" TIMESTAMP(3),
    "hoCoordinatorId" TEXT,
    "roCoordinatorId" TEXT,
    "securityDepositAmount" DECIMAL(19,2),
    "securityDepositStatus" TEXT,
    "securityDepositReturnDate" TIMESTAMP(3),
    "amountOfWorkDone" DECIMAL(19,2),
    "finalProgressAmount" DECIMAL(19,2),
    "raBill1Amount" DECIMAL(19,2),
    "raBill1Date" TIMESTAMP(3),
    "raBill1SaecFee" DECIMAL(19,2),
    "raBill1ProjectExpense" DECIMAL(19,2),
    "raBill2Amount" DECIMAL(19,2),
    "raBill2Date" TIMESTAMP(3),
    "raBill2SaecFee" DECIMAL(19,2),
    "raBill2ProjectExpense" DECIMAL(19,2),
    "raBill3Amount" DECIMAL(19,2),
    "raBill3Date" TIMESTAMP(3),
    "raBill3SaecFee" DECIMAL(19,2),
    "raBill3ProjectExpense" DECIMAL(19,2),
    "raBill4Amount" DECIMAL(19,2),
    "raBill4Date" TIMESTAMP(3),
    "raBill4SaecFee" DECIMAL(19,2),
    "raBill4ProjectExpense" DECIMAL(19,2),
    "annexure3aPath" TEXT,
    "completionCertificatePath" TEXT,
    "completionDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkInProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WipAssignment" (
    "id" TEXT NOT NULL,
    "workInProgressId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "level" "WipCoordinatorLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WipAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkInProgress_projectId_key" ON "WorkInProgress"("projectId");

-- CreateIndex
CREATE INDEX "WorkInProgress_projectId_idx" ON "WorkInProgress"("projectId");

-- CreateIndex
CREATE INDEX "WorkInProgress_status_idx" ON "WorkInProgress"("status");

-- CreateIndex
CREATE INDEX "WipAssignment_workInProgressId_idx" ON "WipAssignment"("workInProgressId");

-- CreateIndex
CREATE INDEX "WipAssignment_staffId_idx" ON "WipAssignment"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "WipAssignment_workInProgressId_staffId_level_key" ON "WipAssignment"("workInProgressId", "staffId", "level");

-- AddForeignKey
ALTER TABLE "WorkInProgress" ADD CONSTRAINT "WorkInProgress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkInProgress" ADD CONSTRAINT "WorkInProgress_hoCoordinatorId_fkey" FOREIGN KEY ("hoCoordinatorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkInProgress" ADD CONSTRAINT "WorkInProgress_roCoordinatorId_fkey" FOREIGN KEY ("roCoordinatorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipAssignment" ADD CONSTRAINT "WipAssignment_workInProgressId_fkey" FOREIGN KEY ("workInProgressId") REFERENCES "WorkInProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WipAssignment" ADD CONSTRAINT "WipAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
