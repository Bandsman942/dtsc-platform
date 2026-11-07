-- RETAIL #1042 — return requests only. The canonical SalesInvoice and
-- Finance credit note/payment/Inventory movement remain single ledgers.
-- There is intentionally no automatic financial posting at this stage.

-- Cross-invoice linkage is forbidden by composite foreign keys.
CREATE UNIQUE INDEX "retail_invoice_checkout_line_scoped_id_key"
  ON "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "checkoutId", "id");

CREATE TABLE "EnterpriseRetailInvoiceReturnRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "reason" TEXT NOT NULL,
  "refundAmount" DECIMAL(20,6) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "approverUserId" TEXT NOT NULL,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailInvoiceReturnRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retail_invoice_return_request_positive_check" CHECK ("refundAmount" > 0),
  CONSTRAINT "retail_invoice_return_request_status_check" CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'))
);

CREATE TABLE "EnterpriseRetailInvoiceReturnLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "checkoutLineId" TEXT NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "refundAmount" DECIMAL(20,6) NOT NULL,
  "stockDisposition" TEXT NOT NULL,
  CONSTRAINT "EnterpriseRetailInvoiceReturnLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retail_invoice_return_line_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "retail_invoice_return_line_amount_check" CHECK ("refundAmount" >= 0),
  CONSTRAINT "retail_invoice_return_line_disposition_check" CHECK ("stockDisposition" IN ('RESTOCK', 'QUARANTINE', 'DISPOSE'))
);

CREATE UNIQUE INDEX "retail_invoice_return_request_org_id_key"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "id");
CREATE UNIQUE INDEX "retail_invoice_return_request_scoped_id_key"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "id", "checkoutId");
CREATE UNIQUE INDEX "retail_invoice_return_request_org_number_key"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "number");
CREATE UNIQUE INDEX "retail_invoice_return_request_org_idempotency_key"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "idempotencyKey");
CREATE INDEX "retail_invoice_return_request_checkout_status_idx"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "checkoutId", "status");
CREATE INDEX "retail_invoice_return_request_approver_status_idx"
  ON "EnterpriseRetailInvoiceReturnRequest"("organizationId", "approverUserId", "status");

CREATE UNIQUE INDEX "retail_invoice_return_line_org_id_key"
  ON "EnterpriseRetailInvoiceReturnLine"("organizationId", "id");
CREATE UNIQUE INDEX "retail_invoice_return_line_request_line_key"
  ON "EnterpriseRetailInvoiceReturnLine"("organizationId", "returnRequestId", "checkoutLineId");
CREATE INDEX "retail_invoice_return_line_checkout_line_idx"
  ON "EnterpriseRetailInvoiceReturnLine"("organizationId", "checkoutLineId");

ALTER TABLE "EnterpriseRetailInvoiceReturnRequest"
  ADD CONSTRAINT "retail_invoice_return_request_checkout_fkey"
  FOREIGN KEY ("organizationId", "checkoutId")
  REFERENCES "EnterpriseRetailInvoiceCheckout"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD CONSTRAINT "retail_invoice_return_line_request_fkey"
  FOREIGN KEY ("organizationId", "returnRequestId", "checkoutId")
  REFERENCES "EnterpriseRetailInvoiceReturnRequest"("organizationId", "id", "checkoutId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD CONSTRAINT "retail_invoice_return_line_checkout_line_fkey"
  FOREIGN KEY ("organizationId", "checkoutId", "checkoutLineId")
  REFERENCES "EnterpriseRetailInvoiceCheckoutLine"("organizationId", "checkoutId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
