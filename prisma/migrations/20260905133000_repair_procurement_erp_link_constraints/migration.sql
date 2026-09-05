-- #578 Procurement/ERP: restore the physical unique constraints and indexes already
-- declared by Prisma for the purchase integration link tables created by migrations
-- 20260731083010b..10e.
--
-- Never silently deduplicate historical tenant data. If logical duplicates exist,
-- stop the migration so they can be reconciled deliberately before retrying.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseOperationalLink"
    GROUP BY "organizationId", "purchaseId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseOperationalLink contains duplicate (organizationId, purchaseId) rows; reconcile them before applying #578';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseItemCatalogLink"
    GROUP BY "organizationId", "purchaseItemId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseItemCatalogLink contains duplicate (organizationId, purchaseItemId) rows; reconcile them before applying #578';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseReceiptOperationalLink"
    GROUP BY "organizationId", "purchaseReceiptId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseReceiptOperationalLink contains duplicate (organizationId, purchaseReceiptId) rows; reconcile them before applying #578';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseReceiptOperationalLink"
    WHERE "idempotencyKey" IS NOT NULL
    GROUP BY "organizationId", "idempotencyKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseReceiptOperationalLink contains duplicate non-null (organizationId, idempotencyKey) rows; reconcile them before applying #578';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseReceiptItemStockLink"
    GROUP BY "organizationId", "purchaseReceiptItemId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseReceiptItemStockLink contains duplicate (organizationId, purchaseReceiptItemId) rows; reconcile them before applying #578';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "EnterprisePurchaseReceiptItemStockLink"
    WHERE "stockMovementId" IS NOT NULL
    GROUP BY "organizationId", "stockMovementId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterprisePurchaseReceiptItemStockLink contains duplicate non-null (organizationId, stockMovementId) rows; reconcile them before applying #578';
  END IF;
END $$;

-- EnterprisePurchaseOperationalLink
CREATE UNIQUE INDEX "EnterprisePurchaseOperationalLink_organizationId_id_key"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchaseOperationalLink_organizationId_purchaseId_key"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "purchaseId");
CREATE INDEX "EnterprisePurchaseOperationalLink_organizationId_siteId_idx"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "siteId");
CREATE INDEX "EnterprisePurchaseOperationalLink_organizationId_destinationWarehouseId_idx"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "destinationWarehouseId");
CREATE INDEX "EnterprisePurchaseOperationalLink_organizationId_supplierContractId_idx"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "supplierContractId");
CREATE INDEX "EnterprisePurchaseOperationalLink_organizationId_projectId_idx"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "projectId");
CREATE INDEX "EnterprisePurchaseOperationalLink_organizationId_assetId_idx"
  ON "EnterprisePurchaseOperationalLink"("organizationId", "assetId");

-- EnterprisePurchaseItemCatalogLink
CREATE UNIQUE INDEX "EnterprisePurchaseItemCatalogLink_organizationId_id_key"
  ON "EnterprisePurchaseItemCatalogLink"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchaseItemCatalogLink_organizationId_purchaseItemId_key"
  ON "EnterprisePurchaseItemCatalogLink"("organizationId", "purchaseItemId");
CREATE INDEX "EnterprisePurchaseItemCatalogLink_organizationId_catalogItemId_idx"
  ON "EnterprisePurchaseItemCatalogLink"("organizationId", "catalogItemId");
CREATE INDEX "EnterprisePurchaseItemCatalogLink_organizationId_unitOfMeasureId_idx"
  ON "EnterprisePurchaseItemCatalogLink"("organizationId", "unitOfMeasureId");

-- EnterprisePurchaseReceiptOperationalLink
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptOperationalLink_organizationId_id_key"
  ON "EnterprisePurchaseReceiptOperationalLink"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptOperationalLink_organizationId_purchaseReceiptId_key"
  ON "EnterprisePurchaseReceiptOperationalLink"("organizationId", "purchaseReceiptId");
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptOperationalLink_organizationId_idempotencyKey_key"
  ON "EnterprisePurchaseReceiptOperationalLink"("organizationId", "idempotencyKey");
CREATE INDEX "EnterprisePurchaseReceiptOperationalLink_organizationId_warehouseId_status_idx"
  ON "EnterprisePurchaseReceiptOperationalLink"("organizationId", "warehouseId", "status");
CREATE INDEX "EnterprisePurchaseReceiptOperationalLink_organizationId_storageLocationId_status_idx"
  ON "EnterprisePurchaseReceiptOperationalLink"("organizationId", "storageLocationId", "status");

-- EnterprisePurchaseReceiptItemStockLink
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptItemStockLink_organizationId_id_key"
  ON "EnterprisePurchaseReceiptItemStockLink"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptItemStockLink_organizationId_purchaseReceiptItemId_key"
  ON "EnterprisePurchaseReceiptItemStockLink"("organizationId", "purchaseReceiptItemId");
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptItemStockLink_organizationId_stockMovementId_key"
  ON "EnterprisePurchaseReceiptItemStockLink"("organizationId", "stockMovementId");
