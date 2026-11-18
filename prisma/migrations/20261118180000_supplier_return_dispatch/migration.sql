-- Additive evidence columns. No physical or financial backfill.
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "dispatchedByUserId" TEXT,
  ADD COLUMN "dispatchReference" TEXT,
  ADD COLUMN "dispatchMovementId" TEXT,
  ADD COLUMN "dispatchAccountingEventId" TEXT;
ALTER TABLE "EnterpriseSupplierReturnRequest" DROP CONSTRAINT "supplier_return_status_check";
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_status_check"
  CHECK ("status" IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','DISPATCHED'));
ALTER TABLE "EnterpriseSupplierReturnRequest" ADD CONSTRAINT "supplier_return_dispatch_evidence_check"
  CHECK (("status" = 'DISPATCHED' AND "dispatchedAt" IS NOT NULL AND "dispatchedByUserId" IS NOT NULL AND "dispatchReference" IS NOT NULL AND "dispatchMovementId" IS NOT NULL AND "dispatchAccountingEventId" IS NOT NULL)
  OR ("status" <> 'DISPATCHED' AND "dispatchedAt" IS NULL AND "dispatchedByUserId" IS NULL AND "dispatchReference" IS NULL AND "dispatchMovementId" IS NULL AND "dispatchAccountingEventId" IS NULL));
CREATE UNIQUE INDEX "supplier_return_dispatch_movement_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","dispatchMovementId");
CREATE UNIQUE INDEX "supplier_return_dispatch_event_key" ON "EnterpriseSupplierReturnRequest" ("organizationId","dispatchAccountingEventId");
DROP INDEX "supplier_return_one_live_invoice_idx";
CREATE UNIQUE INDEX "supplier_return_one_live_invoice_idx" ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierInvoiceId") WHERE "status" IN ('PENDING_APPROVAL','APPROVED','DISPATCHED');
