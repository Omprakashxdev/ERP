-- CreateEnum
CREATE TYPE "ProgressActivityStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED');

-- DropIndex
-- NOTE: intentionally does NOT drop "Asset_responsiblePersonId_idx".
-- Prisma sees it as drift (created by a raw-SQL migration, never declared
-- in schema.prisma). Removing the generated DROP keeps this migration
-- additive and preserves the existing ERP index.

-- CreateTable
CREATE TABLE "ProgressActivityTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressActivityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressActivityTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressActivityTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRoomChecklist" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressRoomChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRoomActivity" (
    "id" TEXT NOT NULL,
    "roomChecklistId" TEXT NOT NULL,
    "sourceTemplateItemId" TEXT,
    "activityNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ProgressActivityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressRoomActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressActivityHistory" (
    "id" TEXT NOT NULL,
    "roomActivityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "previousStatus" "ProgressActivityStatus" NOT NULL,
    "newStatus" "ProgressActivityStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressActivityHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressActivityTemplate_isActive_idx" ON "ProgressActivityTemplate"("isActive");

-- CreateIndex
CREATE INDEX "ProgressActivityTemplate_name_idx" ON "ProgressActivityTemplate"("name");

-- CreateIndex
CREATE INDEX "ProgressActivityTemplateItem_templateId_idx" ON "ProgressActivityTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "ProgressRoomChecklist_roomId_idx" ON "ProgressRoomChecklist"("roomId");

-- CreateIndex
CREATE INDEX "ProgressRoomChecklist_templateId_idx" ON "ProgressRoomChecklist"("templateId");

-- CreateIndex
CREATE INDEX "ProgressRoomActivity_roomChecklistId_idx" ON "ProgressRoomActivity"("roomChecklistId");

-- CreateIndex
CREATE INDEX "ProgressRoomActivity_status_idx" ON "ProgressRoomActivity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressActivityHistory_eventId_key" ON "ProgressActivityHistory"("eventId");

-- CreateIndex
CREATE INDEX "ProgressActivityHistory_roomActivityId_idx" ON "ProgressActivityHistory"("roomActivityId");

-- AddForeignKey
ALTER TABLE "ProgressActivityTemplate" ADD CONSTRAINT "ProgressActivityTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressActivityTemplateItem" ADD CONSTRAINT "ProgressActivityTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgressActivityTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomChecklist" ADD CONSTRAINT "ProgressRoomChecklist_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ProgressRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomChecklist" ADD CONSTRAINT "ProgressRoomChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgressActivityTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomChecklist" ADD CONSTRAINT "ProgressRoomChecklist_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomActivity" ADD CONSTRAINT "ProgressRoomActivity_roomChecklistId_fkey" FOREIGN KEY ("roomChecklistId") REFERENCES "ProgressRoomChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomActivity" ADD CONSTRAINT "ProgressRoomActivity_sourceTemplateItemId_fkey" FOREIGN KEY ("sourceTemplateItemId") REFERENCES "ProgressActivityTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoomActivity" ADD CONSTRAINT "ProgressRoomActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressActivityHistory" ADD CONSTRAINT "ProgressActivityHistory_roomActivityId_fkey" FOREIGN KEY ("roomActivityId") REFERENCES "ProgressRoomActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressActivityHistory" ADD CONSTRAINT "ProgressActivityHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
