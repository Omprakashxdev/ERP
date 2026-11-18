-- CreateEnum
CREATE TYPE "ProgressSiteStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ProgressSite" (
    "id" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationNotes" TEXT,
    "status" "ProgressSiteStatus" NOT NULL DEFAULT 'PLANNED',
    "coverImagePath" TEXT,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSite_siteCode_key" ON "ProgressSite"("siteCode");

-- CreateIndex
CREATE INDEX "ProgressSite_status_idx" ON "ProgressSite"("status");

-- CreateIndex
CREATE INDEX "ProgressSite_siteName_idx" ON "ProgressSite"("siteName");

-- CreateIndex
CREATE INDEX "ProgressSite_projectId_idx" ON "ProgressSite"("projectId");

-- AddForeignKey
ALTER TABLE "ProgressSite" ADD CONSTRAINT "ProgressSite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSite" ADD CONSTRAINT "ProgressSite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
