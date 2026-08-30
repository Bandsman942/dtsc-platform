-- DTSC Platform — hotfix #518
-- Repair operator provider catalogues for Retail tenants whose operator modules
-- are enabled while the technical profile remains RETAIL_CORE.
--
-- This migration is additive/idempotent DML only. It creates/reactivates the
-- canonical provider identities required by the active modules. It never
-- creates financial accounts, wallet mappings, balances or exchange rates.

WITH mobile_money_orgs AS (
  SELECT DISTINCT o."id" AS "organizationId"
  FROM "Organization" o
  INNER JOIN "EnterpriseModule" m
    ON m."organizationId" = o."id"
   AND m."moduleCode" = 'MOBILE_MONEY_AGENCY'
   AND m."isEnabled" = true
  WHERE o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
    AND o."sectorCode" = 'COMMERCE_RETAIL'
), mobile_money_providers AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"MPESA","label":"M-Pesa"},
    {"code":"ORANGE_MONEY","label":"Orange Money"},
    {"code":"AIRTEL_MONEY","label":"Airtel Money"},
    {"code":"AFRIMONEY","label":"Afrimoney"}
  ]'::jsonb) AS p("code" TEXT, "label" TEXT)
)
INSERT INTO "EnterpriseRetailProvider" (
  "id",
  "organizationId",
  "providerCode",
  "label",
  "providerType",
  "isActive",
  "revision",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('retail-provider-', SUBSTRING(md5(o."organizationId" || ':' || p."code") FROM 1 FOR 20)),
  o."organizationId",
  p."code",
  p."label",
  'MOBILE_MONEY',
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM mobile_money_orgs o
CROSS JOIN mobile_money_providers p
ON CONFLICT ("organizationId", "providerCode") DO UPDATE SET
  "label" = EXCLUDED."label",
  "providerType" = 'MOBILE_MONEY',
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "EnterpriseRetailProvider"."revision" + 1;

WITH telco_orgs AS (
  SELECT DISTINCT o."id" AS "organizationId"
  FROM "Organization" o
  INNER JOIN "EnterpriseModule" m
    ON m."organizationId" = o."id"
   AND m."moduleCode" = 'TELCO_TOPUPS'
   AND m."isEnabled" = true
  WHERE o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
    AND o."sectorCode" = 'COMMERCE_RETAIL'
), telco_providers AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"VODACOM","label":"Vodacom"},
    {"code":"ORANGE","label":"Orange"},
    {"code":"AIRTEL","label":"Airtel"},
    {"code":"AFRICELL","label":"Africell"}
  ]'::jsonb) AS p("code" TEXT, "label" TEXT)
)
INSERT INTO "EnterpriseRetailProvider" (
  "id",
  "organizationId",
  "providerCode",
  "label",
  "providerType",
  "isActive",
  "revision",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('retail-provider-', SUBSTRING(md5(o."organizationId" || ':' || p."code") FROM 1 FOR 20)),
  o."organizationId",
  p."code",
  p."label",
  'TELCO',
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM telco_orgs o
CROSS JOIN telco_providers p
ON CONFLICT ("organizationId", "providerCode") DO UPDATE SET
  "label" = EXCLUDED."label",
  "providerType" = 'TELCO',
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "EnterpriseRetailProvider"."revision" + 1;
