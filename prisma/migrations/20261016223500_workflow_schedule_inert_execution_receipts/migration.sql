-- #850: add nullable receipt metadata, but keep every receipt INERT.
ALTER TABLE "EnterpriseWorkflowScheduleOccurrence"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureCode" TEXT,
  ADD COLUMN "workflowRunId" TEXT,
  ADD COLUMN "outboxEventId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The original EW_Occurrence_status_check remains RESERVED-only.
-- This second CHECK also forbids claims/outbox/runs until a later certified migration.
ALTER TABLE "EnterpriseWorkflowScheduleOccurrence"
  ADD CONSTRAINT "EW_Occurrence_inert_execution_check" CHECK (
    "status" = 'RESERVED'
    AND "claimToken" IS NULL AND "leaseUntil" IS NULL AND "attemptCount" = 0
    AND "claimedAt" IS NULL AND "completedAt" IS NULL
    AND "lastFailureCode" IS NULL AND "workflowRunId" IS NULL
    AND "outboxEventId" IS NULL
  ),
  ADD CONSTRAINT "EW_Occurrence_revision_check" CHECK ("revision" > 0);

CREATE UNIQUE INDEX "EW_Occurrence_org_run_key"
  ON "EnterpriseWorkflowScheduleOccurrence"("organizationId", "workflowRunId");
CREATE UNIQUE INDEX "EW_Occurrence_org_outbox_key"
  ON "EnterpriseWorkflowScheduleOccurrence"("organizationId", "outboxEventId");
CREATE INDEX "EW_Occurrence_status_lease_idx"
  ON "EnterpriseWorkflowScheduleOccurrence"("status", "leaseUntil");

ALTER TABLE "EnterpriseWorkflowScheduleOccurrence"
  ADD CONSTRAINT "EW_Occurrence_run_fkey"
    FOREIGN KEY ("organizationId", "workflowRunId")
    REFERENCES "EnterpriseWorkflowRun"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EW_Occurrence_outbox_fkey"
    FOREIGN KEY ("organizationId", "outboxEventId")
    REFERENCES "EnterpriseDomainEvent"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
