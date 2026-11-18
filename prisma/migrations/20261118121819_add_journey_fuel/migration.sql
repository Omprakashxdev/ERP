-- CreateTable
CREATE TABLE "JourneyFuel" (
    "id" TEXT NOT NULL,
    "journeyLogId" TEXT NOT NULL,
    "expense" DECIMAL(19,2),
    "litres" DECIMAL(10,2),
    "rate" DECIMAL(10,2),
    "billPath" TEXT,
    "odometerPhotoPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyFuel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyFuel_journeyLogId_idx" ON "JourneyFuel"("journeyLogId");

-- AddForeignKey
ALTER TABLE "JourneyFuel" ADD CONSTRAINT "JourneyFuel_journeyLogId_fkey" FOREIGN KEY ("journeyLogId") REFERENCES "JourneyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
