-- Shop 2.0 iteration 4 foundations.
-- Additive only: offline sync metadata, common inventory reservations,
-- country-pack activation and self-service onboarding progress.

CREATE TABLE "EnterpriseRetailOfflineSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "itemCount" INTEGER NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseRetailOfflineSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailOfflineSnapshot_organizationId_id_key"
  ON "EnterpriseRetailOfflineSnapshot"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailOfflineSnapshot_organizationId_version_key"
  ON "EnterpriseRetailOfflineSnapshot"("organizationId", "version");
CREATE INDEX "EnterpriseRetailOfflineSnapshot_org_site_wh_valid_idx"
  ON "EnterpriseRetailOfflineSnapshot"("organizationId", "siteId", "warehouseId", "validUntil");
CREATE INDEX "EnterpriseRetailOfflineSnapshot_org_created_idx"
  ON "EnterpriseRetailOfflineSnapshot"("organizationId", "createdAt");

CREATE TABLE "EnterpriseRetailOfflineSyncOperation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "operationUuid" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "snapshotVersion" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "serverEntityType" TEXT,
  "serverEntityId" TEXT,
  "conflictCode" TEXT,
  "conflictJson" JSONB,
  "receivedByUserId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailOfflineSyncOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailOfflineSyncOperation_organizationId_id_key"
  ON "EnterpriseRetailOfflineSyncOperation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailOfflineSyncOperation_organizationId_operationUuid_key"
  ON "EnterpriseRetailOfflineSyncOperation"("organizationId", "operationUuid");
CREATE INDEX "EnterpriseRetailOfflineSyncOperation_org_status_received_idx"
  ON "EnterpriseRetailOfflineSyncOperation"("organizationId", "status", "receivedAt");
CREATE INDEX "EnterpriseRetailOfflineSyncOperation_org_snapshot_idx"
  ON "EnterpriseRetailOfflineSyncOperation"("organizationId", "snapshotVersion");
CREATE INDEX "EnterpriseRetailOfflineSyncOperation_org_entity_idx"
  ON "EnterpriseRetailOfflineSyncOperation"("organizationId", "serverEntityType", "serverEntityId");

CREATE TABLE "EnterpriseInventoryReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "salesOrderItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "quantity" DECIMAL(20,6) NOT NULL,
  "fulfilledQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "releasedByUserId" TEXT,
  "fulfilledByUserId" TEXT,
  "releasedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseInventoryReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseInventoryReservation_organizationId_id_key"
  ON "EnterpriseInventoryReservation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseInventoryReservation_organizationId_idempotencyKey_key"
  ON "EnterpriseInventoryReservation"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseInventoryReservation_org_order_status_idx"
  ON "EnterpriseInventoryReservation"("organizationId", "salesOrderId", "status");
CREATE INDEX "EnterpriseInventoryReservation_org_order_item_status_idx"
  ON "EnterpriseInventoryReservation"("organizationId", "salesOrderItemId", "status");
CREATE INDEX "EnterpriseInventoryReservation_org_item_wh_status_idx"
  ON "EnterpriseInventoryReservation"("organizationId", "inventoryItemId", "warehouseId", "status");
CREATE INDEX "EnterpriseInventoryReservation_org_expiry_status_idx"
  ON "EnterpriseInventoryReservation"("organizationId", "expiresAt", "status");

CREATE TABLE "EnterpriseRetailCountryPackActivation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "packCode" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "packVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "capabilitiesJson" JSONB NOT NULL,
  "configurationJson" JSONB,
  "evidenceJson" JSONB,
  "activatedByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailCountryPackActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailCountryPackActivation_organizationId_id_key"
  ON "EnterpriseRetailCountryPackActivation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailCountryPackActivation_organizationId_packCode_key"
  ON "EnterpriseRetailCountryPackActivation"("organizationId", "packCode");
CREATE INDEX "EnterpriseRetailCountryPackActivation_org_country_status_idx"
  ON "EnterpriseRetailCountryPackActivation"("organizationId", "countryCode", "status");
CREATE INDEX "EnterpriseRetailCountryPackActivation_archived_idx"
  ON "EnterpriseRetailCountryPackActivation"("archivedAt");

CREATE TABLE "EnterpriseRetailOnboardingRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "currentStep" TEXT NOT NULL DEFAULT 'COUNTRY',
  "countryCode" TEXT,
  "currencyCode" TEXT,
  "siteId" TEXT,
  "warehouseId" TEXT,
  "cashFinancialAccountId" TEXT,
  "readinessJson" JSONB,
  "blockedReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRetailOnboardingRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailOnboardingRun_organizationId_id_key"
  ON "EnterpriseRetailOnboardingRun"("organizationId", "id");
CREATE INDEX "EnterpriseRetailOnboardingRun_org_status_updated_idx"
  ON "EnterpriseRetailOnboardingRun"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseRetailOnboardingRun_org_country_status_idx"
  ON "EnterpriseRetailOnboardingRun"("organizationId", "countryCode", "status");
CREATE INDEX "EnterpriseRetailOnboardingRun_archived_idx"
  ON "EnterpriseRetailOnboardingRun"("archivedAt");
