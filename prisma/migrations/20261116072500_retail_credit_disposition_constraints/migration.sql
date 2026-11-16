-- #1187: Align the database return-line disposition with validated RETAIL lifecycle.
-- A service is credited without stock movement; an undelivered article releases
-- its reservation without a fictitious physical return. This only broadens
-- the accepted enum-like values; all tenant FKs and amount checks remain intact.
ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  DROP CONSTRAINT "retail_invoice_return_line_disposition_check";

ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD CONSTRAINT "retail_invoice_return_line_disposition_check"
  CHECK ("stockDisposition" IN (
    'RESTOCK', 'QUARANTINE', 'DISPOSE', 'SERVICE_CREDIT', 'UNDELIVERED_CREDIT'
  ));

-- Legacy fully paid returns use a canonical refund payment. With a credit-only
-- return, no payout must be created and no refundPaymentId can exist.
-- COALESCE is intentional: NULL on historical rows is not proof of a zero payout.
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  DROP CONSTRAINT "retail_invoice_return_finance_pending_check";
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_finance_pending_check"
  CHECK (
    "status" <> 'FINANCE_PENDING' OR (
      ("refundPaymentId" IS NOT NULL OR COALESCE("refundPayoutAmount" = 0, FALSE))
      AND "salesCreditNoteId" IS NOT NULL
      AND "preparedByUserId" IS NOT NULL AND "preparedAt" IS NOT NULL
    )
  );

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  DROP CONSTRAINT "retail_invoice_return_completed_finance_check";
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_completed_finance_check"
  CHECK (
    "status" <> 'COMPLETED' OR (
      ("refundPaymentId" IS NOT NULL OR COALESCE("refundPayoutAmount" = 0, FALSE))
      AND "salesCreditNoteId" IS NOT NULL
      AND "preparedByUserId" IS NOT NULL AND "preparedAt" IS NOT NULL
      AND "settledByUserId" IS NOT NULL AND "completedAt" IS NOT NULL
    )
  ) NOT VALID;
