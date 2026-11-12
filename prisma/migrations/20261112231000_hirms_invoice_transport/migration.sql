-- Health-insurance HSL invoice transport only; financial invoices stay canonical.
ALTER TABLE "EnterpriseHealthInsuranceConnector"
 ADD COLUMN "hslServiceProviderId" INTEGER;
CREATE TABLE "EnterpriseHealthInsuranceInvoiceSubmission" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "connectorId" TEXT NOT NULL,
 "adapterCode" TEXT NOT NULL DEFAULT 'HIRMS_HSL',
 "salesInvoiceId" TEXT NOT NULL,
 "invoiceNumber" TEXT NOT NULL,
 "batchId" TEXT,
 "payloadDigest" TEXT NOT NULL,
 "transportStatus" TEXT NOT NULL DEFAULT 'SENDING',
 "httpStatus" INTEGER,
 "errorCode" TEXT,
 "externalReference" TEXT,
 "createdByUserId" TEXT NOT NULL,
 "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EnterpriseHealthInsuranceInvoiceSubmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_tenant_invoice_key"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","adapterCode","salesInvoiceId");
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_tenant_date_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","submittedAt");
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_tenant_batch_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","batchId");
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_tenant_status_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","transportStatus","submittedAt");
ALTER TABLE "EnterpriseHealthInsuranceInvoiceSubmission"
 ADD CONSTRAINT "EnterpriseHealthInsuranceInvoiceSubmission_connector_fkey"
 FOREIGN KEY ("organizationId","connectorId")
 REFERENCES "EnterpriseHealthInsuranceConnector"("organizationId","id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
