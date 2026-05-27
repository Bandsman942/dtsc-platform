-- Crée l'organisation interne DTSC comme tenant explicite et rattache les
-- collaborateurs DTSC déjà liés à un dossier RH actif.

UPDATE "Organization"
SET "slug" = CONCAT("slug", '-', LEFT("id", 8)), "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'dtsc' AND "id" <> 'dtsc-internal';

INSERT INTO "Organization" (
  "id",
  "name",
  "slug",
  "status",
  "organizationType",
  "sector",
  "industry",
  "country",
  "city",
  "timezone",
  "createdAt",
  "updatedAt"
)
VALUES (
  'dtsc-internal',
  'DTSC',
  'dtsc',
  'ACTIVE',
  'DTSC_INTERNAL',
  'Data, IA et transformation digitale',
  'Conseil technologique',
  'République démocratique du Congo',
  'Kinshasa',
  'Africa/Kinshasa',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = 'DTSC',
  "slug" = 'dtsc',
  "status" = 'ACTIVE',
  "organizationType" = 'DTSC_INTERNAL',
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "OrganizationMember" (
  "id",
  "organizationId",
  "userId",
  "role",
  "status",
  "joinedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('dtsc-member-', h."userId"),
  'dtsc-internal',
  h."userId",
  CASE
    WHEN u."role"::text = 'ADMIN' THEN 'OWNER'
    WHEN u."role"::text = 'MANAGER' THEN 'MANAGER'
    WHEN u."role"::text = 'SUPPORT' THEN 'MANAGER'
    ELSE 'MEMBER'
  END,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "HrcfoEmployee" h
JOIN "User" u ON u."id" = h."userId"
WHERE h."userId" IS NOT NULL
  AND h."status" <> 'EXITED'
  AND u."status"::text = 'ACTIVE'
ON CONFLICT ("organizationId", "userId") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = 'ACTIVE',
  "removedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "CollaborationGroup"
SET "organizationId" = 'dtsc-internal', "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NULL;
