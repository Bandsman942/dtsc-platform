-- DTSC ERP consolidation iteration 02: inventory journal core.

CREATE TABLE "EnterpriseInventoryItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "minimumQuantity" DECIMAL(18,3),
  "reorderQuantity" DECIMAL(18,3),
  "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
  "lotTracking" BOOLEAN NOT NULL DEFAULT false,
  "expiryTracking" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStockLot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "lotNumber" TEXT NOT NULL,
  "productionDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "supplierId" TEXT,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseStockLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseInventoryBalance" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "stockLotId" TEXT,
  "quantityOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "quantityReserved" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseInventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStockMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "stockLotId" TEXT,
  "movementType" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "balanceAfter" DECIMAL(18,3),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "sourceLineId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseStockMovement_pkey" PRIMARY KEY ("id")
);
