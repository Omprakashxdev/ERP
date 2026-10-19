-- Safe Schema Drift Migration Draft
-- Generated from: prisma migrate diff --from-migrations --to-schema-datamodel
-- Destructive enum DROP COLUMN / ADD COLUMN blocks replaced with in-place ALTER COLUMN TYPE USING.
-- InOutRegister.replyDate and replyRefNo are PRESERVED (not dropped).
--
-- Apply this to a database that has all existing migrations deployed.
-- DO NOT apply to databases created via `prisma db push` from schema.prisma.
--
-- ---------------------------------------------------------------
-- 1. CREATE NEW ENUMS (referenced by new columns/tables)
-- ---------------------------------------------------------------

CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "AssetMovementType" AS ENUM ('ASSIGNED_TO_EMPLOYEE', 'RETURNED_FROM_EMPLOYEE', 'GONE_FOR_REPAIR', 'RETURNED_FROM_REPAIR', 'TRASH', 'NOT_WORKING', 'TRANSFERRED');
CREATE TYPE "InOutDirection" AS ENUM ('INWARD', 'OUTWARD');
CREATE TYPE "ForwardStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'ACTIONED', 'RETURNED');

-- ---------------------------------------------------------------
-- 2. ALTER EXISTING ENUMS
-- ---------------------------------------------------------------

ALTER TYPE "AssetStatus" ADD VALUE 'NOT_WORKING';

-- ---------------------------------------------------------------
-- 3. ADD NEW COLUMNS TO EXISTING TABLES (additive only)
-- ---------------------------------------------------------------

-- Asset
ALTER TABLE "Asset" ADD COLUMN "currentHolderId" TEXT;

-- Client
ALTER TABLE "Client"
ADD COLUMN "gstNumber" TEXT,
ADD COLUMN "panNumber" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "website" TEXT;

-- Contractor: add new document columns ONLY.
-- workType / serviceType enum conversion is handled separately in Section 5.
ALTER TABLE "Contractor"
ADD COLUMN "contactProofPath" TEXT,
ADD COLUMN "dprDocumentPath" TEXT,
ADD COLUMN "finalProgressPath" TEXT,
ADD COLUMN "raBillsPath" TEXT,
ADD COLUMN "tenderCopyPath" TEXT,
ADD COLUMN "tsAaDocumentPath" TEXT;

-- EmployeeDetail
ALTER TABLE "EmployeeDetail"
ADD COLUMN "dailyReportingPath" TEXT,
ADD COLUMN "leavePolicyPath" TEXT,
ADD COLUMN "officeTimeFramePath" TEXT;

-- InOutRegister: add new columns WITHOUT dropping replyDate / replyRefNo.
-- SAFETY CORRECTION: direction is added as nullable first, so existing
-- historical records remain NULL (unclassified). DEFAULT is applied
-- afterwards so new inserts receive 'INWARD' automatically.
ALTER TABLE "InOutRegister"
ADD COLUMN "department" TEXT,
ADD COLUMN "direction" "InOutDirection",
ADD COLUMN "inwardType" TEXT,
ADD COLUMN "parentInwardId" TEXT,
ADD COLUMN "receivedByPersonName" TEXT,
ADD COLUMN "replyDueDate" TIMESTAMP(3);

-- Set default for new records after migration. Existing NULLs preserved.
ALTER TABLE "InOutRegister" ALTER COLUMN "direction" SET DEFAULT 'INWARD';

-- JourneyLog
ALTER TABLE "JourneyLog"
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "driverAllowanceDetails" TEXT,
ADD COLUMN "endKmPhotoPath" TEXT,
ADD COLUMN "fastagBalance" DECIMAL(19,2),
ADD COLUMN "fuelBillPath" TEXT,
ADD COLUMN "fuelLitre" DECIMAL(10,2),
ADD COLUMN "fuelOdometerPhotoPath" TEXT,
ADD COLUMN "fuelRate" DECIMAL(10,2),
ADD COLUMN "maintenanceBillPath" TEXT,
ADD COLUMN "maintenanceOdometerPhotoPath" TEXT,
ADD COLUMN "maintenanceParticulars" TEXT,
ADD COLUMN "personsTravelling" TEXT,
ADD COLUMN "remarks" TEXT,
ADD COLUMN "serviceBillPath" TEXT,
ADD COLUMN "serviceOdometerPhotoPath" TEXT,
ADD COLUMN "serviceParticulars" TEXT,
ADD COLUMN "startKmPhotoPath" TEXT,
ADD COLUMN "taxParticulars" TEXT,
ADD COLUMN "taxReceiptPath" TEXT,
ADD COLUMN "timeIn" TEXT,
ADD COLUMN "timeOut" TEXT;

-- Staff
ALTER TABLE "Staff" ADD COLUMN "reportingManagerId" TEXT;

-- TadaClaim
ALTER TABLE "TadaClaim" ADD COLUMN "regionId" TEXT;

-- Task
ALTER TABLE "Task"
ADD COLUMN "activityLog" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "percentageCompletion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewerId" TEXT,
ADD COLUMN "sourceEntityId" TEXT,
ADD COLUMN "sourceModule" TEXT;

-- Tender: add new columns ONLY.
-- workType / serviceType enum conversion is handled separately in Section 5.
ALTER TABLE "Tender"
ADD COLUMN "concernAuthorityId" TEXT,
ADD COLUMN "negotiationMeetingAttended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "negotiationMeetingDate" TIMESTAMP(3),
ADD COLUMN "preBidMeetingDetails" TEXT,
ADD COLUMN "priceComparison" TEXT,
ADD COLUMN "ratesCopyPath" TEXT;

-- Vehicle
ALTER TABLE "Vehicle" ADD COLUMN "pucNumber" TEXT;

-- WorkInProgress
ALTER TABLE "WorkInProgress"
ADD COLUMN "agreementCopyPath" TEXT,
ADD COLUMN "finalProgressPath" TEXT,
ADD COLUMN "loiCopyPath" TEXT,
ADD COLUMN "raBill1Path" TEXT,
ADD COLUMN "raBill2Path" TEXT,
ADD COLUMN "raBill3Path" TEXT,
ADD COLUMN "raBill4Path" TEXT,
ADD COLUMN "securityDepositCopyPath" TEXT,
ADD COLUMN "workOrderCopyPath" TEXT;

-- ---------------------------------------------------------------
-- 4. SAFE IN-PLACE ENUM-TO-TEXT CONVERSIONS (data-preserving)
-- ---------------------------------------------------------------
-- These replace the destructive DROP COLUMN / ADD COLUMN blocks
-- generated by Prisma migrate diff for Project, Contractor, and Tender.
--
-- Preconditions verified:
--   - Project.workType / serviceType were NOT NULL in migrations.
--   - Contractor.workType / serviceType were nullable in migrations.
--   - Tender.workType / serviceType were nullable in migrations.
--   - No other tables reference WorkType or ServiceType enums.
--   - No CHECK constraints exist on these columns.

-- Project
ALTER TABLE "Project" ALTER COLUMN "workType" TYPE TEXT USING "workType"::text;
ALTER TABLE "Project" ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::text;

-- Contractor
ALTER TABLE "Contractor" ALTER COLUMN "workType" TYPE TEXT USING "workType"::text;
ALTER TABLE "Contractor" ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::text;

-- Tender
ALTER TABLE "Tender" ALTER COLUMN "workType" TYPE TEXT USING "workType"::text;
ALTER TABLE "Tender" ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::text;

-- ---------------------------------------------------------------
-- 5. DROP OBSOLETE ENUM TYPES (safe after all conversions)
-- ---------------------------------------------------------------

DROP TYPE "ServiceType";
DROP TYPE "WorkType";

-- ---------------------------------------------------------------
-- 6. PRESERVE EXISTING INDEXES (InOutRegister reply indexes)
-- ---------------------------------------------------------------
-- SAFETY CORRECTION: The original diff dropped these indexes.
-- They are preserved because no verified replacement exists in
-- schema.prisma and historical data relies on them.
-- NOTE: replyDate / replyRefNo columns are also preserved.

-- DROP INDEX "InOutRegister_replyDate_idx";  -- REMOVED (preserved)
-- DROP INDEX "InOutRegister_replyRefNo_key";  -- REMOVED (preserved)

-- ---------------------------------------------------------------
-- 7. CREATE NEW TABLES
-- ---------------------------------------------------------------

CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "employeeCode" TEXT,
    "designation" TEXT,
    "regionId" TEXT,
    "reportingManagerId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetMovement" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "movementType" "AssetMovementType" NOT NULL,
    "fromStaffId" TEXT,
    "toStaffId" TEXT,
    "notes" TEXT,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Designation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetMake" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "makeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TypeMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypeMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DprMaster" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DprMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TsAaMaster" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TsAaMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrawingMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMaster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FundFlowMonthly" (
    "id" TEXT NOT NULL,
    "fundFlowId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "income" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "expense" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "net" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "cumulative" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundFlowMonthly_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "remarks" TEXT,
    "tadaClaimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "resource" TEXT NOT NULL,
    "allowedActions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForwardRecord" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toStaffId" TEXT,
    "remarks" TEXT,
    "status" "ForwardStatus" NOT NULL DEFAULT 'PENDING',
    "forwardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ForwardRecord_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------
-- 8. CREATE NEW INDEXES
-- ---------------------------------------------------------------

CREATE UNIQUE INDEX "RegistrationRequest_email_key" ON "RegistrationRequest"("email");
CREATE INDEX "RegistrationRequest_status_idx" ON "RegistrationRequest"("status");
CREATE INDEX "RegistrationRequest_regionId_idx" ON "RegistrationRequest"("regionId");
CREATE INDEX "AssetMovement_assetId_idx" ON "AssetMovement"("assetId");
CREATE INDEX "AssetMovement_movementType_idx" ON "AssetMovement"("movementType");
CREATE INDEX "AssetMovement_fromStaffId_idx" ON "AssetMovement"("fromStaffId");
CREATE INDEX "AssetMovement_toStaffId_idx" ON "AssetMovement"("toStaffId");
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX "Designation_name_key" ON "Designation"("name");
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");
CREATE INDEX "City_stateId_idx" ON "City"("stateId");
CREATE UNIQUE INDEX "Platform_name_key" ON "Platform"("name");
CREATE UNIQUE INDEX "PaymentType_name_key" ON "PaymentType"("name");
CREATE UNIQUE INDEX "AssetCategory_name_key" ON "AssetCategory"("name");
CREATE UNIQUE INDEX "AssetMake_name_key" ON "AssetMake"("name");
CREATE INDEX "AssetModel_makeId_idx" ON "AssetModel"("makeId");
CREATE UNIQUE INDEX "AssetModel_name_makeId_key" ON "AssetModel"("name", "makeId");
CREATE UNIQUE INDEX "OrderMaster_name_key" ON "OrderMaster"("name");
CREATE UNIQUE INDEX "WorkMaster_name_key" ON "WorkMaster"("name");
CREATE UNIQUE INDEX "TypeMaster_name_key" ON "TypeMaster"("name");
CREATE UNIQUE INDEX "DprMaster_referenceNumber_key" ON "DprMaster"("referenceNumber");
CREATE UNIQUE INDEX "TsAaMaster_referenceNumber_key" ON "TsAaMaster"("referenceNumber");
CREATE UNIQUE INDEX "DrawingMaster_name_key" ON "DrawingMaster"("name");
CREATE UNIQUE INDEX "WorkOrderMaster_name_key" ON "WorkOrderMaster"("name");
CREATE UNIQUE INDEX "ContactMaster_name_key" ON "ContactMaster"("name");
CREATE INDEX "FundFlowMonthly_fundFlowId_idx" ON "FundFlowMonthly"("fundFlowId");
CREATE UNIQUE INDEX "FundFlowMonthly_fundFlowId_month_year_key" ON "FundFlowMonthly"("fundFlowId", "month", "year");
CREATE INDEX "Attendance_staffId_idx" ON "Attendance"("staffId");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");
CREATE UNIQUE INDEX "Attendance_staffId_date_key" ON "Attendance"("staffId", "date");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
CREATE UNIQUE INDEX "RolePermission_role_resource_key" ON "RolePermission"("role", "resource");
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
CREATE INDEX "ForwardRecord_entityType_entityId_idx" ON "ForwardRecord"("entityType", "entityId");
CREATE INDEX "ForwardRecord_toStaffId_idx" ON "ForwardRecord"("toStaffId");
CREATE INDEX "ForwardRecord_status_idx" ON "ForwardRecord"("status");
CREATE INDEX "Asset_currentHolderId_idx" ON "Asset"("currentHolderId");
CREATE INDEX "InOutRegister_direction_idx" ON "InOutRegister"("direction");
CREATE INDEX "InOutRegister_department_idx" ON "InOutRegister"("department");
CREATE INDEX "InOutRegister_replyDueDate_idx" ON "InOutRegister"("replyDueDate");
CREATE INDEX "InOutRegister_parentInwardId_idx" ON "InOutRegister"("parentInwardId");
CREATE INDEX "JourneyLog_approvedById_idx" ON "JourneyLog"("approvedById");
CREATE INDEX "Staff_reportingManagerId_idx" ON "Staff"("reportingManagerId");
CREATE INDEX "TadaClaim_regionId_idx" ON "TadaClaim"("regionId");
CREATE INDEX "Task_sourceModule_idx" ON "Task"("sourceModule");
CREATE INDEX "Task_sourceEntityId_idx" ON "Task"("sourceEntityId");

-- ---------------------------------------------------------------
-- 9. ADD FOREIGN KEYS
-- ---------------------------------------------------------------

ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_concernAuthorityId_fkey" FOREIGN KEY ("concernAuthorityId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JourneyLog" ADD CONSTRAINT "JourneyLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetMovement" ADD CONSTRAINT "AssetMovement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetMovement" ADD CONSTRAINT "AssetMovement_fromStaffId_fkey" FOREIGN KEY ("fromStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetMovement" ADD CONSTRAINT "AssetMovement_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InOutRegister" ADD CONSTRAINT "InOutRegister_parentInwardId_fkey" FOREIGN KEY ("parentInwardId") REFERENCES "InOutRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TadaClaim" ADD CONSTRAINT "TadaClaim_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetModel" ADD CONSTRAINT "AssetModel_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "AssetMake"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FundFlowMonthly" ADD CONSTRAINT "FundFlowMonthly_fundFlowId_fkey" FOREIGN KEY ("fundFlowId") REFERENCES "FundFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForwardRecord" ADD CONSTRAINT "ForwardRecord_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ForwardRecord" ADD CONSTRAINT "ForwardRecord_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
