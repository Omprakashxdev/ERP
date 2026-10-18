-- Phase 2D DRAFT — NOT APPLIED — requires approval before use.
-- Additive only: adds Task.startDate and the TaskAttachment table.
-- No existing columns, rows, or files are altered or removed.

ALTER TABLE "Task" ADD COLUMN "startDate" TIMESTAMP(3);

CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");
CREATE INDEX "TaskAttachment_uploadedById_idx" ON "TaskAttachment"("uploadedById");

ALTER TABLE "TaskAttachment"
  ADD CONSTRAINT "TaskAttachment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAttachment"
  ADD CONSTRAINT "TaskAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
