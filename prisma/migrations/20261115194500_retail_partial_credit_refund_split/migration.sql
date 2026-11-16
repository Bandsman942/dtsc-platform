-- #1187 split credit-note face value from the cash-refund settlement amount.
-- Additive only: null identifies historical return requests, which retain
-- their existing one-to-one credit/refund accounting until new settlement.
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest" ADD COLUMN IF NOT EXISTS "refundPayoutAmount" DECIMAL(20,6);
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest" ADD COLUMN IF NOT EXISTS "financeApproverUserId" TEXT;
