-- A supplier batch can exist in more than one warehouse after transfer.
-- Preserve all existing row IDs and their movement/balance foreign keys.
DROP INDEX IF EXISTS "EnterpriseStockLot_organizationId_inventoryItemId_lotNumber_key";
CREATE UNIQUE INDEX "EnterpriseStockLot_organizationId_inventoryItemId_warehouse_key"
  ON "EnterpriseStockLot"("organizationId", "inventoryItemId", "warehouseId", "lotNumber");
