-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('BUILDING', 'WATER_SUPPLY', 'UGD', 'ROAD', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('DPR', 'SUPERVISION', 'PMC', 'TPI', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('TEAM_LEADER', 'PROJECT_MANAGER', 'RESIDENTIAL_ENGINEER', 'DESIGN_ENGINEER', 'SITE_ENGINEER', 'OTHER');

-- CreateEnum
CREATE TYPE "DueBillStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'ON_HOLD', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "hashedPassword" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" VARCHAR(8),
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "employeeCode" TEXT,
    "designation" TEXT,
    "regionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contractAmount" DECIMAL(19,2),
    "agreementDate" TIMESTAMP(3),
    "workOrderDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" VARCHAR(8),
    "address" TEXT,
    "agreementDate" TIMESTAMP(3),
    "workOrderDate" TIMESTAMP(3) NOT NULL,
    "timeLimitMonths" DECIMAL(8,4) NOT NULL,
    "additionalTimeMonths" DECIMAL(8,4),
    "targetTimeLimitMonths" DECIMAL(8,4),
    "stipulatedCompletionDate" TIMESTAMP(3),
    "targetCompletionDate" TIMESTAMP(3),
    "estimatedCost" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "totalFee" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "workType" "WorkType" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "contractorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "allocation" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFeeStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "percentage" DECIMAL(5,2),
    "amount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFeeStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundFlow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "miscExp" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "staffExp" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "totalProjectCost" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "completedWorkAmt" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "proposedDueBillAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "feeReceived" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueBill" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "grossAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "sgst" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "cgst" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "billAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "chequeAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "sd" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "itTds" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "receivedAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "billDate" TIMESTAMP(3),
    "receiveDate" TIMESTAMP(3),
    "status" "DueBillStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DueBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_abbreviation_key" ON "Client"("name", "abbreviation");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_employeeCode_key" ON "Staff"("employeeCode");

-- CreateIndex
CREATE INDEX "Staff_regionId_idx" ON "Staff"("regionId");

-- CreateIndex
CREATE INDEX "Project_regionId_idx" ON "Project"("regionId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_workOrderDate_idx" ON "Project"("workOrderDate");

-- CreateIndex
CREATE UNIQUE INDEX "Project_clientId_name_key" ON "Project"("clientId", "name");

-- CreateIndex
CREATE INDEX "ProjectAssignment_projectId_idx" ON "ProjectAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectAssignment_staffId_idx" ON "ProjectAssignment"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssignment_projectId_staffId_role_key" ON "ProjectAssignment"("projectId", "staffId", "role");

-- CreateIndex
CREATE INDEX "ProjectFeeStage_projectId_idx" ON "ProjectFeeStage"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FundFlow_projectId_key" ON "FundFlow"("projectId");

-- CreateIndex
CREATE INDEX "DueBill_projectId_idx" ON "DueBill"("projectId");

-- CreateIndex
CREATE INDEX "DueBill_status_idx" ON "DueBill"("status");

-- CreateIndex
CREATE INDEX "DueBill_billDate_idx" ON "DueBill"("billDate");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssignment" ADD CONSTRAINT "ProjectAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeeStage" ADD CONSTRAINT "ProjectFeeStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundFlow" ADD CONSTRAINT "FundFlow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueBill" ADD CONSTRAINT "DueBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
