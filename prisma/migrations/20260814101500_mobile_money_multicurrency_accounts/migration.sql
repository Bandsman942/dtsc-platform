-- DTSC #307 — Mobile Money multi-currency operator accounts.
-- Additive only: legacy EnterpriseRetailProvider.mobileMoneyFloatAccountId remains available
-- during the compatibility window and is backfilled into the canonical mapping table.

CREATE TABLE "EnterpriseRetailProviderAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "accountUse" TEXT NOT NULL DEFAULT 'MOBILE_MONEY_FLOAT',
    "currencyCode" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMobileMoneyFxTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "sourceProviderAccountId" TEXT NOT NULL,
    "targetProviderAccountId" TEXT NOT NULL,
    "sourceFloatAccountId" TEXT NOT NULL,
    "targetFloatAccountId" TEXT NOT NULL,
    "sourceCurrencyCode" TEXT NOT NULL,
    "targetCurrencyCode" TEXT NOT NULL,
    "sourceAmount" DECIMAL(20,6) NOT NULL,
    "targetAmount" DECIMAL(20,6) NOT NULL,
    "exchangeRate" DECIMAL(24,12) NOT NULL,
    "exchangeRateId" TEXT,
    "exchangeRateDate" TIMESTAMP(3) NOT NULL,
    "exchangeRateSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseMobileMoneyFxTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailProviderAccount_organizationId_id_key"
  ON "EnterpriseRetailProviderAccount"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailProviderAccount_org_provider_use_currency_key"
  ON "EnterpriseRetailProviderAccount"("organizationId", "providerId", "accountUse", "currencyCode");
CREATE INDEX "EnterpriseRetailProviderAccount_org_providerCode_use_active_idx"
  ON "EnterpriseRetailProviderAccount"("organizationId", "providerCode", "accountUse", "isActive");
CREATE INDEX "EnterpriseRetailProviderAccount_org_financialAccount_active_idx"
  ON "EnterpriseRetailProviderAccount"("organizationId", "financialAccountId", "isActive");

CREATE UNIQUE INDEX "EnterpriseMobileMoneyFxTransfer_organizationId_id_key"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseMobileMoneyFxTransfer_organizationId_number_key"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseMobileMoneyFxTransfer_organizationId_idempotencyKey_key"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseMobileMoneyFxTransfer_org_provider_occurredAt_idx"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "providerCode", "occurredAt");
CREATE INDEX "EnterpriseMobileMoneyFxTransfer_org_status_occurredAt_idx"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "status", "occurredAt");
CREATE INDEX "EnterpriseMobileMoneyFxTransfer_org_sourceFloat_occurredAt_idx"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "sourceFloatAccountId", "occurredAt");
CREATE INDEX "EnterpriseMobileMoneyFxTransfer_org_targetFloat_occurredAt_idx"
  ON "EnterpriseMobileMoneyFxTransfer"("organizationId", "targetFloatAccountId", "occurredAt");

-- Preserve every explicit legacy mapping. The deterministic textual id keeps this backfill
-- safe if a database operator needs to inspect/replay the statement during incident recovery.
INSERT INTO "EnterpriseRetailProviderAccount" (
  "id",
  "organizationId",
  "providerId",
  "providerCode",
  "accountUse",
  "currencyCode",
  "financialAccountId",
  "isActive",
  "createdByUserId",
  "updatedByUserId",
  "revision",
  "createdAt",
  "updatedAt"
)
SELECT
  'mmmap_' || md5(p."organizationId" || ':' || p."id" || ':' || a."currencyCode"),
  p."organizationId",
  p."id",
  p."providerCode",
  'MOBILE_MONEY_FLOAT',
  a."currencyCode",
  a."id",
  true,
  'migration-307',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EnterpriseRetailProvider" p
JOIN "EnterpriseFinancialAccount" a
  ON a."organizationId" = p."organizationId"
 AND a."id" = p."mobileMoneyFloatAccountId"
WHERE p."mobileMoneyFloatAccountId" IS NOT NULL
  AND p."providerType" IN ('MOBILE_MONEY', 'BOTH')
  AND a."accountType" = 'MOBILE_MONEY'
  AND a."status" = 'ACTIVE'
  AND a."archivedAt" IS NULL
ON CONFLICT ("organizationId", "providerId", "accountUse", "currencyCode") DO NOTHING;
