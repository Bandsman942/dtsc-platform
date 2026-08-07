-- Shop Release Candidate 1.0
-- Additive convergence for commercial-ready Shop onboarding and operations.

-- ---------------------------------------------------------------------------
-- 1. Split Mobile Money wallets from telecom network operators.
-- Preserve any tenant-configured telco float mapping by moving it to the
-- corresponding network provider before specializing the wallet provider.
-- ---------------------------------------------------------------------------
WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL'
    AND o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
), networks AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"VODACOM","label":"Vodacom","wallet":"MPESA"},
    {"code":"ORANGE","label":"Orange","wallet":"ORANGE_MONEY"},
    {"code":"AIRTEL","label":"Airtel","wallet":"AIRTEL_MONEY"},
    {"code":"AFRICELL","label":"Africell","wallet":"AFRIMONEY"}
  ]'::jsonb) AS p("code" TEXT, "label" TEXT, "wallet" TEXT)
)
INSERT INTO "EnterpriseRetailProvider" (
  "id", "organizationId", "providerCode", "label", "providerType",
  "telcoFloatAccountId", "isActive", "revision", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-provider-', SUBSTRING(md5(o."organizationId" || ':' || n."code") FROM 1 FOR 20)),
  o."organizationId",
  n."code",
  n."label",
  'TELCO',
  wallet."telcoFloatAccountId",
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM commerce_orgs o
CROSS JOIN networks n
LEFT JOIN "EnterpriseRetailProvider" wallet
  ON wallet."organizationId" = o."organizationId"
 AND wallet."providerCode" = n."wallet"
ON CONFLICT ("organizationId", "providerCode") DO UPDATE SET
  "label" = EXCLUDED."label",
  "providerType" = 'TELCO',
  "telcoFloatAccountId" = COALESCE("EnterpriseRetailProvider"."telcoFloatAccountId", EXCLUDED."telcoFloatAccountId"),
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "EnterpriseRetailProvider"."revision" + 1;

UPDATE "EnterpriseRetailProvider"
SET
  "providerType" = 'MOBILE_MONEY',
  "telcoFloatAccountId" = NULL,
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "revision" + 1
WHERE "organizationId" IN (
  SELECT o."id" FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL'
    AND o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
)
AND "providerCode" IN ('MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'AFRIMONEY');

-- ---------------------------------------------------------------------------
-- 2. External provider references are unique for operations created by the
-- Release Candidate. Legacy rows remain immutable and are not rewritten.
-- createdAt is TIMESTAMP (without time zone), so use an immutable TIMESTAMP
-- literal in the partial-index predicate.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseMobileMoneyTransaction_rc1_external_ref_key"
ON "EnterpriseMobileMoneyTransaction"("organizationId", "providerCode", "externalReference")
WHERE "externalReference" IS NOT NULL AND "createdAt" >= TIMESTAMP '2026-08-07 08:40:00';

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseTelcoTopup_rc1_external_ref_key"
ON "EnterpriseTelcoTopup"("organizationId", "providerCode", "externalReference")
WHERE "externalReference" IS NOT NULL AND "createdAt" >= TIMESTAMP '2026-08-07 08:40:00';

-- ---------------------------------------------------------------------------
-- 3. Purchase Manager must actually manage suppliers and purchases.
-- Keep template and already-provisioned tenant positions aligned.
-- ---------------------------------------------------------------------------
UPDATE "SectorTemplatePosition" p
SET
  "defaultPermissionsJson" = '["enterprise.inventory.read","enterprise.catalog.update","enterprise.sites.read","enterprise.suppliers.view","enterprise.suppliers.manage","enterprise.purchases.manage"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE p."positionCode" = 'PURCHASE_MANAGER'
  AND p."templateId" IN (
    SELECT t."id"
    FROM "SectorTemplate" t
    JOIN "BusinessSector" s ON s."id" = t."sectorId"
    WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
  );

UPDATE "EnterprisePosition" p
SET
  "permissionsJson" = '["enterprise.inventory.read","enterprise.catalog.update","enterprise.sites.read","enterprise.suppliers.view","enterprise.suppliers.manage","enterprise.purchases.manage"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE p."positionCode" = 'PURCHASE_MANAGER'
  AND p."organizationId" IN (
    SELECT o."id"
    FROM "Organization" o
    WHERE o."sectorCode" = 'COMMERCE_RETAIL'
      AND o."deletedAt" IS NULL
      AND o."organizationType" = 'CLIENT'
  );
