CREATE TABLE "EnterprisePaymentMethod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresReference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "financialAccountId" TEXT,
    "businessPartyId" TEXT,
    "employeeId" TEXT,
    "payrollRunId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "unallocatedAmount" DECIMAL(20,6) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "maskedExternalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePaymentAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivableId" TEXT,
    "payableId" TEXT,
    "amount" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "allocatedByUserId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    CONSTRAINT "EnterprisePaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePaymentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseFinancialAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "maskedReference" TEXT,
    "openingBalance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "operationalBalance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reconciledBalance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(20,6),
    "ledgerAccountId" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "siteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settingsJson" JSONB,
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseFinancialAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTreasuryTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "paymentId" TEXT,
    "transferId" TEXT,
    "transactionType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
    "createdByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseTreasuryTransaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseAccountTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sourceFinancialAccountId" TEXT NOT NULL,
    "targetFinancialAccountId" TEXT NOT NULL,
    "sourceCurrencyCode" TEXT NOT NULL,
    "targetCurrencyCode" TEXT NOT NULL,
    "sourceAmount" DECIMAL(20,6) NOT NULL,
    "targetAmount" DECIMAL(20,6) NOT NULL,
    "exchangeRate" DECIMAL(24,12),
    "transferDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAccountTransfer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseCashSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "siteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingAmount" DECIMAL(20,6) NOT NULL,
    "expectedClosingAmount" DECIMAL(20,6),
    "countedClosingAmount" DECIMAL(20,6),
    "discrepancyAmount" DECIMAL(20,6),
    "closingReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "validatedByUserId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseCashSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseCashMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "movementType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseCashMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseCashCount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "denomination" DECIMAL(20,6) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "countedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseCashCount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseCashDiscrepancy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseCashDiscrepancy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterprisePaymentMethod_organizationId_methodType_isActive_idx" ON "EnterprisePaymentMethod"("organizationId", "methodType", "isActive");
CREATE UNIQUE INDEX "EnterprisePaymentMethod_organizationId_id_key" ON "EnterprisePaymentMethod"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePaymentMethod_organizationId_code_key" ON "EnterprisePaymentMethod"("organizationId", "code");
CREATE INDEX "EnterprisePayment_organizationId_status_paymentDate_idx" ON "EnterprisePayment"("organizationId", "status", "paymentDate");
CREATE INDEX "EnterprisePayment_organizationId_businessPartyId_status_idx" ON "EnterprisePayment"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterprisePayment_organizationId_financialAccountId_idx" ON "EnterprisePayment"("organizationId", "financialAccountId");
CREATE UNIQUE INDEX "EnterprisePayment_organizationId_id_key" ON "EnterprisePayment"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePayment_organizationId_number_key" ON "EnterprisePayment"("organizationId", "number");
CREATE UNIQUE INDEX "EnterprisePayment_organizationId_idempotencyKey_key" ON "EnterprisePayment"("organizationId", "idempotencyKey");
CREATE INDEX "EnterprisePaymentAllocation_organizationId_paymentId_status_idx" ON "EnterprisePaymentAllocation"("organizationId", "paymentId", "status");
CREATE INDEX "EnterprisePaymentAllocation_organizationId_receivableId_idx" ON "EnterprisePaymentAllocation"("organizationId", "receivableId");
CREATE INDEX "EnterprisePaymentAllocation_organizationId_payableId_idx" ON "EnterprisePaymentAllocation"("organizationId", "payableId");
CREATE UNIQUE INDEX "EnterprisePaymentAllocation_organizationId_id_key" ON "EnterprisePaymentAllocation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePaymentAllocation_organizationId_paymentId_receiv_key" ON "EnterprisePaymentAllocation"("organizationId", "paymentId", "receivableId", "payableId");
CREATE INDEX "EnterprisePaymentEvent_organizationId_paymentId_createdAt_idx" ON "EnterprisePaymentEvent"("organizationId", "paymentId", "createdAt");
CREATE UNIQUE INDEX "EnterprisePaymentEvent_organizationId_id_key" ON "EnterprisePaymentEvent"("organizationId", "id");
CREATE INDEX "EnterpriseFinancialAccount_organizationId_accountType_statu_idx" ON "EnterpriseFinancialAccount"("organizationId", "accountType", "status");
CREATE INDEX "EnterpriseFinancialAccount_organizationId_ledgerAccountId_idx" ON "EnterpriseFinancialAccount"("organizationId", "ledgerAccountId");
CREATE UNIQUE INDEX "EnterpriseFinancialAccount_organizationId_id_key" ON "EnterpriseFinancialAccount"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseFinancialAccount_organizationId_code_key" ON "EnterpriseFinancialAccount"("organizationId", "code");
CREATE INDEX "EnterpriseTreasuryTransaction_organizationId_financialAccou_idx" ON "EnterpriseTreasuryTransaction"("organizationId", "financialAccountId", "transactionDate");
CREATE INDEX "EnterpriseTreasuryTransaction_organizationId_paymentId_idx" ON "EnterpriseTreasuryTransaction"("organizationId", "paymentId");
CREATE INDEX "EnterpriseTreasuryTransaction_organizationId_reconciliation_idx" ON "EnterpriseTreasuryTransaction"("organizationId", "reconciliationStatus");
CREATE UNIQUE INDEX "EnterpriseTreasuryTransaction_organizationId_id_key" ON "EnterpriseTreasuryTransaction"("organizationId", "id");
CREATE INDEX "EnterpriseAccountTransfer_organizationId_status_transferDat_idx" ON "EnterpriseAccountTransfer"("organizationId", "status", "transferDate");
CREATE UNIQUE INDEX "EnterpriseAccountTransfer_organizationId_id_key" ON "EnterpriseAccountTransfer"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountTransfer_organizationId_number_key" ON "EnterpriseAccountTransfer"("organizationId", "number");
CREATE INDEX "EnterpriseCashSession_organizationId_cashierUserId_status_idx" ON "EnterpriseCashSession"("organizationId", "cashierUserId", "status");
CREATE INDEX "EnterpriseCashSession_organizationId_financialAccountId_sta_idx" ON "EnterpriseCashSession"("organizationId", "financialAccountId", "status");
CREATE UNIQUE INDEX "EnterpriseCashSession_organizationId_id_key" ON "EnterpriseCashSession"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseCashSession_organizationId_number_key" ON "EnterpriseCashSession"("organizationId", "number");
CREATE INDEX "EnterpriseCashMovement_organizationId_cashSessionId_created_idx" ON "EnterpriseCashMovement"("organizationId", "cashSessionId", "createdAt");
CREATE INDEX "EnterpriseCashMovement_organizationId_paymentId_idx" ON "EnterpriseCashMovement"("organizationId", "paymentId");
CREATE UNIQUE INDEX "EnterpriseCashMovement_organizationId_id_key" ON "EnterpriseCashMovement"("organizationId", "id");
CREATE INDEX "EnterpriseCashCount_organizationId_cashSessionId_idx" ON "EnterpriseCashCount"("organizationId", "cashSessionId");
CREATE UNIQUE INDEX "EnterpriseCashCount_organizationId_id_key" ON "EnterpriseCashCount"("organizationId", "id");
CREATE INDEX "EnterpriseCashDiscrepancy_organizationId_cashSessionId_stat_idx" ON "EnterpriseCashDiscrepancy"("organizationId", "cashSessionId", "status");
CREATE UNIQUE INDEX "EnterpriseCashDiscrepancy_organizationId_id_key" ON "EnterpriseCashDiscrepancy"("organizationId", "id");
