-- Nullable physical allocation snapshot; historical checkout lines unchanged.
ALTER TABLE "EnterpriseRetailInvoiceCheckoutLine" ADD COLUMN "lotAllocations" JSONB;
