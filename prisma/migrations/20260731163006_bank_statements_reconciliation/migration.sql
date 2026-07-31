-- CreateTable
CREATE TABLE "EnterpriseBankStatement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "openingBalance" DECIMAL(20,6) NOT NULL,
    "closingBalance" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "privateDocumentId" TEXT,
    "importedByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseBankStatement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseBankStatementLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankStatementId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "counterparty" TEXT,
    "debit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL,
    "runningBalance" DECIMAL(20,6),
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseBankStatementLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseReconciliationSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "bankStatementId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bookBalance" DECIMAL(20,6) NOT NULL,
    "statementBalance" DECIMAL(20,6) NOT NULL,
    "reconciledDifference" DECIMAL(20,6) NOT NULL,
    "preparedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseReconciliationSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseReconciliationMatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reconciliationSessionId" TEXT NOT NULL,
    "bankStatementLineId" TEXT,
    "paymentId" TEXT,
    "treasuryTransactionId" TEXT,
    "journalEntryId" TEXT,
    "matchedAmount" DECIMAL(20,6) NOT NULL,
    "confidenceScore" DECIMAL(5,4),
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "matchedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseReconciliationMatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseReconciliationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "criteriaJson" JSONB NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfigJson" JSONB,
    "autoConfirmAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseReconciliationRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseBankStatement_organizationId_financialAccountId_s_idx" ON "EnterpriseBankStatement"("organizationId", "financialAccountId", "statementDate");
CREATE UNIQUE INDEX "EnterpriseBankStatement_organizationId_id_key" ON "EnterpriseBankStatement"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBankStatement_organizationId_reference_key" ON "EnterpriseBankStatement"("organizationId", "reference");
CREATE INDEX "EnterpriseBankStatementLine_organizationId_reconciliationSt_idx" ON "EnterpriseBankStatementLine"("organizationId", "reconciliationStatus", "transactionDate");
CREATE UNIQUE INDEX "EnterpriseBankStatementLine_organizationId_id_key" ON "EnterpriseBankStatementLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBankStatementLine_organizationId_bankStatementId__key" ON "EnterpriseBankStatementLine"("organizationId", "bankStatementId", "lineNumber");
CREATE INDEX "EnterpriseReconciliationSession_organizationId_financialAcc_idx" ON "EnterpriseReconciliationSession"("organizationId", "financialAccountId", "status");
CREATE UNIQUE INDEX "EnterpriseReconciliationSession_organizationId_id_key" ON "EnterpriseReconciliationSession"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReconciliationSession_organizationId_number_key" ON "EnterpriseReconciliationSession"("organizationId", "number");
CREATE INDEX "EnterpriseReconciliationMatch_organizationId_reconciliation_idx" ON "EnterpriseReconciliationMatch"("organizationId", "reconciliationSessionId", "status");
CREATE INDEX "EnterpriseReconciliationMatch_organizationId_bankStatementL_idx" ON "EnterpriseReconciliationMatch"("organizationId", "bankStatementLineId");
CREATE UNIQUE INDEX "EnterpriseReconciliationMatch_organizationId_id_key" ON "EnterpriseReconciliationMatch"("organizationId", "id");
CREATE INDEX "EnterpriseReconciliationRule_organizationId_isActive_idx" ON "EnterpriseReconciliationRule"("organizationId", "isActive");
CREATE UNIQUE INDEX "EnterpriseReconciliationRule_organizationId_id_key" ON "EnterpriseReconciliationRule"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReconciliationRule_organizationId_name_key" ON "EnterpriseReconciliationRule"("organizationId", "name");
