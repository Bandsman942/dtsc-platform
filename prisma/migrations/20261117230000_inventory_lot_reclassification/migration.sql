-- Additive, no automatic assignment of historic quantities or dates.
CREATE TABLE "EnterpriseStockLotReclassification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "sourceBalanceId" TEXT NOT NULL,
  "sourceBalanceRevision" INTEGER NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "itemRevision" INTEGER NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "allocations" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseStockLotReclassification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseStockLotReclassification_organizationId_id_key" ON "EnterpriseStockLotReclassification"("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseStockLotReclassification_organizationId_reference_key" ON "EnterpriseStockLotReclassification"("organizationId","reference");
CREATE UNIQUE INDEX "EnterpriseLotReclass_idempotency_key" ON "EnterpriseStockLotReclassification"("organizationId","idempotencyKey");
CREATE INDEX "EnterpriseLotReclass_source_status_idx" ON "EnterpriseStockLotReclassification"("organizationId","sourceBalanceId","status");
CREATE INDEX "EnterpriseLotReclass_warehouse_status_idx" ON "EnterpriseStockLotReclassification"("organizationId","warehouseId","status");
