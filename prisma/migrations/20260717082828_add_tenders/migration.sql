-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('UNDER_PREPARATION', 'SUBMITTED', 'UNDER_EVALUATION', 'WON', 'LOST', 'WITHDRAWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'UNDER_PREPARATION',
    "tenderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "tenderId" TEXT,
    "department" TEXT,
    "state" TEXT,
    "city" TEXT,
    "platform" TEXT,
    "workName" TEXT,
    "workType" "WorkType",
    "serviceType" "ServiceType",
    "preBidMeetingDate" TIMESTAMP(3),
    "preBidMeetingAttended" BOOLEAN NOT NULL DEFAULT false,
    "biddingLastDate" TIMESTAMP(3),
    "dateOfOpening" TIMESTAMP(3),
    "tenderFeeAmount" DECIMAL(19,2),
    "tenderFeeDate" TIMESTAMP(3),
    "tenderFeeMode" TEXT,
    "emdAmount" DECIMAL(19,2),
    "emdDate" TIMESTAMP(3),
    "emdMode" TEXT,
    "emdReturnCollectionDate" TIMESTAMP(3),
    "l1ContractorName" TEXT,
    "l1City" TEXT,
    "l1Amount" DECIMAL(19,2),
    "l2ContractorName" TEXT,
    "l2City" TEXT,
    "l2Amount" DECIMAL(19,2),
    "l3ContractorName" TEXT,
    "l3City" TEXT,
    "l3Amount" DECIMAL(19,2),
    "negotiationMeeting" TEXT,
    "advertisementCopyPath" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tender_status_idx" ON "Tender"("status");

-- CreateIndex
CREATE INDEX "Tender_biddingLastDate_idx" ON "Tender"("biddingLastDate");

-- CreateIndex
CREATE INDEX "Tender_tenderDate_idx" ON "Tender"("tenderDate");
