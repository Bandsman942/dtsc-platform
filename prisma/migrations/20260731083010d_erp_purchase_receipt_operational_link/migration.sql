-- DTSC ERP consolidation iteration 02: purchase receipt operational integration.

CREATE TABLE "EnterprisePurchaseReceiptOperationalLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseReceiptId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "idempotencyKey" TEXT,
  "warehouseId" TEXT,
  "storageLocationId" TEXT,
  "serviceAccepted" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterprisePurchaseReceiptOperationalLink_pkey" PRIMARY KEY ("id")
);
