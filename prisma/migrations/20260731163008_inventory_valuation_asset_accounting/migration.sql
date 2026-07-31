-- CreateTable
CREATE TABLE "EnterpriseInventoryCostLayer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "sourceMovementId" TEXT NOT NULL,
    "valuationMethod" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "remainingQuantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6) NOT NULL,
    "totalCost" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseInventoryCostLayer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseInventoryAccountingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6) NOT NULL,
    "totalCost" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseInventoryAccountingEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseAssetAccountingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "capitalizationSourceType" TEXT NOT NULL,
    "capitalizationSourceId" TEXT,
    "originalCost" DECIMAL(20,6) NOT NULL,
    "residualValue" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "inServiceDate" TIMESTAMP(3) NOT NULL,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "depreciationFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "assetAccountId" TEXT NOT NULL,
    "accumulatedDepreciationAccountId" TEXT NOT NULL,
    "depreciationExpenseAccountId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAssetAccountingProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseAssetDepreciationSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetAccountingProfileId" TEXT NOT NULL,
    "periodCode" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "openingNetBookValue" DECIMAL(20,6) NOT NULL,
    "depreciationAmount" DECIMAL(20,6) NOT NULL,
    "closingNetBookValue" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "idempotencyKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAssetDepreciationSchedule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseAssetDepreciationEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "depreciationScheduleId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "postedByUserId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseAssetDepreciationEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseAssetDisposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetAccountingProfileId" TEXT NOT NULL,
    "disposalDate" TIMESTAMP(3) NOT NULL,
    "grossValue" DECIMAL(20,6) NOT NULL,
    "accumulatedDepreciation" DECIMAL(20,6) NOT NULL,
    "netBookValue" DECIMAL(20,6) NOT NULL,
    "proceeds" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "gainLoss" DECIMAL(20,6) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAssetDisposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseInventoryCostLayer_organizationId_inventoryItemId_idx" ON "EnterpriseInventoryCostLayer"("organizationId", "inventoryItemId", "effectiveAt");
CREATE UNIQUE INDEX "EnterpriseInventoryCostLayer_organizationId_id_key" ON "EnterpriseInventoryCostLayer"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseInventoryCostLayer_organizationId_sourceMovementI_key" ON "EnterpriseInventoryCostLayer"("organizationId", "sourceMovementId");
CREATE INDEX "EnterpriseInventoryAccountingEvent_organizationId_inventory_idx" ON "EnterpriseInventoryAccountingEvent"("organizationId", "inventoryItemId", "status");
CREATE UNIQUE INDEX "EnterpriseInventoryAccountingEvent_organizationId_id_key" ON "EnterpriseInventoryAccountingEvent"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseInventoryAccountingEvent_organizationId_idempoten_key" ON "EnterpriseInventoryAccountingEvent"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseInventoryAccountingEvent_organizationId_stockMove_key" ON "EnterpriseInventoryAccountingEvent"("organizationId", "stockMovementId", "eventType");
CREATE INDEX "EnterpriseAssetAccountingProfile_organizationId_status_inSe_idx" ON "EnterpriseAssetAccountingProfile"("organizationId", "status", "inServiceDate");
CREATE UNIQUE INDEX "EnterpriseAssetAccountingProfile_organizationId_id_key" ON "EnterpriseAssetAccountingProfile"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAssetAccountingProfile_organizationId_assetId_key" ON "EnterpriseAssetAccountingProfile"("organizationId", "assetId");
CREATE INDEX "EnterpriseAssetDepreciationSchedule_organizationId_schedule_idx" ON "EnterpriseAssetDepreciationSchedule"("organizationId", "scheduledDate", "status");
CREATE UNIQUE INDEX "EnterpriseAssetDepreciationSchedule_organizationId_id_key" ON "EnterpriseAssetDepreciationSchedule"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAssetDepreciationSchedule_organizationId_idempote_key" ON "EnterpriseAssetDepreciationSchedule"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseAssetDepreciationSchedule_organizationId_assetAcc_key" ON "EnterpriseAssetDepreciationSchedule"("organizationId", "assetAccountingProfileId", "periodCode");
CREATE INDEX "EnterpriseAssetDepreciationEntry_organizationId_journalEntr_idx" ON "EnterpriseAssetDepreciationEntry"("organizationId", "journalEntryId");
CREATE UNIQUE INDEX "EnterpriseAssetDepreciationEntry_organizationId_id_key" ON "EnterpriseAssetDepreciationEntry"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAssetDepreciationEntry_organizationId_depreciatio_key" ON "EnterpriseAssetDepreciationEntry"("organizationId", "depreciationScheduleId");
CREATE INDEX "EnterpriseAssetDisposal_organizationId_assetAccountingProfi_idx" ON "EnterpriseAssetDisposal"("organizationId", "assetAccountingProfileId", "status");
CREATE UNIQUE INDEX "EnterpriseAssetDisposal_organizationId_id_key" ON "EnterpriseAssetDisposal"("organizationId", "id");
