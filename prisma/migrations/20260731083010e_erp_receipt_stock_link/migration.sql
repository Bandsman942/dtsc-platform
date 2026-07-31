-- DTSC ERP consolidation iteration 02: receipt item to stock movement link.

CREATE TABLE "EnterprisePurchaseReceiptItemStockLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseReceiptItemId" TEXT NOT NULL,
  "stockMovementId" TEXT,
  "serviceAccepted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterprisePurchaseReceiptItemStockLink_pkey" PRIMARY KEY ("id")
);
