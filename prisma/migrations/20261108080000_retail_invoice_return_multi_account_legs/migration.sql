-- Additive, tenant-scoped Finance payout legs for one canonical Retail return.
-- Existing single-payment returns keep their original binding and need no backfill.
CREATE TABLE "EnterpriseRetailInvoiceReturnRefundLeg" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "refundPaymentId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    CONSTRAINT "EnterpriseRetailInvoiceReturnRefundLeg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retail_invoice_return_refund_leg_payment_key"
    ON "EnterpriseRetailInvoiceReturnRefundLeg"("organizationId", "refundPaymentId");
CREATE UNIQUE INDEX "retail_invoice_return_refund_leg_account_key"
    ON "EnterpriseRetailInvoiceReturnRefundLeg"("organizationId", "returnRequestId", "financialAccountId");
CREATE INDEX "retail_invoice_return_refund_leg_request_idx"
    ON "EnterpriseRetailInvoiceReturnRefundLeg"("organizationId", "returnRequestId");

ALTER TABLE "EnterpriseRetailInvoiceReturnRefundLeg"
    ADD CONSTRAINT "EnterpriseRetailInvoiceReturnRefundLeg_organizationId_returnRequestId_fkey"
    FOREIGN KEY ("organizationId", "returnRequestId")
    REFERENCES "EnterpriseRetailInvoiceReturnRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceReturnRefundLeg"
    ADD CONSTRAINT "EnterpriseRetailInvoiceReturnRefundLeg_organizationId_refundPaymentId_fkey"
    FOREIGN KEY ("organizationId", "refundPaymentId")
    REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoiceReturnRefundLeg"
    ADD CONSTRAINT "EnterpriseRetailInvoiceReturnRefundLeg_organizationId_financialAccountId_fkey"
    FOREIGN KEY ("organizationId", "financialAccountId")
    REFERENCES "EnterpriseFinancialAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
