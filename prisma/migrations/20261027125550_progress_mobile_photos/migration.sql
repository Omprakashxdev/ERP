-- CreateEnum
CREATE TYPE "ProgressSiteAssignmentEventType" AS ENUM ('GRANTED', 'SCOPE_UPDATED', 'REVOKED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "ProgressPhotoTargetType" AS ENUM ('SITE', 'FLAT', 'ROOM', 'ACTIVITY');

-- CreateTable
CREATE TABLE "ProgressSiteAssignment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressSiteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressSiteAssignmentEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" "ProgressSiteAssignmentEventType" NOT NULL,
    "canView" BOOLEAN NOT NULL,
    "canUpdate" BOOLEAN NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSiteAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "MobileRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "flatId" TEXT,
    "roomId" TEXT,
    "roomActivityId" TEXT,
    "targetType" "ProgressPhotoTargetType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "clientEventId" TEXT,
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressSiteAssignment_userId_idx" ON "ProgressSiteAssignment"("userId");

-- CreateIndex
CREATE INDEX "ProgressSiteAssignment_siteId_idx" ON "ProgressSiteAssignment"("siteId");

-- CreateIndex
CREATE INDEX "ProgressSiteAssignment_isActive_idx" ON "ProgressSiteAssignment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSiteAssignment_siteId_userId_key" ON "ProgressSiteAssignment"("siteId", "userId");

-- CreateIndex
CREATE INDEX "ProgressSiteAssignmentEvent_assignmentId_idx" ON "ProgressSiteAssignmentEvent"("assignmentId");

-- CreateIndex
CREATE INDEX "ProgressSiteAssignmentEvent_changedById_idx" ON "ProgressSiteAssignmentEvent"("changedById");

-- CreateIndex
CREATE UNIQUE INDEX "MobileRefreshToken_tokenHash_key" ON "MobileRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileRefreshToken_userId_idx" ON "MobileRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "MobileRefreshToken_familyId_idx" ON "MobileRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "MobileRefreshToken_expiresAt_idx" ON "MobileRefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_storageKey_key" ON "ProgressPhoto"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_clientEventId_key" ON "ProgressPhoto"("clientEventId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_siteId_idx" ON "ProgressPhoto"("siteId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_flatId_idx" ON "ProgressPhoto"("flatId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_roomId_idx" ON "ProgressPhoto"("roomId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_roomActivityId_idx" ON "ProgressPhoto"("roomActivityId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_contentHash_idx" ON "ProgressPhoto"("contentHash");

-- CreateIndex
CREATE INDEX "ProgressPhoto_uploadedById_idx" ON "ProgressPhoto"("uploadedById");

-- Partial unique index — enforces the single-active-checklist invariant
-- at the database level so concurrent assign/replace requests can never
-- leave two active checklists on one room.
CREATE UNIQUE INDEX "ProgressRoomChecklist_one_active_per_room"
  ON "ProgressRoomChecklist" ("roomId") WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignment" ADD CONSTRAINT "ProgressSiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ProgressSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignment" ADD CONSTRAINT "ProgressSiteAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignment" ADD CONSTRAINT "ProgressSiteAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignment" ADD CONSTRAINT "ProgressSiteAssignment_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignmentEvent" ADD CONSTRAINT "ProgressSiteAssignmentEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProgressSiteAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSiteAssignmentEvent" ADD CONSTRAINT "ProgressSiteAssignmentEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileRefreshToken" ADD CONSTRAINT "MobileRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ProgressSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "ProgressFlat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ProgressRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_roomActivityId_fkey" FOREIGN KEY ("roomActivityId") REFERENCES "ProgressRoomActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
