-- CreateTable
CREATE TABLE "EnterpriseTaxCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "payableAccountId" TEXT,
    "recoverableAccountId" TEXT,
    "roundingRule" TEXT NOT NULL DEFAULT 'HALF_UP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseTaxCode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTaxRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "rate" DECIMAL(12,8) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseTaxRate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTaxRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "criteriaJson" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseTaxRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTaxLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "taxableAmount" DECIMAL(20,6) NOT NULL,
    "taxRate" DECIMAL(12,8) NOT NULL,
    "taxAmount" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseTaxLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTaxPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseTaxPeriod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseTaxSummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxPeriodId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "taxableAmount" DECIMAL(20,6) NOT NULL,
    "outputTaxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "inputTaxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "netTaxAmount" DECIMAL(20,6) NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseTaxSummary_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseTaxCode_organizationId_category_isActive_idx" ON "EnterpriseTaxCode"("organizationId", "category", "isActive");
CREATE UNIQUE INDEX "EnterpriseTaxCode_organizationId_id_key" ON "EnterpriseTaxCode"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTaxCode_organizationId_code_key" ON "EnterpriseTaxCode"("organizationId", "code");
CREATE INDEX "EnterpriseTaxRate_organizationId_effectiveFrom_status_idx" ON "EnterpriseTaxRate"("organizationId", "effectiveFrom", "status");
CREATE UNIQUE INDEX "EnterpriseTaxRate_organizationId_id_key" ON "EnterpriseTaxRate"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTaxRate_organizationId_taxCodeId_effectiveFrom_key" ON "EnterpriseTaxRate"("organizationId", "taxCodeId", "effectiveFrom");
CREATE INDEX "EnterpriseTaxRule_organizationId_sourceType_isActive_idx" ON "EnterpriseTaxRule"("organizationId", "sourceType", "isActive");
CREATE UNIQUE INDEX "EnterpriseTaxRule_organizationId_id_key" ON "EnterpriseTaxRule"("organizationId", "id");
CREATE INDEX "EnterpriseTaxLine_organizationId_taxCodeId_createdAt_idx" ON "EnterpriseTaxLine"("organizationId", "taxCodeId", "createdAt");
CREATE UNIQUE INDEX "EnterpriseTaxLine_organizationId_id_key" ON "EnterpriseTaxLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTaxLine_organizationId_sourceEntityType_sourceEnt_key" ON "EnterpriseTaxLine"("organizationId", "sourceEntityType", "sourceEntityId", "taxCodeId");
CREATE INDEX "EnterpriseTaxPeriod_organizationId_status_startDate_idx" ON "EnterpriseTaxPeriod"("organizationId", "status", "startDate");
CREATE UNIQUE INDEX "EnterpriseTaxPeriod_organizationId_id_key" ON "EnterpriseTaxPeriod"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTaxPeriod_organizationId_code_key" ON "EnterpriseTaxPeriod"("organizationId", "code");
CREATE INDEX "EnterpriseTaxSummary_organizationId_taxPeriodId_idx" ON "EnterpriseTaxSummary"("organizationId", "taxPeriodId");
CREATE UNIQUE INDEX "EnterpriseTaxSummary_organizationId_id_key" ON "EnterpriseTaxSummary"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTaxSummary_organizationId_taxPeriodId_taxCodeId_c_key" ON "EnterpriseTaxSummary"("organizationId", "taxPeriodId", "taxCodeId", "currencyCode");
