-- CreateTable
CREATE TABLE "EnterpriseFinanceConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "functionalCurrencyCode" TEXT NOT NULL,
    "presentationCurrencyCode" TEXT,
    "inventoryValuationMethod" TEXT NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "numberingPolicyJson" JSONB,
    "taxPolicyJson" JSONB,
    "reconciliationTolerance" DECIMAL(20,6) NOT NULL DEFAULT 0.01,
    "defaultAccountsJson" JSONB,
    "closePolicyJson" JSONB,
    "approvalThresholdsJson" JSONB,
    "readinessStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "automaticPostingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "lockedFunctionalCurrencyAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseFinanceConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseFiscalYear" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseFiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseFiscalPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "softClosedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseFiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseFinancialClose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "checklistJson" JSONB NOT NULL,
    "blockersJson" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "closedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseFinancialClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseChartOfAccounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateCode" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseChartOfAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseAccountGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "parentGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseAccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseLedgerAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "accountGroupId" TEXT,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountSubtype" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currencyCode" TEXT,
    "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "allowDirectPosting" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseLedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseAccountMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mappingKey" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseCurrency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "precision" INTEGER NOT NULL DEFAULT 2,
    "roundingMode" TEXT NOT NULL DEFAULT 'HALF_UP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseExchangeRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceCurrencyCode" TEXT NOT NULL,
    "targetCurrencyCode" TEXT NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseExchangeRateSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceCurrencyCode" TEXT NOT NULL,
    "targetCurrencyCode" TEXT NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseExchangeRateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseAccountingDimension" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "dimensionType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseAccountingDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseAccountingDimensionValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountingDimensionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseAccountingDimensionValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseFinanceConfiguration_organizationId_key" ON "EnterpriseFinanceConfiguration"("organizationId");
CREATE INDEX "EnterpriseFinanceConfiguration_organizationId_readinessStat_idx" ON "EnterpriseFinanceConfiguration"("organizationId", "readinessStatus");
CREATE INDEX "EnterpriseFiscalYear_organizationId_status_idx" ON "EnterpriseFiscalYear"("organizationId", "status");
CREATE INDEX "EnterpriseFiscalYear_organizationId_startDate_endDate_idx" ON "EnterpriseFiscalYear"("organizationId", "startDate", "endDate");
CREATE UNIQUE INDEX "EnterpriseFiscalYear_organizationId_id_key" ON "EnterpriseFiscalYear"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseFiscalYear_organizationId_code_key" ON "EnterpriseFiscalYear"("organizationId", "code");
CREATE INDEX "EnterpriseFiscalPeriod_organizationId_status_idx" ON "EnterpriseFiscalPeriod"("organizationId", "status");
CREATE INDEX "EnterpriseFiscalPeriod_organizationId_startDate_endDate_idx" ON "EnterpriseFiscalPeriod"("organizationId", "startDate", "endDate");
CREATE UNIQUE INDEX "EnterpriseFiscalPeriod_organizationId_id_key" ON "EnterpriseFiscalPeriod"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseFiscalPeriod_organizationId_code_key" ON "EnterpriseFiscalPeriod"("organizationId", "code");
CREATE INDEX "EnterpriseFinancialClose_organizationId_fiscalPeriodId_stat_idx" ON "EnterpriseFinancialClose"("organizationId", "fiscalPeriodId", "status");
CREATE UNIQUE INDEX "EnterpriseFinancialClose_organizationId_id_key" ON "EnterpriseFinancialClose"("organizationId", "id");
CREATE INDEX "EnterpriseChartOfAccounts_organizationId_status_idx" ON "EnterpriseChartOfAccounts"("organizationId", "status");
CREATE UNIQUE INDEX "EnterpriseChartOfAccounts_organizationId_id_key" ON "EnterpriseChartOfAccounts"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseChartOfAccounts_organizationId_code_key" ON "EnterpriseChartOfAccounts"("organizationId", "code");
CREATE INDEX "EnterpriseAccountGroup_organizationId_chartId_accountType_idx" ON "EnterpriseAccountGroup"("organizationId", "chartId", "accountType");
CREATE UNIQUE INDEX "EnterpriseAccountGroup_organizationId_id_key" ON "EnterpriseAccountGroup"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountGroup_organizationId_chartId_code_key" ON "EnterpriseAccountGroup"("organizationId", "chartId", "code");
CREATE INDEX "EnterpriseLedgerAccount_organizationId_chartId_accountType_idx" ON "EnterpriseLedgerAccount"("organizationId", "chartId", "accountType");
CREATE INDEX "EnterpriseLedgerAccount_organizationId_accountSubtype_isAct_idx" ON "EnterpriseLedgerAccount"("organizationId", "accountSubtype", "isActive");
CREATE INDEX "EnterpriseLedgerAccount_organizationId_parentId_idx" ON "EnterpriseLedgerAccount"("organizationId", "parentId");
CREATE UNIQUE INDEX "EnterpriseLedgerAccount_organizationId_id_key" ON "EnterpriseLedgerAccount"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseLedgerAccount_organizationId_code_key" ON "EnterpriseLedgerAccount"("organizationId", "code");
CREATE INDEX "EnterpriseAccountMapping_organizationId_ledgerAccountId_isA_idx" ON "EnterpriseAccountMapping"("organizationId", "ledgerAccountId", "isActive");
CREATE UNIQUE INDEX "EnterpriseAccountMapping_organizationId_id_key" ON "EnterpriseAccountMapping"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountMapping_organizationId_mappingKey_effectiv_key" ON "EnterpriseAccountMapping"("organizationId", "mappingKey", "effectiveFrom");
CREATE INDEX "EnterpriseCurrency_code_isActive_idx" ON "EnterpriseCurrency"("code", "isActive");
CREATE UNIQUE INDEX "EnterpriseCurrency_organizationId_code_key" ON "EnterpriseCurrency"("organizationId", "code");
CREATE INDEX "EnterpriseExchangeRate_organizationId_rateDate_status_idx" ON "EnterpriseExchangeRate"("organizationId", "rateDate", "status");
CREATE UNIQUE INDEX "EnterpriseExchangeRate_organizationId_sourceCurrencyCode_ta_key" ON "EnterpriseExchangeRate"("organizationId", "sourceCurrencyCode", "targetCurrencyCode", "rateDate", "source");
CREATE INDEX "EnterpriseExchangeRateSnapshot_organizationId_rateDate_idx" ON "EnterpriseExchangeRateSnapshot"("organizationId", "rateDate");
CREATE UNIQUE INDEX "EnterpriseExchangeRateSnapshot_organizationId_sourceEntityT_key" ON "EnterpriseExchangeRateSnapshot"("organizationId", "sourceEntityType", "sourceEntityId", "sourceCurrencyCode", "targetCurrencyCode");
CREATE INDEX "EnterpriseAccountingDimension_organizationId_dimensionType__idx" ON "EnterpriseAccountingDimension"("organizationId", "dimensionType", "isActive");
CREATE UNIQUE INDEX "EnterpriseAccountingDimension_organizationId_id_key" ON "EnterpriseAccountingDimension"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountingDimension_organizationId_code_key" ON "EnterpriseAccountingDimension"("organizationId", "code");
CREATE INDEX "EnterpriseAccountingDimensionValue_organizationId_sourceEnt_idx" ON "EnterpriseAccountingDimensionValue"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE UNIQUE INDEX "EnterpriseAccountingDimensionValue_organizationId_id_key" ON "EnterpriseAccountingDimensionValue"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAccountingDimensionValue_organizationId_accountin_key" ON "EnterpriseAccountingDimensionValue"("organizationId", "accountingDimensionId", "code");
