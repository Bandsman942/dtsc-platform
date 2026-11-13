-- Platform broadcast email delivery uses the canonical DTSC internal organization.
-- No schema column or foreign key is removed; the existing multi-tenant outbox
-- retains organizationId NOT NULL and Organization(id) referential integrity.
-- Web Push can use a real client organization or dtsc-internal for global Push.
ALTER TABLE "EnterpriseDomainEvent"
  ADD CONSTRAINT "EnterpriseDomainEvent_global_broadcast_owner_check"
  CHECK (
    "eventType" NOT IN (
      'PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD',
      'PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY'
    )
    OR "organizationId" = 'dtsc-internal'
  ) NOT VALID;

ALTER TABLE "EnterpriseDomainEvent"
  VALIDATE CONSTRAINT "EnterpriseDomainEvent_global_broadcast_owner_check";
