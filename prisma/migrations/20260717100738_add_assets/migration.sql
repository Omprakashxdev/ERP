-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'DISPOSED');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "make" TEXT,
    "model" TEXT,
    "yearOfPurchase" INTEGER,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "securityCode" TEXT,
    "billWarrantyPath" TEXT,
    "assigneeType" TEXT,
    "assignee" TEXT,
    "assignedQuantity" DECIMAL(10,2),
    "responsiblePerson" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_itemCode_key" ON "Asset"("itemCode");

-- CreateIndex
CREATE INDEX "Asset_category_idx" ON "Asset"("category");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_itemCode_idx" ON "Asset"("itemCode");
