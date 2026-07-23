-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD');

-- CreateEnum
CREATE TYPE "JourneyApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "rcNumber" TEXT,
    "rcExpiryDate" TIMESTAMP(3),
    "rcCopyPath" TEXT,
    "insurancePolicyNumber" TEXT,
    "insuranceExpiryDate" TIMESTAMP(3),
    "insuranceCopyPath" TEXT,
    "pucExpiryDate" TIMESTAMP(3),
    "pucCopyPath" TEXT,
    "tyreWarrantyExpiryDate" TIMESTAMP(3),
    "batteryWarrantyExpiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "journeyDate" TIMESTAMP(3) NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "startKm" DECIMAL(10,2) NOT NULL,
    "endKm" DECIMAL(10,2) NOT NULL,
    "totalKm" DECIMAL(10,2) NOT NULL,
    "fuelExpense" DECIMAL(19,2),
    "serviceExpense" DECIMAL(19,2),
    "maintenanceExpense" DECIMAL(19,2),
    "taxExpense" DECIMAL(19,2),
    "driverName" TEXT,
    "purpose" TEXT,
    "approvalStatus" "JourneyApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyLogPhoto" (
    "id" TEXT NOT NULL,
    "journeyLogId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyLogPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNumber_key" ON "Vehicle"("registrationNumber");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_registrationNumber_idx" ON "Vehicle"("registrationNumber");

-- CreateIndex
CREATE INDEX "JourneyLog_vehicleId_idx" ON "JourneyLog"("vehicleId");

-- CreateIndex
CREATE INDEX "JourneyLog_journeyDate_idx" ON "JourneyLog"("journeyDate");

-- CreateIndex
CREATE INDEX "JourneyLog_approvalStatus_idx" ON "JourneyLog"("approvalStatus");

-- CreateIndex
CREATE INDEX "JourneyLogPhoto_journeyLogId_idx" ON "JourneyLogPhoto"("journeyLogId");

-- AddForeignKey
ALTER TABLE "JourneyLog" ADD CONSTRAINT "JourneyLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyLogPhoto" ADD CONSTRAINT "JourneyLogPhoto_journeyLogId_fkey" FOREIGN KEY ("journeyLogId") REFERENCES "JourneyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
