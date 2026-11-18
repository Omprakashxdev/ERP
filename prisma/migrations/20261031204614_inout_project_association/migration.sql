-- AlterTable
ALTER TABLE "InOutRegister" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "InOutRegister_projectId_idx" ON "InOutRegister"("projectId");

-- AddForeignKey
ALTER TABLE "InOutRegister" ADD CONSTRAINT "InOutRegister_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
