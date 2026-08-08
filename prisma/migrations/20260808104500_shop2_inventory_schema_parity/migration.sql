-- Shop 2.0 iteration 1: restore PostgreSQL uniqueness required by the
-- canonical Prisma inventory schema. This migration is intentionally
-- fail-safe: historical duplicates are never deleted or rewritten.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "EnterpriseInventoryItem"
    GROUP BY "organizationId", "catalogItemId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP2_INVENTORY_PARITY_DUPLICATE_INVENTORY_ITEM: duplicate (organizationId, catalogItemId) rows must be reviewed before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EnterpriseStockLot"
    GROUP BY "organizationId", "inventoryItemId", "lotNumber"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP2_INVENTORY_PARITY_DUPLICATE_STOCK_LOT: duplicate (organizationId, inventoryItemId, lotNumber) rows must be reviewed before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EnterpriseInventoryBalance"
    GROUP BY "organizationId", "inventoryItemId", "warehouseId", "storageLocationId", "stockLotId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP2_INVENTORY_PARITY_DUPLICATE_BALANCE: duplicate inventory coordinates must be reviewed before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EnterpriseStockMovement"
    GROUP BY "organizationId", "idempotencyKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP2_INVENTORY_PARITY_DUPLICATE_MOVEMENT_KEY: duplicate stock movement idempotency keys must be reviewed before migration';
  END IF;
END $$;

-- EnterpriseInventoryItem
-- (organizationId, id) already exists from the sector convergence FK hardening.
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseInventoryItem_organizationId_catalogItemId_key"
  ON "EnterpriseInventoryItem"("organizationId", "catalogItemId");

-- EnterpriseStockLot
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseStockLot_organizationId_id_key"
  ON "EnterpriseStockLot"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseStockLot_organizationId_inventoryItemId_lotNumber_key"
  ON "EnterpriseStockLot"("organizationId", "inventoryItemId", "lotNumber");

-- EnterpriseInventoryBalance
-- Prisma models one logical balance per coordinate. PostgreSQL 16 NULLS NOT
-- DISTINCT is required so the common no-location/no-lot coordinate is also
-- unique instead of allowing multiple rows where nullable columns are NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseInventoryBalance_organizationId_inventoryItemId_warehouseId_storageLocationId_stockLotId_key"
  ON "EnterpriseInventoryBalance"("organizationId", "inventoryItemId", "warehouseId", "storageLocationId", "stockLotId") NULLS NOT DISTINCT;

-- EnterpriseStockMovement
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseStockMovement_organizationId_id_key"
  ON "EnterpriseStockMovement"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseStockMovement_organizationId_idempotencyKey_key"
  ON "EnterpriseStockMovement"("organizationId", "idempotencyKey");
