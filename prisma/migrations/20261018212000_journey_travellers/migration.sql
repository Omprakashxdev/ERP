-- P2: stable staff identity for journey travellers (veh log bk gr row 8).
-- Additive join table; legacy personsTravelling text is untouched.
CREATE TABLE "JourneyLogTraveller" (
  "id" TEXT NOT NULL,
  "journeyLogId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JourneyLogTraveller_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JourneyLogTraveller_journeyLogId_staffId_key"
  ON "JourneyLogTraveller"("journeyLogId", "staffId");
CREATE INDEX "JourneyLogTraveller_journeyLogId_idx"
  ON "JourneyLogTraveller"("journeyLogId");
CREATE INDEX "JourneyLogTraveller_staffId_idx"
  ON "JourneyLogTraveller"("staffId");

ALTER TABLE "JourneyLogTraveller"
  ADD CONSTRAINT "JourneyLogTraveller_journeyLogId_fkey"
  FOREIGN KEY ("journeyLogId") REFERENCES "JourneyLog"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyLogTraveller"
  ADD CONSTRAINT "JourneyLogTraveller_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
