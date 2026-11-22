-- The invoice issuer's legal identity must not change when company settings are edited.
ALTER TABLE "EnterpriseRetailInvoiceCheckout" ADD COLUMN "invoiceHeaderSnapshot" JSONB;
