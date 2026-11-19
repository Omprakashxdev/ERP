-- AlterTable
ALTER TABLE "InOutRegister" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "InOutRegister_createdByUserId_idx" ON "InOutRegister"("createdByUserId");

-- AddForeignKey
ALTER TABLE "InOutRegister" ADD CONSTRAINT "InOutRegister_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
