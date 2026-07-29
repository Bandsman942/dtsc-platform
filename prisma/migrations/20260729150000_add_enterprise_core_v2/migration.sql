-- Sprint 6 — ERP Core v2
-- Additive migration only. EnterpriseCoreRecord remains intact for legacy domains.

CREATE TABLE "EnterpriseTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "departmentId" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "parentTaskId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "departmentId" TEXT,
    "dueAt" TIMESTAMP(3),
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetEntityType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "organizerUserId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "locationMode" TEXT NOT NULL DEFAULT 'ONLINE',
    "physicalLocation" TEXT,
    "meetingLink" TEXT,
    "minutes" TEXT,
    "departmentId" TEXT,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeetingParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "responseStatus" TEXT NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseMeetingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeetingDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseMeetingDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseOperationalEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseOperationalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseOperationalComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseOperationalComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseMeetingParticipant_meetingId_userId_key" ON "EnterpriseMeetingParticipant"("meetingId", "userId");

CREATE INDEX "EnterpriseTask_organizationId_status_idx" ON "EnterpriseTask"("organizationId", "status");
CREATE INDEX "EnterpriseTask_organizationId_assignedToUserId_status_idx" ON "EnterpriseTask"("organizationId", "assignedToUserId", "status");
CREATE INDEX "EnterpriseTask_organizationId_departmentId_status_idx" ON "EnterpriseTask"("organizationId", "departmentId", "status");
CREATE INDEX "EnterpriseTask_organizationId_dueAt_idx" ON "EnterpriseTask"("organizationId", "dueAt");
CREATE INDEX "EnterpriseTask_organizationId_createdByUserId_createdAt_idx" ON "EnterpriseTask"("organizationId", "createdByUserId", "createdAt");
CREATE INDEX "EnterpriseTask_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterpriseTask"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseTask_organizationId_parentTaskId_idx" ON "EnterpriseTask"("organizationId", "parentTaskId");
CREATE INDEX "EnterpriseTask_archivedAt_idx" ON "EnterpriseTask"("archivedAt");

CREATE INDEX "EnterpriseRequest_organizationId_status_idx" ON "EnterpriseRequest"("organizationId", "status");
CREATE INDEX "EnterpriseRequest_organizationId_requestedByUserId_status_idx" ON "EnterpriseRequest"("organizationId", "requestedByUserId", "status");
CREATE INDEX "EnterpriseRequest_organizationId_assignedToUserId_status_idx" ON "EnterpriseRequest"("organizationId", "assignedToUserId", "status");
CREATE INDEX "EnterpriseRequest_organizationId_departmentId_status_idx" ON "EnterpriseRequest"("organizationId", "departmentId", "status");
CREATE INDEX "EnterpriseRequest_organizationId_createdAt_idx" ON "EnterpriseRequest"("organizationId", "createdAt");
CREATE INDEX "EnterpriseRequest_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterpriseRequest"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseRequest_archivedAt_idx" ON "EnterpriseRequest"("archivedAt");

CREATE INDEX "EnterpriseApproval_organizationId_approverUserId_status_idx" ON "EnterpriseApproval"("organizationId", "approverUserId", "status");
CREATE INDEX "EnterpriseApproval_organizationId_requestedByUserId_status_idx" ON "EnterpriseApproval"("organizationId", "requestedByUserId", "status");
CREATE INDEX "EnterpriseApproval_organizationId_targetEntityType_targetEntityId_idx" ON "EnterpriseApproval"("organizationId", "targetEntityType", "targetEntityId");
CREATE INDEX "EnterpriseApproval_organizationId_requestedAt_idx" ON "EnterpriseApproval"("organizationId", "requestedAt");
CREATE INDEX "EnterpriseApproval_archivedAt_idx" ON "EnterpriseApproval"("archivedAt");

CREATE INDEX "EnterpriseMeeting_organizationId_startAt_idx" ON "EnterpriseMeeting"("organizationId", "startAt");
CREATE INDEX "EnterpriseMeeting_organizationId_organizerUserId_startAt_idx" ON "EnterpriseMeeting"("organizationId", "organizerUserId", "startAt");
CREATE INDEX "EnterpriseMeeting_organizationId_departmentId_startAt_idx" ON "EnterpriseMeeting"("organizationId", "departmentId", "startAt");
CREATE INDEX "EnterpriseMeeting_organizationId_status_startAt_idx" ON "EnterpriseMeeting"("organizationId", "status", "startAt");
CREATE INDEX "EnterpriseMeeting_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterpriseMeeting"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseMeeting_archivedAt_idx" ON "EnterpriseMeeting"("archivedAt");

CREATE INDEX "EnterpriseMeetingParticipant_organizationId_userId_createdAt_idx" ON "EnterpriseMeetingParticipant"("organizationId", "userId", "createdAt");
CREATE INDEX "EnterpriseMeetingParticipant_organizationId_meetingId_idx" ON "EnterpriseMeetingParticipant"("organizationId", "meetingId");
CREATE INDEX "EnterpriseMeetingDecision_organizationId_meetingId_decidedAt_idx" ON "EnterpriseMeetingDecision"("organizationId", "meetingId", "decidedAt");
CREATE INDEX "EnterpriseMeetingDecision_organizationId_taskId_idx" ON "EnterpriseMeetingDecision"("organizationId", "taskId");
CREATE INDEX "EnterpriseOperationalEvent_organizationId_entityType_entityId_createdAt_idx" ON "EnterpriseOperationalEvent"("organizationId", "entityType", "entityId", "createdAt");
CREATE INDEX "EnterpriseOperationalEvent_organizationId_eventType_createdAt_idx" ON "EnterpriseOperationalEvent"("organizationId", "eventType", "createdAt");
CREATE INDEX "EnterpriseOperationalEvent_actorUserId_createdAt_idx" ON "EnterpriseOperationalEvent"("actorUserId", "createdAt");
CREATE INDEX "EnterpriseOperationalComment_organizationId_entityType_entityId_createdAt_idx" ON "EnterpriseOperationalComment"("organizationId", "entityType", "entityId", "createdAt");
CREATE INDEX "EnterpriseOperationalComment_authorUserId_createdAt_idx" ON "EnterpriseOperationalComment"("authorUserId", "createdAt");
CREATE INDEX "EnterpriseOperationalComment_deletedAt_idx" ON "EnterpriseOperationalComment"("deletedAt");

ALTER TABLE "EnterpriseMeetingParticipant"
ADD CONSTRAINT "EnterpriseMeetingParticipant_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "EnterpriseMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseMeetingDecision"
ADD CONSTRAINT "EnterpriseMeetingDecision_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "EnterpriseMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
