-- DTSC ERP consolidation iteration 02: purchase item to catalog link.

CREATE TABLE "EnterprisePurchaseItemCatalogLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseItemId" TEXT NOT NULL,
  "catalogItemId" TEXT,
  "unitOfMeasureId" TEXT,
  "expectedItemType" TEXT NOT NULL DEFAULT 'GOODS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterprisePurchaseItemCatalogLink_pkey" PRIMARY KEY ("id")
);
