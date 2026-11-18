-- DropIndex
DROP INDEX IF EXISTS "Asset_responsiblePersonId_idx";

-- CreateTable
CREATE TABLE "JourneyStop" (
    "id" TEXT NOT NULL,
    "journeyLogId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyStop_journeyLogId_idx" ON "JourneyStop"("journeyLogId");

-- AddForeignKey
ALTER TABLE "JourneyStop" ADD CONSTRAINT "JourneyStop_journeyLogId_fkey" FOREIGN KEY ("journeyLogId") REFERENCES "JourneyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
