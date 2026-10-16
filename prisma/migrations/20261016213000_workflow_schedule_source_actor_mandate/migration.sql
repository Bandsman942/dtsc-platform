-- WF-06S2B (#846): durable but non-executable source+actor mandate.
-- Existing DISABLED/STAGED schedules retain NULL mandate; no backfill, no enabled status.
ALTER TABLE "EnterpriseWorkflowSchedule"
  ADD COLUMN "sourceEntityType" TEXT,
  ADD COLUMN "sourceEntityId" TEXT,
  ADD COLUMN "executionActorUserId" TEXT,
  ADD COLUMN "mandateVerifiedAt" TIMESTAMP(3);

-- Refuse half-populated mandates even if an internal caller bypasses Prisma.
ALTER TABLE "EnterpriseWorkflowSchedule"
  ADD CONSTRAINT "EW_Schedule_mandate_all_or_none_check"
  CHECK (
    ("sourceEntityType" IS NULL AND "sourceEntityId" IS NULL
      AND "executionActorUserId" IS NULL AND "mandateVerifiedAt" IS NULL)
    OR
    ("sourceEntityType" IS NOT NULL AND "sourceEntityId" IS NOT NULL
      AND "executionActorUserId" IS NOT NULL AND "mandateVerifiedAt" IS NOT NULL)
  );

CREATE INDEX "EW_Schedule_tenant_source_idx"
  ON "EnterpriseWorkflowSchedule"("organizationId", "sourceEntityType", "sourceEntityId");
