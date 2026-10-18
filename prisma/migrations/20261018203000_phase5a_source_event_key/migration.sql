-- Phase 5A: stable event identity for auto-linked tasks.
-- Additive, nullable; no data rewrite. Postgres treats NULLs as
-- distinct in unique indexes, so unkeyed manual tasks never collide.
ALTER TABLE "Task" ADD COLUMN "sourceEventKey" TEXT;

CREATE UNIQUE INDEX "Task_sourceModule_sourceEntityId_sourceEventKey_key"
  ON "Task"("sourceModule", "sourceEntityId", "sourceEventKey");
