-- Brick 3: session-bound ownership for unsaved In-Out Register uploads.
-- Additive only — no existing tables, rows, or files are touched.
CREATE TABLE "PendingInOutUpload" (
    "id" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingInOutUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingInOutUpload_storedName_key" ON "PendingInOutUpload"("storedName");

CREATE INDEX "PendingInOutUpload_uploadedById_idx" ON "PendingInOutUpload"("uploadedById");

ALTER TABLE "PendingInOutUpload"
    ADD CONSTRAINT "PendingInOutUpload_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
