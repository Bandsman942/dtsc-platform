-- A Retail cashier's immutable intent refers to the single Finance payment.
-- This contains no money balances or independent payment status.
CREATE TABLE "EnterpriseRetailInvoicePaymentProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailInvoicePaymentProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailInvoicePaymentProposal_organizationId_id_key" ON "EnterpriseRetailInvoicePaymentProposal"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailInvoicePaymentProposal_organizationId_payme_key" ON "EnterpriseRetailInvoicePaymentProposal"("organizationId", "paymentId");
CREATE UNIQUE INDEX "EnterpriseRetailInvoicePaymentProposal_organizationId_idemp_key" ON "EnterpriseRetailInvoicePaymentProposal"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailInvoicePaymentProposal_organizationId_check_idx" ON "EnterpriseRetailInvoicePaymentProposal"("organizationId", "checkoutId", "createdAt");

ALTER TABLE "EnterpriseRetailInvoicePaymentProposal" ADD CONSTRAINT "EnterpriseRetailInvoicePaymentProposal_organizationId_chec_fkey" FOREIGN KEY ("organizationId", "checkoutId") REFERENCES "EnterpriseRetailInvoiceCheckout"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailInvoicePaymentProposal" ADD CONSTRAINT "EnterpriseRetailInvoicePaymentProposal_organizationId_paym_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
