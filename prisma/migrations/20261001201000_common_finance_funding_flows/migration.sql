-- AlterTable
ALTER TABLE "EnterpriseTreasuryTransaction" ADD COLUMN     "fundingOperationId" TEXT;

-- AlterTable
ALTER TABLE "EnterpriseCashMovement" ADD COLUMN     "fundingOperationId" TEXT;

-- CreateTable
CREATE TABLE "EnterpriseFundingOperation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fundingType" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "counterpartyLedgerAccountId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseFundingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnterpriseFundingOperation_organizationId_status_operationD_idx" ON "EnterpriseFundingOperation"("organizationId", "status", "operationDate");

-- CreateIndex
CREATE INDEX "EnterpriseFundingOperation_organizationId_financialAccountI_idx" ON "EnterpriseFundingOperation"("organizationId", "financialAccountId");

-- CreateIndex
CREATE INDEX "EnterpriseFundingOperation_organizationId_fundingType_idx" ON "EnterpriseFundingOperation"("organizationId", "fundingType");

-- CreateIndex
CREATE INDEX "EnterpriseFundingOperation_organizationId_cashSessionId_idx" ON "EnterpriseFundingOperation"("organizationId", "cashSessionId");

-- CreateIndex
CREATE INDEX "EnterpriseFundingOperation_organizationId_counterpartyLedge_idx" ON "EnterpriseFundingOperation"("organizationId", "counterpartyLedgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseFundingOperation_organizationId_id_key" ON "EnterpriseFundingOperation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseFundingOperation_organizationId_number_key" ON "EnterpriseFundingOperation"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseFundingOperation_organizationId_idempotencyKey_key" ON "EnterpriseFundingOperation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EnterpriseTreasuryTransaction_organizationId_fundingOperati_idx" ON "EnterpriseTreasuryTransaction"("organizationId", "fundingOperationId");

-- CreateIndex
CREATE INDEX "EnterpriseCashMovement_organizationId_fundingOperationId_idx" ON "EnterpriseCashMovement"("organizationId", "fundingOperationId");

-- AddForeignKey
ALTER TABLE "EnterpriseTreasuryTransaction" ADD CONSTRAINT "EnterpriseTreasuryTransaction_organizationId_fundingOperat_fkey" FOREIGN KEY ("organizationId", "fundingOperationId") REFERENCES "EnterpriseFundingOperation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseFundingOperation" ADD CONSTRAINT "EnterpriseFundingOperation_organizationId_financialAccount_fkey" FOREIGN KEY ("organizationId", "financialAccountId") REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseFundingOperation" ADD CONSTRAINT "EnterpriseFundingOperation_organizationId_cashSessionId_fkey" FOREIGN KEY ("organizationId", "cashSessionId") REFERENCES "EnterpriseCashSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseFundingOperation" ADD CONSTRAINT "EnterpriseFundingOperation_organizationId_counterpartyLedg_fkey" FOREIGN KEY ("organizationId", "counterpartyLedgerAccountId") REFERENCES "EnterpriseLedgerAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseCashMovement" ADD CONSTRAINT "EnterpriseCashMovement_organizationId_fundingOperationId_fkey" FOREIGN KEY ("organizationId", "fundingOperationId") REFERENCES "EnterpriseFundingOperation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
