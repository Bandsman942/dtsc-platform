-- Accounting C4: recurring entries, accruals, deferrals, allocations and auto-reversal.
-- Additive only. EnterpriseJournalEntry / EnterpriseJournalLine remain the sole ledger.

CREATE TABLE "EnterprisePeriodicAccountingTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "defaultAmount" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "autoReverse" BOOLEAN NOT NULL DEFAULT false,
    "reversalPolicy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePeriodicAccountingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePeriodicAccountingTemplateLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "allocationPercent" DECIMAL(9,6) NOT NULL,
    "description" TEXT,
    "businessPartyId" TEXT,
    "projectId" TEXT,
    "departmentId" TEXT,
    "siteId" TEXT,
    "assetId" TEXT,
    "inventoryItemId" TEXT,
    "analyticReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePeriodicAccountingTemplateLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePeriodicAccountingExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "accountingDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journalEntryId" TEXT,
    "reversalEntryId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePeriodicAccountingExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterprisePeriodicAccountingTemplate_organizationId_id_key" ON "EnterprisePeriodicAccountingTemplate"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePeriodicAccountingTemplate_organizationId_code_version_key" ON "EnterprisePeriodicAccountingTemplate"("organizationId", "code", "version");
CREATE INDEX "EnterprisePeriodicAccountingTemplate_organizationId_code_status_idx" ON "EnterprisePeriodicAccountingTemplate"("organizationId", "code", "status");
CREATE INDEX "EnterprisePeriodicAccountingTemplate_organizationId_status_startDate_endDate_idx" ON "EnterprisePeriodicAccountingTemplate"("organizationId", "status", "startDate", "endDate");

CREATE UNIQUE INDEX "EnterprisePeriodicAccountingTemplateLine_organizationId_id_key" ON "EnterprisePeriodicAccountingTemplateLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePeriodicAccountingTemplateLine_organizationId_templateId_position_key" ON "EnterprisePeriodicAccountingTemplateLine"("organizationId", "templateId", "position");
CREATE INDEX "EnterprisePeriodicAccountingTemplateLine_organizationId_ledgerAccountId_idx" ON "EnterprisePeriodicAccountingTemplateLine"("organizationId", "ledgerAccountId");
CREATE INDEX "EnterprisePeriodicAccountingTemplateLine_organizationId_businessPartyId_idx" ON "EnterprisePeriodicAccountingTemplateLine"("organizationId", "businessPartyId");
CREATE INDEX "EnterprisePeriodicAccountingTemplateLine_organizationId_projectId_idx" ON "EnterprisePeriodicAccountingTemplateLine"("organizationId", "projectId");

CREATE UNIQUE INDEX "EnterprisePeriodicAccountingExecution_organizationId_id_key" ON "EnterprisePeriodicAccountingExecution"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePeriodicAccountingExecution_organizationId_occurrenceKey_key" ON "EnterprisePeriodicAccountingExecution"("organizationId", "occurrenceKey");
CREATE UNIQUE INDEX "EnterprisePeriodicAccountingExecution_organizationId_journalEntryId_key" ON "EnterprisePeriodicAccountingExecution"("organizationId", "journalEntryId");
CREATE UNIQUE INDEX "EnterprisePeriodicAccountingExecution_organizationId_reversalEntryId_key" ON "EnterprisePeriodicAccountingExecution"("organizationId", "reversalEntryId");
CREATE INDEX "EnterprisePeriodicAccountingExecution_organizationId_templateId_accountingDate_idx" ON "EnterprisePeriodicAccountingExecution"("organizationId", "templateId", "accountingDate");
CREATE INDEX "EnterprisePeriodicAccountingExecution_organizationId_fiscalPeriodId_status_idx" ON "EnterprisePeriodicAccountingExecution"("organizationId", "fiscalPeriodId", "status");

ALTER TABLE "EnterprisePeriodicAccountingTemplateLine"
  ADD CONSTRAINT "EnterprisePeriodicAccountingTemplateLine_organizationId_te_fkey"
  FOREIGN KEY ("organizationId", "templateId") REFERENCES "EnterprisePeriodicAccountingTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterprisePeriodicAccountingExecution"
  ADD CONSTRAINT "EnterprisePeriodicAccountingExecution_organizationId_templ_fkey"
  FOREIGN KEY ("organizationId", "templateId") REFERENCES "EnterprisePeriodicAccountingTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
