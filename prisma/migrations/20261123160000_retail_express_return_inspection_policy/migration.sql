-- #1222: the legacy return audit remains intact. Missing snapshot means STANDARD.
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD COLUMN IF NOT EXISTS "inspectionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "returnPolicySnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "refundChoice" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retail_invoice_return_inspection_mode_chk') THEN
    ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
      ADD CONSTRAINT "retail_invoice_return_inspection_mode_chk"
      CHECK ("inspectionMode" IS NULL OR "inspectionMode" IN ('INDEPENDENT', 'SELF_ATTESTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retail_invoice_return_refund_choice_chk') THEN
    ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
      ADD CONSTRAINT "retail_invoice_return_refund_choice_chk"
      CHECK ("refundChoice" IS NULL OR "refundChoice" IN ('NOW', 'LATER'));
  END IF;
END $;
