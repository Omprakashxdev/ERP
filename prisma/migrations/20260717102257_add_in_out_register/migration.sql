-- CreateTable
CREATE TABLE "InOutRegister" (
    "id" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "documentRefNo" TEXT NOT NULL,
    "details" TEXT,
    "clientId" TEXT NOT NULL,
    "actionSuggestedStaffId" TEXT,
    "replyDate" TIMESTAMP(3),
    "replyRefNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InOutRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InOutRegisterDocument" (
    "id" TEXT NOT NULL,
    "inOutRegisterId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InOutRegisterDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InOutRegisterCcStaff" (
    "id" TEXT NOT NULL,
    "inOutRegisterId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "InOutRegisterCcStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InOutRegister_replyRefNo_key" ON "InOutRegister"("replyRefNo");

-- CreateIndex
CREATE INDEX "InOutRegister_clientId_idx" ON "InOutRegister"("clientId");

-- CreateIndex
CREATE INDEX "InOutRegister_receivedDate_idx" ON "InOutRegister"("receivedDate");

-- CreateIndex
CREATE INDEX "InOutRegister_documentDate_idx" ON "InOutRegister"("documentDate");

-- CreateIndex
CREATE INDEX "InOutRegister_actionSuggestedStaffId_idx" ON "InOutRegister"("actionSuggestedStaffId");

-- CreateIndex
CREATE INDEX "InOutRegister_replyDate_idx" ON "InOutRegister"("replyDate");

-- CreateIndex
CREATE INDEX "InOutRegisterDocument_inOutRegisterId_idx" ON "InOutRegisterDocument"("inOutRegisterId");

-- CreateIndex
CREATE INDEX "InOutRegisterCcStaff_inOutRegisterId_idx" ON "InOutRegisterCcStaff"("inOutRegisterId");

-- CreateIndex
CREATE INDEX "InOutRegisterCcStaff_staffId_idx" ON "InOutRegisterCcStaff"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "InOutRegisterCcStaff_inOutRegisterId_staffId_key" ON "InOutRegisterCcStaff"("inOutRegisterId", "staffId");

-- AddForeignKey
ALTER TABLE "InOutRegister" ADD CONSTRAINT "InOutRegister_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InOutRegister" ADD CONSTRAINT "InOutRegister_actionSuggestedStaffId_fkey" FOREIGN KEY ("actionSuggestedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InOutRegisterDocument" ADD CONSTRAINT "InOutRegisterDocument_inOutRegisterId_fkey" FOREIGN KEY ("inOutRegisterId") REFERENCES "InOutRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InOutRegisterCcStaff" ADD CONSTRAINT "InOutRegisterCcStaff_inOutRegisterId_fkey" FOREIGN KEY ("inOutRegisterId") REFERENCES "InOutRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InOutRegisterCcStaff" ADD CONSTRAINT "InOutRegisterCcStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
