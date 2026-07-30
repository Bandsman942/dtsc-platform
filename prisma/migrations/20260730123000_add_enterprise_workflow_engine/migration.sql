-- Sprint 9: additive common enterprise workflow engine.
-- Existing ERP domain tables remain authoritative and are not dropped or rewritten.

CREATE TABLE "EnterpriseWorkflowDefinition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
  "triggerEntityType" TEXT,
  "triggerEventType" TEXT,
  "allowManualStart" BOOLEAN NOT NULL DEFAULT false,
  "singleActiveRun" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "currentVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseWorkflowDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowDefinition_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED','ARCHIVED')),
  CONSTRAINT "EnterpriseWorkflowDefinition_trigger_check" CHECK ("triggerType" IN ('MANUAL','ENTITY_CREATED','ENTITY_STATUS_CHANGED','DOMAIN_EVENT'))
);

CREATE TABLE "EnterpriseWorkflowVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "configurationJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflowVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowVersion_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','RETIRED'))
);

CREATE TABLE "EnterpriseWorkflowStep" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "stepType" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "configurationJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflowStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowStep_type_check" CHECK ("stepType" IN ('START','CONDITION','ASSIGN','CREATE_APPROVAL','CREATE_TASK','DOMAIN_ACTION','NOTIFICATION','WAIT_UNTIL','END'))
);

CREATE TABLE "EnterpriseWorkflowTransition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "fromStepId" TEXT NOT NULL,
  "toStepId" TEXT NOT NULL,
  "outcome" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "conditionJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseWorkflowRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowDefinitionId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "triggerType" TEXT NOT NULL,
  "triggerEventId" TEXT,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "currentStepId" TEXT,
  "resumeAt" TIMESTAMP(3),
  "startedByUserId" TEXT,
  "decisionActorUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failureCategory" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseWorkflowRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowRun_status_check" CHECK ("status" IN ('QUEUED','RUNNING','WAITING_APPROVAL','WAITING_TIME','BLOCKED','COMPLETED','REJECTED','FAILED','CANCELLED'))
);

CREATE TABLE "EnterpriseWorkflowStepRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "workflowStepId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "assignedUserId" TEXT,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCategory" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseWorkflowStepRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowStepRun_status_check" CHECK ("status" IN ('PENDING','RUNNING','WAITING','SUCCEEDED','FAILED','SKIPPED','CANCELLED'))
);

CREATE TABLE "EnterpriseWorkflowEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowRunId" TEXT NOT NULL,
  "stepRunId" TEXT,
  "eventType" TEXT NOT NULL,
  "status" TEXT,
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorUserId" TEXT,
  "summary" TEXT NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflowEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowEvent_actor_check" CHECK ("actorType" IN ('SYSTEM','USER'))
);

CREATE TABLE "EnterpriseWorkflowActionAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "stepRunId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "resultEntityType" TEXT,
  "resultEntityId" TEXT,
  "errorCategory" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseWorkflowActionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseWorkflowActionAttempt_status_check" CHECK ("status" IN ('PENDING','RUNNING','SUCCEEDED','FAILED'))
);

CREATE TABLE "EnterpriseDomainEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "payloadJson" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseDomainEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseDomainEvent_status_check" CHECK ("processingStatus" IN ('PENDING','PROCESSING','PROCESSED','FAILED','DEAD'))
);

CREATE UNIQUE INDEX "EnterpriseWorkflowDefinition_organizationId_code_key" ON "EnterpriseWorkflowDefinition"("organizationId", "code");
CREATE UNIQUE INDEX "EnterpriseWorkflowDefinition_organizationId_id_key" ON "EnterpriseWorkflowDefinition"("organizationId", "id");
CREATE INDEX "EnterpriseWorkflowDefinition_organizationId_status_updatedAt_idx" ON "EnterpriseWorkflowDefinition"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseWorkflowDefinition_trigger_idx" ON "EnterpriseWorkflowDefinition"("organizationId", "triggerEntityType", "triggerEventType", "status");
CREATE INDEX "EnterpriseWorkflowDefinition_archivedAt_idx" ON "EnterpriseWorkflowDefinition"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseWorkflowVersion_organizationId_id_key" ON "EnterpriseWorkflowVersion"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWorkflowVersion_definitionId_versionNumber_key" ON "EnterpriseWorkflowVersion"("definitionId", "versionNumber");
CREATE UNIQUE INDEX "EnterpriseWorkflowVersion_one_published_per_definition" ON "EnterpriseWorkflowVersion"("definitionId") WHERE "status" = 'PUBLISHED';
CREATE INDEX "EnterpriseWorkflowVersion_organizationId_status_createdAt_idx" ON "EnterpriseWorkflowVersion"("organizationId", "status", "createdAt");
CREATE INDEX "EnterpriseWorkflowVersion_definitionId_status_idx" ON "EnterpriseWorkflowVersion"("definitionId", "status");

CREATE UNIQUE INDEX "EnterpriseWorkflowStep_organizationId_id_key" ON "EnterpriseWorkflowStep"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWorkflowStep_workflowVersionId_code_key" ON "EnterpriseWorkflowStep"("workflowVersionId", "code");
CREATE INDEX "EnterpriseWorkflowStep_workflowVersionId_position_idx" ON "EnterpriseWorkflowStep"("workflowVersionId", "position");
CREATE INDEX "EnterpriseWorkflowStep_organizationId_stepType_idx" ON "EnterpriseWorkflowStep"("organizationId", "stepType");

CREATE UNIQUE INDEX "EnterpriseWorkflowTransition_organizationId_id_key" ON "EnterpriseWorkflowTransition"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWorkflowTransition_route_key" ON "EnterpriseWorkflowTransition"("workflowVersionId", "fromStepId", COALESCE("outcome", ''), "priority");
CREATE INDEX "EnterpriseWorkflowTransition_from_idx" ON "EnterpriseWorkflowTransition"("workflowVersionId", "fromStepId", "priority");
CREATE INDEX "EnterpriseWorkflowTransition_to_idx" ON "EnterpriseWorkflowTransition"("workflowVersionId", "toStepId");

CREATE UNIQUE INDEX "EnterpriseWorkflowRun_organizationId_id_key" ON "EnterpriseWorkflowRun"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWorkflowRun_event_key" ON "EnterpriseWorkflowRun"("workflowDefinitionId", "triggerEventId", "sourceEntityType", "sourceEntityId") WHERE "triggerEventId" IS NOT NULL;
CREATE UNIQUE INDEX "EnterpriseWorkflowRun_single_active_key" ON "EnterpriseWorkflowRun"("workflowDefinitionId", "sourceEntityType", "sourceEntityId") WHERE "status" IN ('QUEUED','RUNNING','WAITING_APPROVAL','WAITING_TIME','BLOCKED');
CREATE INDEX "EnterpriseWorkflowRun_organizationId_status_updatedAt_idx" ON "EnterpriseWorkflowRun"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseWorkflowRun_definition_startedAt_idx" ON "EnterpriseWorkflowRun"("organizationId", "workflowDefinitionId", "startedAt");
CREATE INDEX "EnterpriseWorkflowRun_source_idx" ON "EnterpriseWorkflowRun"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseWorkflowRun_resumeAt_status_idx" ON "EnterpriseWorkflowRun"("resumeAt", "status");

CREATE UNIQUE INDEX "EnterpriseWorkflowStepRun_organizationId_id_key" ON "EnterpriseWorkflowStepRun"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWorkflowStepRun_workflowRunId_workflowStepId_key" ON "EnterpriseWorkflowStepRun"("workflowRunId", "workflowStepId");
CREATE INDEX "EnterpriseWorkflowStepRun_workflowRunId_status_idx" ON "EnterpriseWorkflowStepRun"("workflowRunId", "status");
CREATE INDEX "EnterpriseWorkflowStepRun_assigned_idx" ON "EnterpriseWorkflowStepRun"("organizationId", "assignedUserId", "status");

CREATE UNIQUE INDEX "EnterpriseWorkflowEvent_organizationId_id_key" ON "EnterpriseWorkflowEvent"("organizationId", "id");
CREATE INDEX "EnterpriseWorkflowEvent_run_createdAt_idx" ON "EnterpriseWorkflowEvent"("workflowRunId", "createdAt");
CREATE INDEX "EnterpriseWorkflowEvent_step_createdAt_idx" ON "EnterpriseWorkflowEvent"("stepRunId", "createdAt");
CREATE INDEX "EnterpriseWorkflowEvent_type_idx" ON "EnterpriseWorkflowEvent"("organizationId", "eventType", "createdAt");

CREATE UNIQUE INDEX "EnterpriseWorkflowActionAttempt_idempotencyKey_key" ON "EnterpriseWorkflowActionAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseWorkflowActionAttempt_organizationId_id_key" ON "EnterpriseWorkflowActionAttempt"("organizationId", "id");
CREATE INDEX "EnterpriseWorkflowActionAttempt_step_status_idx" ON "EnterpriseWorkflowActionAttempt"("stepRunId", "status");
CREATE INDEX "EnterpriseWorkflowActionAttempt_org_status_idx" ON "EnterpriseWorkflowActionAttempt"("organizationId", "status", "updatedAt");

CREATE UNIQUE INDEX "EnterpriseDomainEvent_idempotencyKey_key" ON "EnterpriseDomainEvent"("idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseDomainEvent_organizationId_id_key" ON "EnterpriseDomainEvent"("organizationId", "id");
CREATE INDEX "EnterpriseDomainEvent_processingStatus_availableAt_idx" ON "EnterpriseDomainEvent"("processingStatus", "availableAt");
CREATE INDEX "EnterpriseDomainEvent_entity_idx" ON "EnterpriseDomainEvent"("organizationId", "entityType", "entityId", "occurredAt");
CREATE INDEX "EnterpriseDomainEvent_lockedAt_processingStatus_idx" ON "EnterpriseDomainEvent"("lockedAt", "processingStatus");

ALTER TABLE "EnterpriseWorkflowDefinition" ADD CONSTRAINT "EnterpriseWorkflowDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowVersion" ADD CONSTRAINT "EnterpriseWorkflowVersion_definition_fkey" FOREIGN KEY ("organizationId", "definitionId") REFERENCES "EnterpriseWorkflowDefinition"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowStep" ADD CONSTRAINT "EnterpriseWorkflowStep_version_fkey" FOREIGN KEY ("organizationId", "workflowVersionId") REFERENCES "EnterpriseWorkflowVersion"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowTransition" ADD CONSTRAINT "EnterpriseWorkflowTransition_version_fkey" FOREIGN KEY ("organizationId", "workflowVersionId") REFERENCES "EnterpriseWorkflowVersion"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowTransition" ADD CONSTRAINT "EnterpriseWorkflowTransition_from_fkey" FOREIGN KEY ("organizationId", "fromStepId") REFERENCES "EnterpriseWorkflowStep"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowTransition" ADD CONSTRAINT "EnterpriseWorkflowTransition_to_fkey" FOREIGN KEY ("organizationId", "toStepId") REFERENCES "EnterpriseWorkflowStep"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowRun" ADD CONSTRAINT "EnterpriseWorkflowRun_definition_fkey" FOREIGN KEY ("organizationId", "workflowDefinitionId") REFERENCES "EnterpriseWorkflowDefinition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowRun" ADD CONSTRAINT "EnterpriseWorkflowRun_version_fkey" FOREIGN KEY ("organizationId", "workflowVersionId") REFERENCES "EnterpriseWorkflowVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowStepRun" ADD CONSTRAINT "EnterpriseWorkflowStepRun_run_fkey" FOREIGN KEY ("organizationId", "workflowRunId") REFERENCES "EnterpriseWorkflowRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowStepRun" ADD CONSTRAINT "EnterpriseWorkflowStepRun_step_fkey" FOREIGN KEY ("organizationId", "workflowStepId") REFERENCES "EnterpriseWorkflowStep"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowEvent" ADD CONSTRAINT "EnterpriseWorkflowEvent_run_fkey" FOREIGN KEY ("organizationId", "workflowRunId") REFERENCES "EnterpriseWorkflowRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowEvent" ADD CONSTRAINT "EnterpriseWorkflowEvent_stepRun_fkey" FOREIGN KEY ("organizationId", "stepRunId") REFERENCES "EnterpriseWorkflowStepRun"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseWorkflowActionAttempt" ADD CONSTRAINT "EnterpriseWorkflowActionAttempt_stepRun_fkey" FOREIGN KEY ("organizationId", "stepRunId") REFERENCES "EnterpriseWorkflowStepRun"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDomainEvent" ADD CONSTRAINT "EnterpriseDomainEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
