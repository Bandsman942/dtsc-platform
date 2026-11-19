-- Physical evidence for multi-batch invoice returns; existing records unchanged.
ALTER TABLE "EnterpriseRetailInvoiceReturnLine" ADD COLUMN "lotAllocations" JSONB;
