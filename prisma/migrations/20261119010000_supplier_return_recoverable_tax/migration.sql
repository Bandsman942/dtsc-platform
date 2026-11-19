-- Previously admitted returns were untaxed by construction. Preserve all historical values.
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD COLUMN "recoverableTaxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0;
ALTER TABLE "EnterpriseSupplierReturnRequest"
  ADD CONSTRAINT "supplier_return_recoverable_tax_nonnegative" CHECK ("recoverableTaxAmount" >= 0 AND "totalCost" + "recoverableTaxAmount" <= 99999999999999.999999);
