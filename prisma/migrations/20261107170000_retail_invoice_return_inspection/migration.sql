-- Retail invoice returns: independent physical inspection is required before
-- Finance approval. No stock or Finance ledger is mutated by inspection.
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD COLUMN "inspectedByUserId" TEXT,
  ADD COLUMN "inspectedAt" TIMESTAMP(3),
  ADD COLUMN "inspectionNotes" TEXT;

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  DROP CONSTRAINT "retail_invoice_return_request_status_check";

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_request_status_check"
  CHECK ("status" IN ('SUBMITTED', 'INSPECTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'));

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_inspection_state_check"
  CHECK (
    ("status" <> 'INSPECTED')
    OR ("inspectedByUserId" IS NOT NULL AND "inspectedAt" IS NOT NULL AND length(trim("inspectionNotes")) >= 5)
  );
