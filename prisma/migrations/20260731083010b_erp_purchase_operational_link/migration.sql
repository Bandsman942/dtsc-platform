-- DTSC ERP consolidation iteration 02: purchase operational integration.

CREATE TABLE "EnterprisePurchaseOperationalLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "siteId" TEXT,
  "destinationWarehouseId" TEXT,
  "supplierContractId" TEXT,
  "projectId" TEXT,
  "assetId" TEXT,
  "expectedReceiptType" TEXT NOT NULL DEFAULT 'GOODS',
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterprisePurchaseOperationalLink_pkey" PRIMARY KEY ("id")
);
