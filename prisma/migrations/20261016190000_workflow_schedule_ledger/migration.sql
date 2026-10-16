-- WF-06S1 (#841): additive, inert durable schedule registry.
-- No existing workflow is migrated, converted or triggered by this schema.
CREATE UNIQUE INDEX "EW_Version_org_id_definition_key"
  ON "EnterpriseWorkflowVersion"("organizationId", "id", "definitionId");

CREATE TABLE "EnterpriseWorkflowSchedule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowDefinitionId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "hour" INTEGER NOT NULL,
  "minute" INTEGER NOT NULL,
  "dayOfWeek" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DISABLED',
  "nextRunAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseWorkflowSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EW_Schedule_status_check" CHECK ("status" IN ('DISABLED','STAGED','PAUSED')),
  CONSTRAINT "EW_Schedule_frequency_check" CHECK (
    ("frequency" = 'DAILY' AND "dayOfWeek" IS NULL)
    OR ("frequency" = 'WEEKLY' AND "dayOfWeek" BETWEEN 0 AND 6)
  ),
  CONSTRAINT "EW_Schedule_time_check" CHECK (
    "hour" BETWEEN 0 AND 23 AND "minute" BETWEEN 0 AND 59
  ),
  CONSTRAINT "EW_Schedule_cursor_check" CHECK (
    "status" <> 'STAGED' OR "nextRunAt" IS NOT NULL
  ),
  CONSTRAINT "EW_Schedule_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "EnterpriseWorkflowSchedule_organizationId_id_key"
  ON "EnterpriseWorkflowSchedule"("organizationId", "id");
CREATE UNIQUE INDEX "EW_Schedule_org_id_version_key"
  ON "EnterpriseWorkflowSchedule"("organizationId", "id", "workflowVersionId");
CREATE INDEX "EnterpriseWorkflowSchedule_organizationId_status_nextRunAt_idx"
  ON "EnterpriseWorkflowSchedule"("organizationId", "status", "nextRunAt");
CREATE INDEX "EW_Schedule_org_definition_status_idx"
  ON "EnterpriseWorkflowSchedule"("organizationId", "workflowDefinitionId", "status");

ALTER TABLE "EnterpriseWorkflowSchedule"
  ADD CONSTRAINT "EW_Schedule_definition_fkey"
  FOREIGN KEY ("organizationId", "workflowDefinitionId")
  REFERENCES "EnterpriseWorkflowDefinition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowSchedule"
  ADD CONSTRAINT "EW_Schedule_version_fkey"
  FOREIGN KEY ("organizationId", "workflowVersionId", "workflowDefinitionId")
  REFERENCES "EnterpriseWorkflowVersion"("organizationId", "id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EnterpriseWorkflowScheduleOccurrence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "localTime" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflowScheduleOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EW_Occurrence_status_check" CHECK ("status" = 'RESERVED'),
  CONSTRAINT "EW_Occurrence_key_check" CHECK ("occurrenceKey" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "EW_Occurrence_date_check" CHECK ("localDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'),
  CONSTRAINT "EW_Occurrence_time_check" CHECK ("localTime" ~ '^[0-9]{2}:[0-9]{2}$')
);
CREATE UNIQUE INDEX "EW_Occurrence_occurrence_key"
  ON "EnterpriseWorkflowScheduleOccurrence"("occurrenceKey");
CREATE UNIQUE INDEX "EW_Occurrence_org_id_key"
  ON "EnterpriseWorkflowScheduleOccurrence"("organizationId", "id");
CREATE UNIQUE INDEX "EW_Occurrence_org_schedule_version_local_key"
  ON "EnterpriseWorkflowScheduleOccurrence"("organizationId", "scheduleId", "workflowVersionId", "localDate", "localTime");
CREATE INDEX "EW_Occurrence_org_status_due_idx"
  ON "EnterpriseWorkflowScheduleOccurrence"("organizationId", "status", "scheduledAt");
CREATE INDEX "EW_Occurrence_schedule_due_idx"
  ON "EnterpriseWorkflowScheduleOccurrence"("scheduleId", "scheduledAt");

ALTER TABLE "EnterpriseWorkflowScheduleOccurrence"
  ADD CONSTRAINT "EW_Occurrence_schedule_fkey"
  FOREIGN KEY ("organizationId", "scheduleId", "workflowVersionId")
  REFERENCES "EnterpriseWorkflowSchedule"("organizationId", "id", "workflowVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;
