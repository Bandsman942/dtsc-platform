-- HIRMS: independent UAT and Production provider connections for each tenant.
-- Previous UAT records remain UAT; no credential or activity is copied to Production.
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceConnector_organizationId_adapterCode_key";
CREATE UNIQUE INDEX "EnterpriseHealthInsuranceConnector_organizationId_adapterCode_environment_key"
 ON "EnterpriseHealthInsuranceConnector"("organizationId","adapterCode","environment");

ALTER TABLE "EnterpriseHealthInsuranceInvoiceSubmission"
 ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'UAT';
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_invoice_key";
CREATE UNIQUE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_organizationId_adapterCode_environment_salesInvoiceId_key"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","adapterCode","environment","salesInvoiceId");
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_date_idx";
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_batch_idx";
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_status_idx";
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_organizationId_environment_submittedAt_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","submittedAt");
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_organizationId_environment_batchId_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","batchId");
CREATE INDEX "EnterpriseHealthInsuranceInvoiceSubmission_organizationId_environment_transportStatus_submittedAt_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","transportStatus","submittedAt");
