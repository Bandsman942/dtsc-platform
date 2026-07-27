-- Keep DTSC HR collaborators aligned with the internal organization membership.
-- This repairs existing employees that were linked to HrcfoEmployee before the
-- multi-tenant membership became mandatory for /activities, /calendar and /admin.

INSERT INTO "OrganizationMember" (
  "id",
  "organizationId",
  "userId",
  "role",
  "status",
  "joinedAt",
  "createdAt",
  "updatedAt",
  "removedAt"
)
SELECT
  'dtsc-internal-' || employee."id",
  'dtsc-internal',
  employee."userId",
  app_user."role"::text,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM "HrcfoEmployee" employee
JOIN "User" app_user ON app_user."id" = employee."userId"
WHERE employee."userId" IS NOT NULL
  AND employee."status" <> 'EXITED'
  AND app_user."status" = 'ACTIVE'
  AND app_user."role" <> 'CLIENT'
ON CONFLICT ("organizationId", "userId") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = 'ACTIVE',
  "joinedAt" = COALESCE("OrganizationMember"."joinedAt", CURRENT_TIMESTAMP),
  "removedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Older saved RBAC settings may predate the Legal Advisor block. Add it to the
-- MANAGER allow-list when a customized JSON configuration already exists.
UPDATE "AppSetting"
SET "adminRoleAccess" = jsonb_set(
  COALESCE("adminRoleAccess", '{}'::jsonb),
  '{MANAGER}',
  CASE
    WHEN jsonb_typeof(COALESCE("adminRoleAccess", '{}'::jsonb)->'MANAGER') = 'array' THEN
      CASE
        WHEN (COALESCE("adminRoleAccess", '{}'::jsonb)->'MANAGER') ? 'la'
          THEN COALESCE("adminRoleAccess", '{}'::jsonb)->'MANAGER'
        ELSE (COALESCE("adminRoleAccess", '{}'::jsonb)->'MANAGER') || '["la"]'::jsonb
      END
    ELSE '["overview","publications","clientOrganizations","billing","hrCfo","sco","coo","mpo","cto","la","visits","activity"]'::jsonb
  END,
  true
)
WHERE "id" = 'global'
  AND "adminRoleAccess" IS NOT NULL;
