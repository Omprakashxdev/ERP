-- P4: multi-assignee support (To Do Task worksheet row 22).
-- Co-assignees are additional staff marked on a task; assignedToId
-- remains the single accountable owner for status/approval.
CREATE TABLE "TaskCoAssignee" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskCoAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskCoAssignee_taskId_staffId_key"
  ON "TaskCoAssignee"("taskId", "staffId");
CREATE INDEX "TaskCoAssignee_taskId_idx" ON "TaskCoAssignee"("taskId");
CREATE INDEX "TaskCoAssignee_staffId_idx" ON "TaskCoAssignee"("staffId");

ALTER TABLE "TaskCoAssignee"
  ADD CONSTRAINT "TaskCoAssignee_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCoAssignee"
  ADD CONSTRAINT "TaskCoAssignee_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
