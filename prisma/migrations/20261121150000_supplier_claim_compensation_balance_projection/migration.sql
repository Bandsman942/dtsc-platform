-- Separate non-cash liability settlement from supplier credit notes or payments.
-- All existing enterprise invoices and payables start with zero compensations;
-- the earlier compensation implementation in this PR has never been deployed.
ALTER TABLE "EnterprisePayable"
  ADD COLUMN "compensatedAmount" DECIMAL(20,6) NOT NULL DEFAULT 0;
ALTER TABLE "EnterpriseSupplierInvoice"
  ADD COLUMN "amountCompensated" DECIMAL(20,6) NOT NULL DEFAULT 0;
ALTER TABLE "EnterprisePayable"
  ADD CONSTRAINT "enterprise_payable_compensated_nonnegative" CHECK ("compensatedAmount" >= 0);
ALTER TABLE "EnterpriseSupplierInvoice"
  ADD CONSTRAINT "supplier_invoice_amount_compensated_nonnegative" CHECK ("amountCompensated" >= 0);
