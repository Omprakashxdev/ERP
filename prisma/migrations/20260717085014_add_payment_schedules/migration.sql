-- CreateEnum
CREATE TYPE "PaymentScheduleCategory" AS ENUM ('EXCISE', 'GST', 'TDS', 'VEHICLE_LOAN');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paymentType" TEXT,
    "category" "PaymentScheduleCategory" NOT NULL DEFAULT 'GST',
    "detail" TEXT,
    "amount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "billCopyPath" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSchedule_category_idx" ON "PaymentSchedule"("category");

-- CreateIndex
CREATE INDEX "PaymentSchedule_status_idx" ON "PaymentSchedule"("status");

-- CreateIndex
CREATE INDEX "PaymentSchedule_dueDate_idx" ON "PaymentSchedule"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentSchedule_date_idx" ON "PaymentSchedule"("date");
