-- DTSC ERP consolidation iteration 02: inventory counts, transfers and adjustments.

CREATE TABLE "EnterpriseInventoryCount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "countType" TEXT NOT NULL DEFAULT 'FULL',
  "plannedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "notes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseInventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseInventoryCountLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryCountId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "stockLotId" TEXT,
  "expectedQuantity" DECIMAL(18,3) NOT NULL,
  "countedQuantity" DECIMAL(18,3),
  "varianceQuantity" DECIMAL(18,3),
  "countedByUserId" TEXT,
  "countedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseInventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStockTransfer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "sourceWarehouseId" TEXT NOT NULL,
  "destinationWarehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "dispatchedByUserId" TEXT,
  "receivedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "notes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseStockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStockTransferLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "stockTransferId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "stockLotId" TEXT,
  "sourceLocationId" TEXT,
  "destinationLocationId" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseStockTransferLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStockAdjustment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "stockLotId" TEXT,
  "adjustmentType" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "idempotencyKey" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseStockAdjustment_pkey" PRIMARY KEY ("id")
);
