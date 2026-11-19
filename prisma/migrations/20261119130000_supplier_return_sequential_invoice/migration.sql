-- Maintain the database's one-active-return invariant. A closed, reconciled
-- return is historical evidence, not a permanent lock on its original bill.
-- Create the narrower unique index before removing the obsolete stronger index;
-- no data, source reference, audit record or credit uniqueness is removed.
CREATE UNIQUE INDEX "supplier_return_one_active_invoice_idx"
  ON "EnterpriseSupplierReturnRequest" ("organizationId","supplierInvoiceId")
  WHERE "status" IN ('PENDING_APPROVAL','APPROVED','DISPATCHED');
DROP INDEX "supplier_return_one_live_invoice_idx";
