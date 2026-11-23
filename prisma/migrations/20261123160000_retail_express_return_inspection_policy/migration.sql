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
END $$;

-- Refunds deliberately deferred to a later cashier/confirmed settlement need
-- an explicit state; a status CHECK from #1042 otherwise rejects the commit.
-- Existing COMPLETED and FINANCE_PENDING invariants remain unchanged.
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  DROP CONSTRAINT "retail_invoice_return_request_status_check";
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_request_status_check"
  CHECK ("status" IN (
    'SUBMITTED', 'INSPECTED', 'APPROVED', 'FINANCE_PENDING',
    'REFUND_PENDING', 'REJECTED', 'CANCELLED', 'COMPLETED'
  ));
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_refund_pending_check"
  CHECK (
    "status" <> 'REFUND_PENDING' OR (
      "refundChoice" = 'LATER'
      AND "refundPaymentId" IS NOT NULL
      AND "salesCreditNoteId" IS NOT NULL
      AND "preparedByUserId" IS NOT NULL
      AND "preparedAt" IS NOT NULL
      AND "settledByUserId" IS NOT NULL
      AND "refundPayoutAmount" > 0
      AND "completedAt" IS NULL
    )
  );
