-- CreateTable
CREATE TABLE "ProgressWing" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressWing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressFloor" (
    "id" TEXT NOT NULL,
    "wingId" TEXT NOT NULL,
    "floorIdentifier" TEXT NOT NULL,
    "displayName" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressFlat" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "flatNumber" TEXT NOT NULL,
    "flatType" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressFlat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRoom" (
    "id" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomType" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressWing_siteId_idx" ON "ProgressWing"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressWing_siteId_code_key" ON "ProgressWing"("siteId", "code");

-- CreateIndex
CREATE INDEX "ProgressFloor_wingId_idx" ON "ProgressFloor"("wingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressFloor_wingId_floorIdentifier_key" ON "ProgressFloor"("wingId", "floorIdentifier");

-- CreateIndex
CREATE INDEX "ProgressFlat_floorId_idx" ON "ProgressFlat"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressFlat_floorId_flatNumber_key" ON "ProgressFlat"("floorId", "flatNumber");

-- CreateIndex
CREATE INDEX "ProgressRoom_flatId_idx" ON "ProgressRoom"("flatId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRoom_flatId_roomName_key" ON "ProgressRoom"("flatId", "roomName");

-- AddForeignKey
ALTER TABLE "ProgressWing" ADD CONSTRAINT "ProgressWing_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ProgressSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressFloor" ADD CONSTRAINT "ProgressFloor_wingId_fkey" FOREIGN KEY ("wingId") REFERENCES "ProgressWing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressFlat" ADD CONSTRAINT "ProgressFlat_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "ProgressFloor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRoom" ADD CONSTRAINT "ProgressRoom_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "ProgressFlat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
