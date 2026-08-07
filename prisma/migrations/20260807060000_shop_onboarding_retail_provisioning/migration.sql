-- DTSC Platform — Shop onboarding provisioning
-- Additive/idempotent data convergence for COMMERCE_RETAIL organizations created
-- after the initial RETAIL_TELCO_MOBILE_MONEY rollout and before runtime
-- provisioning became automatic.

WITH commerce_orgs AS (
  SELECT
    o."id" AS "organizationId",
    COALESCE(
      (
        SELECT om."userId"
        FROM "OrganizationMember" om
        WHERE om."organizationId" = o."id"
          AND om."status" = 'ACTIVE'
          AND om."removedAt" IS NULL
        ORDER BY
          CASE om."role"
            WHEN 'OWNER' THEN 0
            WHEN 'ADMIN_ENTREPRISE' THEN 1
            WHEN 'ADMIN_ENTERPRISE' THEN 2
            WHEN 'MANAGER' THEN 3
            ELSE 4
          END,
          om."createdAt" ASC
        LIMIT 1
      ),
      o."createdByDtscUserId"
    ) AS "actorUserId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL'
    AND o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
)
INSERT INTO "EnterpriseRetailConfiguration" (
  "id",
  "organizationId",
  "profileCode",
  "baseCurrencyCode",
  "status",
  "createdByUserId",
  "revision",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('retail-config-', SUBSTRING(md5(c."organizationId") FROM 1 FOR 20)),
  c."organizationId",
  'RETAIL_TELCO_MOBILE_MONEY',
  'CDF',
  'ACTIVE',
  c."actorUserId",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM commerce_orgs c
WHERE c."actorUserId" IS NOT NULL
ON CONFLICT ("organizationId") DO UPDATE SET
  "profileCode" = 'RETAIL_TELCO_MOBILE_MONEY',
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "EnterpriseRetailConfiguration"."revision" + 1;

WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL'
    AND o."deletedAt" IS NULL
    AND o."organizationType" = 'CLIENT'
), providers AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"MPESA","label":"M-Pesa","type":"BOTH"},
    {"code":"ORANGE_MONEY","label":"Orange Money","type":"BOTH"},
    {"code":"AIRTEL_MONEY","label":"Airtel Money","type":"BOTH"},
    {"code":"AFRIMONEY","label":"Afrimoney","type":"BOTH"}
  ]'::jsonb) AS p("code" TEXT, "label" TEXT, "type" TEXT)
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
  p."type",
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM commerce_orgs o
CROSS JOIN providers p
ON CONFLICT ("organizationId", "providerCode") DO UPDATE SET
  "label" = EXCLUDED."label",
  "providerType" = EXCLUDED."providerType",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
