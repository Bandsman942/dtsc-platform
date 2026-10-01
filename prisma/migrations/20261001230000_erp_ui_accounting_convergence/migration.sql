-- Hotfix #758: user-facing labels for fiscal masters.
-- Additive and nullable for historical compatibility.

ALTER TABLE "EnterpriseFiscalYear" ADD COLUMN "label" TEXT;
ALTER TABLE "EnterpriseFiscalPeriod" ADD COLUMN "label" TEXT;

-- Scope semantic mappings to their chart so a custom chart can be prepared
-- while another chart remains active.
ALTER TABLE "EnterpriseAccountMapping" ADD COLUMN "chartId" TEXT;

UPDATE "EnterpriseAccountMapping" AS mapping
SET "chartId" = account."chartId"
FROM "EnterpriseLedgerAccount" AS account
WHERE account."id" = mapping."ledgerAccountId"
  AND account."organizationId" = mapping."organizationId";

ALTER TABLE "EnterpriseAccountMapping" ALTER COLUMN "chartId" SET NOT NULL;

DROP INDEX "EnterpriseAccountMapping_organizationId_mappingKey_effectiveF_key";

CREATE UNIQUE INDEX "EnterpriseAccountMapping_organizationId_chartId_mappingKey_effe_key"
ON "EnterpriseAccountMapping"("organizationId", "chartId", "mappingKey", "effectiveFrom");

CREATE INDEX "EnterpriseAccountMapping_organizationId_chartId_isActive_idx"
ON "EnterpriseAccountMapping"("organizationId", "chartId", "isActive");

ALTER TABLE "EnterpriseAccountMapping"
ADD CONSTRAINT "EnterpriseAccountMapping_organizationId_chartId_fkey"
FOREIGN KEY ("organizationId", "chartId")
REFERENCES "EnterpriseChartOfAccounts"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
