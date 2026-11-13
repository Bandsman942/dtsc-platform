-- Global platform broadcasts and Web Push notifications are not enterprise data.
-- Keep the existing organization FK for tenant-scoped rows; NULL identifies only
-- the three whitelisted platform job families.
ALTER TABLE "EnterpriseDomainEvent"
  ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "EnterpriseDomainEvent"
  ADD CONSTRAINT "EnterpriseDomainEvent_platform_scope_check"
  CHECK (
    "organizationId" IS NOT NULL
    OR "eventType" IN (
      'PLATFORM_WEB_PUSH_NOTIFICATION',
      'PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD',
      'PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY'
    )
  ) NOT VALID;

ALTER TABLE "EnterpriseDomainEvent"
  VALIDATE CONSTRAINT "EnterpriseDomainEvent_platform_scope_check";
