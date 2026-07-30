-- Sprint 8: dedicated organization ERP budgets, expenses and reports.
-- Additive only: legacy EnterpriseCoreRecord finance/report records remain readable.

CREATE TABLE "EnterpriseBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "departmentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBudgetLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "departmentId" TEXT,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseBudgetLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBudgetCommitment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "committedAmount" DECIMAL(18,2) NOT NULL,
    "realizedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "releasedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseBudgetCommitment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EnterprisePurchase" ADD COLUMN "budgetLineId" TEXT;

CREATE TABLE "EnterpriseExpense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" DECIMAL(18,2) NOT NULL,
    "supplierId" TEXT,
    "purchaseId" TEXT,
    "budgetLineId" TEXT,
    "departmentId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "amountVarianceReason" TEXT,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "budgetImpactAppliedAt" TIMESTAMP(3),
    "commitmentRealizedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "currency" TEXT,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "filtersJson" JSONB,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseBudget_organizationId_id_key" ON "EnterpriseBudget"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBudget_organizationId_reference_key" ON "EnterpriseBudget"("organizationId", "reference");
CREATE INDEX "EnterpriseBudget_organizationId_status_idx" ON "EnterpriseBudget"("organizationId", "status");
CREATE INDEX "EnterpriseBudget_organizationId_periodStart_periodEnd_idx" ON "EnterpriseBudget"("organizationId", "periodStart", "periodEnd");
CREATE INDEX "EnterpriseBudget_organizationId_departmentId_idx" ON "EnterpriseBudget"("organizationId", "departmentId");
CREATE INDEX "EnterpriseBudget_organizationId_currency_status_idx" ON "EnterpriseBudget"("organizationId", "currency", "status");
CREATE INDEX "EnterpriseBudget_archivedAt_idx" ON "EnterpriseBudget"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseBudgetLine_organizationId_id_key" ON "EnterpriseBudgetLine"("organizationId", "id");
CREATE INDEX "EnterpriseBudgetLine_budgetId_idx" ON "EnterpriseBudgetLine"("budgetId");
CREATE INDEX "EnterpriseBudgetLine_organizationId_budgetId_idx" ON "EnterpriseBudgetLine"("organizationId", "budgetId");
CREATE INDEX "EnterpriseBudgetLine_organizationId_departmentId_idx" ON "EnterpriseBudgetLine"("organizationId", "departmentId");
CREATE INDEX "EnterpriseBudgetLine_organizationId_category_idx" ON "EnterpriseBudgetLine"("organizationId", "category");

CREATE UNIQUE INDEX "EnterpriseBudgetCommitment_organizationId_id_key" ON "EnterpriseBudgetCommitment"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBudgetCommitment_source_key" ON "EnterpriseBudgetCommitment"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseBudgetCommitment_budgetLineId_status_idx" ON "EnterpriseBudgetCommitment"("budgetLineId", "status");
CREATE INDEX "EnterpriseBudgetCommitment_organizationId_budgetLineId_status_idx" ON "EnterpriseBudgetCommitment"("organizationId", "budgetLineId", "status");
CREATE INDEX "EnterpriseBudgetCommitment_organizationId_source_idx" ON "EnterpriseBudgetCommitment"("organizationId", "sourceEntityType", "sourceEntityId");

CREATE INDEX "EnterprisePurchase_organizationId_budgetLineId_status_idx" ON "EnterprisePurchase"("organizationId", "budgetLineId", "status");

CREATE UNIQUE INDEX "EnterpriseExpense_organizationId_id_key" ON "EnterpriseExpense"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseExpense_organizationId_reference_key" ON "EnterpriseExpense"("organizationId", "reference");
CREATE INDEX "EnterpriseExpense_organizationId_status_idx" ON "EnterpriseExpense"("organizationId", "status");
CREATE INDEX "EnterpriseExpense_organizationId_expenseDate_idx" ON "EnterpriseExpense"("organizationId", "expenseDate");
CREATE INDEX "EnterpriseExpense_organizationId_budgetLineId_status_idx" ON "EnterpriseExpense"("organizationId", "budgetLineId", "status");
CREATE INDEX "EnterpriseExpense_organizationId_supplierId_idx" ON "EnterpriseExpense"("organizationId", "supplierId");
CREATE INDEX "EnterpriseExpense_organizationId_purchaseId_idx" ON "EnterpriseExpense"("organizationId", "purchaseId");
CREATE INDEX "EnterpriseExpense_organizationId_departmentId_status_idx" ON "EnterpriseExpense"("organizationId", "departmentId", "status");
CREATE INDEX "EnterpriseExpense_organizationId_currency_status_idx" ON "EnterpriseExpense"("organizationId", "currency", "status");
CREATE INDEX "EnterpriseExpense_archivedAt_idx" ON "EnterpriseExpense"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseReport_organizationId_id_key" ON "EnterpriseReport"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReport_organizationId_reference_key" ON "EnterpriseReport"("organizationId", "reference");
CREATE INDEX "EnterpriseReport_organizationId_reportType_generatedAt_idx" ON "EnterpriseReport"("organizationId", "reportType", "generatedAt");
CREATE INDEX "EnterpriseReport_organizationId_status_idx" ON "EnterpriseReport"("organizationId", "status");
CREATE INDEX "EnterpriseReport_organizationId_generatedByUserId_generatedAt_idx" ON "EnterpriseReport"("organizationId", "generatedByUserId", "generatedAt");
CREATE INDEX "EnterpriseReport_organizationId_currency_generatedAt_idx" ON "EnterpriseReport"("organizationId", "currency", "generatedAt");
CREATE INDEX "EnterpriseReport_archivedAt_idx" ON "EnterpriseReport"("archivedAt");

ALTER TABLE "EnterpriseBudgetLine"
  ADD CONSTRAINT "EnterpriseBudgetLine_budget_fkey"
  FOREIGN KEY ("organizationId", "budgetId") REFERENCES "EnterpriseBudget"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseBudgetCommitment"
  ADD CONSTRAINT "EnterpriseBudgetCommitment_budgetLine_fkey"
  FOREIGN KEY ("organizationId", "budgetLineId") REFERENCES "EnterpriseBudgetLine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterprisePurchase"
  ADD CONSTRAINT "EnterprisePurchase_budgetLine_fkey"
  FOREIGN KEY ("organizationId", "budgetLineId") REFERENCES "EnterpriseBudgetLine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseExpense"
  ADD CONSTRAINT "EnterpriseExpense_supplier_fkey"
  FOREIGN KEY ("organizationId", "supplierId") REFERENCES "EnterpriseSupplier"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseExpense"
  ADD CONSTRAINT "EnterpriseExpense_purchase_fkey"
  FOREIGN KEY ("organizationId", "purchaseId") REFERENCES "EnterprisePurchase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseExpense"
  ADD CONSTRAINT "EnterpriseExpense_budgetLine_fkey"
  FOREIGN KEY ("organizationId", "budgetLineId") REFERENCES "EnterpriseBudgetLine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
