-- FF-01M: Additive migration — worksheet-level monthly expense plan
-- (Excel Fund Flow Row 14, V-AS, Apr 2026 – Mar 2028).
-- One amount per month for the whole workbook; NOT project-scoped.
-- Row absence = blank/unentered month; amount = 0 = explicitly entered zero.

-- CreateTable
CREATE TABLE "FundFlowMonthlyExpense" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundFlowMonthlyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundFlowMonthlyExpense_month_year_key" ON "FundFlowMonthlyExpense"("month", "year");
