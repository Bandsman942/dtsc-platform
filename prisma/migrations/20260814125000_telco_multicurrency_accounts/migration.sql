-- DTSC #310 — Telco multi-currency operator accounts.
-- Additive data backfill only: the generic EnterpriseRetailProviderAccount table already exists.
-- Legacy EnterpriseRetailProvider.telcoFloatAccountId remains during the compatibility window.

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
  'telmap_' || md5(p."organizationId" || ':' || p."id" || ':' || a."currencyCode"),
  p."organizationId",
  p."id",
  p."providerCode",
  'TELCO_FLOAT',
  a."currencyCode",
  a."id",
  true,
  'migration-310',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EnterpriseRetailProvider" p
JOIN "EnterpriseFinancialAccount" a
  ON a."organizationId" = p."organizationId"
 AND a."id" = p."telcoFloatAccountId"
WHERE p."telcoFloatAccountId" IS NOT NULL
  AND p."providerType" IN ('TELCO', 'BOTH')
  AND a."accountType" IN ('MOBILE_MONEY', 'CLEARING')
  AND a."status" = 'ACTIVE'
  AND a."archivedAt" IS NULL
ON CONFLICT ("organizationId", "providerId", "accountUse", "currencyCode") DO NOTHING;
