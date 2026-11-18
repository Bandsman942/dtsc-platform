-- Additive and empty on creation. No historical movements or accounting entries are rewritten.
CREATE TABLE "EnterpriseSupplierReturnRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "receiptItemId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "storageLocationId" TEXT,
  "stockLotId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplierInvoiceId" TEXT NOT NULL,
  "supplierInvoiceItemId" TEXT NOT NULL,
  "receiptAccountingEventId" TEXT NOT NULL,
  "originCostLayerId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitCost" DECIMAL(20,6) NOT NULL,
  "totalCost" DECIMAL(20,6) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "idempotencyKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseSupplierReturnRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_return_positive_check" CHECK ("quantity" > 0 AND "unitCost" > 0 AND "totalCost" > 0 AND "totalCost" = ROUND("quantity" * "unitCost", 6)),
  CONSTRAINT "supplier_return_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'))
);
CREATE UNIQUE INDEX "supplier_return_org_id_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","id");
CREATE UNIQUE INDEX "supplier_return_reference_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","reference");
CREATE UNIQUE INDEX "supplier_return_idempotency_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","idempotencyKey");
CREATE INDEX "supplier_return_purchase_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","purchaseId","createdAt");
CREATE INDEX "supplier_return_movement_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","sourceMovementId","status");
CREATE INDEX "supplier_return_invoice_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierInvoiceId","status");
-- In the initial restricted workflow a supplier invoice may hold only one live
-- return request until physical dispatch and credit reconciliation are implemented.
CREATE UNIQUE INDEX "supplier_return_one_live_invoice_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierInvoiceId") WHERE "status" IN ('PENDING_APPROVAL','APPROVED');
