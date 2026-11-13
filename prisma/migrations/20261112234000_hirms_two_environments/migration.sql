-- HIRMS: independent UAT and Production provider connections for each tenant.
-- Previous UAT records remain UAT; no credential or activity is copied to Production.
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceConnector_organizationId_adapterCode_key";
CREATE UNIQUE INDEX "EHIConnector_org_adapter_env_key"
 ON "EnterpriseHealthInsuranceConnector"("organizationId","adapterCode","environment");

ALTER TABLE "EnterpriseHealthInsuranceInvoiceSubmission"
 ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'UAT';
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_invoice_key";
CREATE UNIQUE INDEX "EHIInvoiceSubmission_org_adapter_env_invoice_key"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","adapterCode","environment","salesInvoiceId");
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_date_idx";
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_batch_idx";
DROP INDEX IF EXISTS "EnterpriseHealthInsuranceInvoiceSubmission_tenant_status_idx";
CREATE INDEX "EHIInvoiceSubmission_org_env_date_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","submittedAt");
CREATE INDEX "EHIInvoiceSubmission_org_env_batch_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","batchId");
CREATE INDEX "EHIInvoiceSubmission_org_env_status_date_idx"
 ON "EnterpriseHealthInsuranceInvoiceSubmission"("organizationId","environment","transportStatus","submittedAt");
