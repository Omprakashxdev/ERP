-- CreateEnum
CREATE TYPE "TadaClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'MANAGER_REJECTED', 'ACCOUNTS_VERIFIED', 'ACCOUNTS_QUERY', 'FINANCE_APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "TadaClaim" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tourPurpose" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "travelExpense" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "accommodationExp" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "foodExpense" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "localConveyance" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "otherExpense" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "totalClaimAmount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "advanceAmount" DECIMAL(19,2),
    "adjustedAmount" DECIMAL(19,2),
    "balanceAmount" DECIMAL(19,2),
    "status" "TadaClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "managerRemarks" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "managerApprovedById" TEXT,
    "accountsRemarks" TEXT,
    "accountsVerifiedAt" TIMESTAMP(3),
    "accountsVerifiedById" TEXT,
    "financeApprovedAt" TIMESTAMP(3),
    "financeApprovedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMode" TEXT,
    "rejectedReason" TEXT,
    "billCopyPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TadaClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT NOT NULL,
    "assignedById" TEXT,
    "projectId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "reworkReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDetail" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "department" TEXT,
    "alternatePhone" TEXT,
    "presentCity" TEXT,
    "dateOfJoining" TIMESTAMP(3),
    "dateOfExit" TIMESTAMP(3),
    "fatherName" TEXT,
    "motherName" TEXT,
    "permanentAddress" TEXT,
    "communicationAddress" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "religionCaste" TEXT,
    "maritalStatus" TEXT,
    "passOutYear" INTEGER,
    "otherQualification" TEXT,
    "otherPassOutYear" INTEGER,
    "interviewFormPath" TEXT,
    "resumePath" TEXT,
    "photoIdProofPath" TEXT,
    "addressProofPath" TEXT,
    "degreeCertificatePath" TEXT,
    "letterOfGuaranteePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TadaClaim_staffId_idx" ON "TadaClaim"("staffId");

-- CreateIndex
CREATE INDEX "TadaClaim_status_idx" ON "TadaClaim"("status");

-- CreateIndex
CREATE INDEX "TadaClaim_fromDate_idx" ON "TadaClaim"("fromDate");

-- CreateIndex
CREATE INDEX "TadaClaim_toDate_idx" ON "TadaClaim"("toDate");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDetail_staffId_key" ON "EmployeeDetail"("staffId");

-- CreateIndex
CREATE INDEX "EmployeeDetail_department_idx" ON "EmployeeDetail"("department");

-- CreateIndex
CREATE INDEX "EmployeeDetail_presentCity_idx" ON "EmployeeDetail"("presentCity");

-- AddForeignKey
ALTER TABLE "TadaClaim" ADD CONSTRAINT "TadaClaim_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDetail" ADD CONSTRAINT "EmployeeDetail_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
