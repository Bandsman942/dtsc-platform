CREATE TABLE "EnterpriseAccountingAutomationTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "automationType" TEXT NOT NULL,
    "journalType" TEXT NOT NULL DEFAULT 'ADJUSTMENT',
    "currencyCode" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "autoReverse" BOOLEAN NOT NULL DEFAULT false,
    "reversalDelayDays" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAccountingAutomationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseAccountingAutomationTemplateLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountMappingKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "businessPartyId" TEXT,
    "projectId" TEXT,
    "departmentId" TEXT,
    "siteId" TEXT,
    "assetId" TEXT,
    "inventoryItemId" TEXT,
    "allocationWeight" DECIMAL(20,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAccountingAutomationTemplateLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseAccountingAutomationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,
    "runType" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "accountingDate" TIMESTAMP(3) NOT NULL,
    "reversalDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payloadJson" JSONB NOT NULL,
    "journalEntryId" TEXT,
    "reversalJournalEntryId" TEXT,
    "sourceReference" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAccountingAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseAccountingAutomationTemplate_organizationId_id_key" ON "EnterpriseAccountingAutomationTemplate"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountingAutomationTemplate_organizationId_code_key" ON "EnterpriseAccountingAutomationTemplate"("organizationId", "code");
CREATE INDEX "EnterpriseAccountingAutomationTemplate_org_type_status_idx" ON "EnterpriseAccountingAutomationTemplate"("organizationId", "automationType", "status");
CREATE INDEX "EnterpriseAccountingAutomationTemplate_org_next_status_idx" ON "EnterpriseAccountingAutomationTemplate"("organizationId", "nextRunAt", "status");

CREATE UNIQUE INDEX "EnterpriseAccountingAutomationTemplateLine_organizationId_id_key" ON "EnterpriseAccountingAutomationTemplateLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountingAutomationTemplateLine_org_template_line_key" ON "EnterpriseAccountingAutomationTemplateLine"("organizationId", "templateId", "lineNumber");
CREATE INDEX "EnterpriseAccountingAutomationTemplateLine_org_template_idx" ON "EnterpriseAccountingAutomationTemplateLine"("organizationId", "templateId");

CREATE UNIQUE INDEX "EnterpriseAccountingAutomationRun_organizationId_id_key" ON "EnterpriseAccountingAutomationRun"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountingAutomationRun_organizationId_runKey_key" ON "EnterpriseAccountingAutomationRun"("organizationId", "runKey");
CREATE INDEX "EnterpriseAccountingAutomationRun_org_type_status_date_idx" ON "EnterpriseAccountingAutomationRun"("organizationId", "runType", "status", "accountingDate");
CREATE INDEX "EnterpriseAccountingAutomationRun_org_reversal_status_idx" ON "EnterpriseAccountingAutomationRun"("organizationId", "reversalDate", "status");
CREATE INDEX "EnterpriseAccountingAutomationRun_org_entry_idx" ON "EnterpriseAccountingAutomationRun"("organizationId", "journalEntryId");

ALTER TABLE "EnterpriseAccountingAutomationTemplateLine"
ADD CONSTRAINT "EnterpriseAccountingAutomationTemplateLine_template_fkey"
FOREIGN KEY ("organizationId", "templateId") REFERENCES "EnterpriseAccountingAutomationTemplate"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseAccountingAutomationRun"
ADD CONSTRAINT "EnterpriseAccountingAutomationRun_template_fkey"
FOREIGN KEY ("organizationId", "templateId") REFERENCES "EnterpriseAccountingAutomationTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
