-- RETAIL #1042: bind each independently approved invoice return to exactly
-- one canonical Finance refund payment and credit note before settlement.
-- Additive nullable columns preserve all historical requests (feature OFF).
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD COLUMN "refundPaymentId" TEXT,
  ADD COLUMN "salesCreditNoteId" TEXT,
  ADD COLUMN "preparedByUserId" TEXT,
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "settledByUserId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD COLUMN "refundNetAmount" DECIMAL(20,6),
  ADD COLUMN "refundTaxAmount" DECIMAL(20,6);

-- Historical rows stay nullable and require an explicit review before the
-- new settlement may proceed. New rows carry exact Finance net/tax splits.
ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD CONSTRAINT "retail_invoice_return_line_tax_split_check"
  CHECK (
    ("refundNetAmount" IS NULL AND "refundTaxAmount" IS NULL)
    OR (
      "refundNetAmount" >= 0 AND "refundTaxAmount" >= 0
      AND "refundNetAmount" + "refundTaxAmount" = "refundAmount"
    )
  );

CREATE UNIQUE INDEX "retail_invoice_return_request_refund_payment_key"
  ON "EnterpriseRetailInvoiceReturnRequest" ("organizationId", "refundPaymentId");
CREATE UNIQUE INDEX "retail_invoice_return_request_credit_note_key"
  ON "EnterpriseRetailInvoiceReturnRequest" ("organizationId", "salesCreditNoteId");

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_refund_payment_fkey"
  FOREIGN KEY ("organizationId", "refundPaymentId")
  REFERENCES "EnterprisePayment" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_credit_note_fkey"
  FOREIGN KEY ("organizationId", "salesCreditNoteId")
  REFERENCES "EnterpriseSalesCreditNote" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  DROP CONSTRAINT "retail_invoice_return_request_status_check";
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_request_status_check"
  CHECK ("status" IN (
    'SUBMITTED', 'INSPECTED', 'APPROVED', 'FINANCE_PENDING',
    'REJECTED', 'CANCELLED', 'COMPLETED'
  ));
ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_finance_pending_check"
  CHECK (
    "status" <> 'FINANCE_PENDING' OR
    ("refundPaymentId" IS NOT NULL AND "salesCreditNoteId" IS NOT NULL
      AND "preparedByUserId" IS NOT NULL AND "preparedAt" IS NOT NULL)
  );

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_completed_finance_check"
  CHECK (
    "status" <> 'COMPLETED' OR
    ("refundPaymentId" IS NOT NULL AND "salesCreditNoteId" IS NOT NULL
      AND "preparedByUserId" IS NOT NULL AND "preparedAt" IS NOT NULL
      AND "settledByUserId" IS NOT NULL AND "completedAt" IS NOT NULL)
  ) NOT VALID;
