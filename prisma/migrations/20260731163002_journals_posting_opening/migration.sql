-- CreateTable
CREATE TABLE "EnterpriseJournal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "journalType" TEXT NOT NULL,
    "sequencePrefix" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseJournal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePostingBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "postingEvent" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "postingVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePostingBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseJournalEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "accountingDate" TIMESTAMP(3) NOT NULL,
    "documentDate" TIMESTAMP(3),
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "postingEvent" TEXT,
    "postingVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "functionalCurrencyCode" TEXT NOT NULL,
    "preparedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "postedByUserId" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalOfEntryId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseJournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseJournalLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "projectId" TEXT,
    "departmentId" TEXT,
    "siteId" TEXT,
    "assetId" TEXT,
    "inventoryItemId" TEXT,
    "description" TEXT,
    "debit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "transactionCurrencyCode" TEXT,
    "transactionAmount" DECIMAL(20,6),
    "exchangeRate" DECIMAL(24,12),
    "functionalAmount" DECIMAL(20,6) NOT NULL,
    "analyticReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseJournalLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseJournalReversal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originalEntryId" TEXT NOT NULL,
    "reversalEntryId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseJournalReversal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseOpeningBalanceImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL,
    "description" TEXT,
    "privateDocumentId" TEXT,
    "preparedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "postedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseOpeningBalanceImport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseOpeningBalanceLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "openingBalanceImportId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "debit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseOpeningBalanceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseJournal_organizationId_journalType_isActive_idx" ON "EnterpriseJournal"("organizationId", "journalType", "isActive");
CREATE UNIQUE INDEX "EnterpriseJournal_organizationId_id_key" ON "EnterpriseJournal"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseJournal_organizationId_code_key" ON "EnterpriseJournal"("organizationId", "code");
CREATE INDEX "EnterprisePostingBatch_organizationId_status_createdAt_idx" ON "EnterprisePostingBatch"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "EnterprisePostingBatch_organizationId_id_key" ON "EnterprisePostingBatch"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePostingBatch_organizationId_idempotencyKey_key" ON "EnterprisePostingBatch"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterprisePostingBatch_organizationId_sourceEntityType_sour_key" ON "EnterprisePostingBatch"("organizationId", "sourceEntityType", "sourceEntityId", "postingEvent", "postingVersion");
CREATE INDEX "EnterpriseJournalEntry_organizationId_status_accountingDate_idx" ON "EnterpriseJournalEntry"("organizationId", "status", "accountingDate");
CREATE INDEX "EnterpriseJournalEntry_organizationId_journalId_accountingD_idx" ON "EnterpriseJournalEntry"("organizationId", "journalId", "accountingDate");
CREATE INDEX "EnterpriseJournalEntry_organizationId_sourceEntityType_sour_idx" ON "EnterpriseJournalEntry"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE UNIQUE INDEX "EnterpriseJournalEntry_organizationId_id_key" ON "EnterpriseJournalEntry"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseJournalEntry_organizationId_number_key" ON "EnterpriseJournalEntry"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseJournalEntry_organizationId_idempotencyKey_key" ON "EnterpriseJournalEntry"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseJournalLine_organizationId_journalEntryId_idx" ON "EnterpriseJournalLine"("organizationId", "journalEntryId");
CREATE INDEX "EnterpriseJournalLine_organizationId_ledgerAccountId_idx" ON "EnterpriseJournalLine"("organizationId", "ledgerAccountId");
CREATE INDEX "EnterpriseJournalLine_organizationId_businessPartyId_idx" ON "EnterpriseJournalLine"("organizationId", "businessPartyId");
CREATE INDEX "EnterpriseJournalLine_organizationId_projectId_idx" ON "EnterpriseJournalLine"("organizationId", "projectId");
CREATE UNIQUE INDEX "EnterpriseJournalLine_organizationId_id_key" ON "EnterpriseJournalLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseJournalReversal_organizationId_id_key" ON "EnterpriseJournalReversal"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseJournalReversal_organizationId_originalEntryId_key" ON "EnterpriseJournalReversal"("organizationId", "originalEntryId");
CREATE UNIQUE INDEX "EnterpriseJournalReversal_organizationId_reversalEntryId_key" ON "EnterpriseJournalReversal"("organizationId", "reversalEntryId");
CREATE INDEX "EnterpriseOpeningBalanceImport_organizationId_status_idx" ON "EnterpriseOpeningBalanceImport"("organizationId", "status");
CREATE UNIQUE INDEX "EnterpriseOpeningBalanceImport_organizationId_id_key" ON "EnterpriseOpeningBalanceImport"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseOpeningBalanceImport_organizationId_reference_key" ON "EnterpriseOpeningBalanceImport"("organizationId", "reference");
CREATE INDEX "EnterpriseOpeningBalanceLine_organizationId_openingBalanceI_idx" ON "EnterpriseOpeningBalanceLine"("organizationId", "openingBalanceImportId");
CREATE INDEX "EnterpriseOpeningBalanceLine_organizationId_ledgerAccountId_idx" ON "EnterpriseOpeningBalanceLine"("organizationId", "ledgerAccountId");
CREATE UNIQUE INDEX "EnterpriseOpeningBalanceLine_organizationId_id_key" ON "EnterpriseOpeningBalanceLine"("organizationId", "id");
