-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "drawingMasterId" TEXT,
ADD COLUMN     "workOrderMasterId" TEXT;

-- CreateIndex
CREATE INDEX "Contractor_workOrderMasterId_idx" ON "Contractor"("workOrderMasterId");

-- CreateIndex
CREATE INDEX "Contractor_drawingMasterId_idx" ON "Contractor"("drawingMasterId");

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_workOrderMasterId_fkey" FOREIGN KEY ("workOrderMasterId") REFERENCES "WorkOrderMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_drawingMasterId_fkey" FOREIGN KEY ("drawingMasterId") REFERENCES "DrawingMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
