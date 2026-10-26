-- CASHBACK/CREDIT are customer-bound store credits, never cash or a financial
-- account. Existing bearer vouchers and financial tenders remain unchanged.
ALTER TABLE "EnterpriseRetailStoredValueAccount"
  ADD COLUMN "benefitScopeKey" TEXT;

CREATE UNIQUE INDEX "EnterpriseRetailStoredValueAccount_organizationId_benefitScopeKey_key"
  ON "EnterpriseRetailStoredValueAccount"("organizationId", "benefitScopeKey");

ALTER TABLE "EnterpriseRetailTender"
  ALTER COLUMN "financialAccountId" DROP NOT NULL,
  ADD COLUMN "storedValueAccountId" TEXT;

CREATE INDEX "EnterpriseRetailTender_organizationId_storedValueAccountId_createdAt_idx"
  ON "EnterpriseRetailTender"("organizationId", "storedValueAccountId", "createdAt");

ALTER TABLE "EnterpriseRetailRefund"
  ADD COLUMN "storedValueAccountId" TEXT;

CREATE INDEX "EnterpriseRetailRefund_organizationId_storedValueAccountId_createdAt_idx"
  ON "EnterpriseRetailRefund"("organizationId", "storedValueAccountId", "createdAt");

-- A tender/refund must be backed by exactly one legitimate value source.
ALTER TABLE "EnterpriseRetailTender"
  ADD CONSTRAINT "retail_tender_one_account_source" CHECK (
    ("methodType" = 'STORE_CREDIT' AND "storedValueAccountId" IS NOT NULL AND "financialAccountId" IS NULL)
    OR ("methodType" <> 'STORE_CREDIT' AND "storedValueAccountId" IS NULL AND "financialAccountId" IS NOT NULL)
  );

ALTER TABLE "EnterpriseRetailRefund"
  ADD CONSTRAINT "retail_refund_one_account_source" CHECK (
    ("methodType" = 'STORE_CREDIT' AND "storedValueAccountId" IS NOT NULL AND "financialAccountId" IS NULL)
    OR ("methodType" <> 'STORE_CREDIT' AND "storedValueAccountId" IS NULL AND "financialAccountId" IS NOT NULL)
  );
