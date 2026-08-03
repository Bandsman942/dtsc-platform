CREATE TABLE "EnterpriseTaskChecklistItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTaskDependency" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "predecessorId" TEXT NOT NULL,
  "successorId" TEXT NOT NULL,
  "dependencyType" TEXT NOT NULL DEFAULT 'BLOCKS',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTaskDependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseTaskDependency_not_self" CHECK ("predecessorId" <> "successorId")
);

CREATE TABLE "EnterpriseTaskBlocker" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolutionComment" TEXT,
  "responsibleUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTaskBlocker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSavedWorkFilter" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "criteriaJson" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseSavedWorkFilter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseApprovalSubmissionVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "submissionComment" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseApprovalSubmissionVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseApprovalDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "submissionVersionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseApprovalDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeetingAgendaItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "ownerUserId" TEXT,
  "durationMinutes" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseMeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeetingMinutesVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "attendeeUserIds" JSONB,
  "absentUserIds" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseMeetingMinutesVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMeetingAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "agendaItemId" TEXT,
  "taskId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseMeetingAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseDocumentLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "targetModule" TEXT NOT NULL,
  "targetEntityType" TEXT NOT NULL,
  "targetEntityId" TEXT NOT NULL,
  "linkType" TEXT NOT NULL DEFAULT 'ATTACHMENT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseWorkReminder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reminderType" TEXT NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "idempotencyKey" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseTaskChecklistItem_organizationId_id_key" ON "EnterpriseTaskChecklistItem"("organizationId", "id");
CREATE INDEX "EnterpriseTaskChecklistItem_organizationId_taskId_position_idx" ON "EnterpriseTaskChecklistItem"("organizationId", "taskId", "position");
CREATE INDEX "EnterpriseTaskChecklistItem_organizationId_taskId_isCompleted_idx" ON "EnterpriseTaskChecklistItem"("organizationId", "taskId", "isCompleted");
CREATE UNIQUE INDEX "EnterpriseTaskDependency_scope_key" ON "EnterpriseTaskDependency"("organizationId", "predecessorId", "successorId", "dependencyType");
CREATE UNIQUE INDEX "EnterpriseTaskDependency_organizationId_id_key" ON "EnterpriseTaskDependency"("organizationId", "id");
CREATE INDEX "EnterpriseTaskDependency_organizationId_predecessorId_idx" ON "EnterpriseTaskDependency"("organizationId", "predecessorId");
CREATE INDEX "EnterpriseTaskDependency_organizationId_successorId_idx" ON "EnterpriseTaskDependency"("organizationId", "successorId");
CREATE UNIQUE INDEX "EnterpriseTaskBlocker_organizationId_id_key" ON "EnterpriseTaskBlocker"("organizationId", "id");
CREATE INDEX "EnterpriseTaskBlocker_organizationId_taskId_status_idx" ON "EnterpriseTaskBlocker"("organizationId", "taskId", "status");
CREATE INDEX "EnterpriseTaskBlocker_organizationId_responsibleUserId_status_idx" ON "EnterpriseTaskBlocker"("organizationId", "responsibleUserId", "status");
CREATE UNIQUE INDEX "EnterpriseSavedWorkFilter_scope_name_key" ON "EnterpriseSavedWorkFilter"("organizationId", "userId", "moduleCode", "name");
CREATE UNIQUE INDEX "EnterpriseSavedWorkFilter_organizationId_id_key" ON "EnterpriseSavedWorkFilter"("organizationId", "id");
CREATE INDEX "EnterpriseSavedWorkFilter_scope_default_idx" ON "EnterpriseSavedWorkFilter"("organizationId", "userId", "moduleCode", "isDefault");
CREATE UNIQUE INDEX "EnterpriseApprovalSubmissionVersion_scope_version_key" ON "EnterpriseApprovalSubmissionVersion"("organizationId", "approvalId", "versionNumber");
CREATE UNIQUE INDEX "EnterpriseApprovalSubmissionVersion_organizationId_id_key" ON "EnterpriseApprovalSubmissionVersion"("organizationId", "id");
CREATE INDEX "EnterpriseApprovalSubmissionVersion_organizationId_approvalId_submittedAt_idx" ON "EnterpriseApprovalSubmissionVersion"("organizationId", "approvalId", "submittedAt");
CREATE UNIQUE INDEX "EnterpriseApprovalDecision_idempotencyKey_key" ON "EnterpriseApprovalDecision"("idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseApprovalDecision_actor_version_key" ON "EnterpriseApprovalDecision"("organizationId", "approvalId", "submissionVersionId", "actorUserId");
CREATE UNIQUE INDEX "EnterpriseApprovalDecision_organizationId_id_key" ON "EnterpriseApprovalDecision"("organizationId", "id");
CREATE INDEX "EnterpriseApprovalDecision_organizationId_approvalId_createdAt_idx" ON "EnterpriseApprovalDecision"("organizationId", "approvalId", "createdAt");
CREATE UNIQUE INDEX "EnterpriseMeetingAgendaItem_organizationId_id_key" ON "EnterpriseMeetingAgendaItem"("organizationId", "id");
CREATE INDEX "EnterpriseMeetingAgendaItem_organizationId_meetingId_position_idx" ON "EnterpriseMeetingAgendaItem"("organizationId", "meetingId", "position");
CREATE UNIQUE INDEX "EnterpriseMeetingMinutesVersion_scope_version_key" ON "EnterpriseMeetingMinutesVersion"("organizationId", "meetingId", "versionNumber");
CREATE UNIQUE INDEX "EnterpriseMeetingMinutesVersion_organizationId_id_key" ON "EnterpriseMeetingMinutesVersion"("organizationId", "id");
CREATE INDEX "EnterpriseMeetingMinutesVersion_organizationId_meetingId_createdAt_idx" ON "EnterpriseMeetingMinutesVersion"("organizationId", "meetingId", "createdAt");
CREATE UNIQUE INDEX "EnterpriseMeetingAction_scope_task_key" ON "EnterpriseMeetingAction"("organizationId", "meetingId", "taskId");
CREATE UNIQUE INDEX "EnterpriseMeetingAction_organizationId_id_key" ON "EnterpriseMeetingAction"("organizationId", "id");
CREATE INDEX "EnterpriseMeetingAction_organizationId_meetingId_createdAt_idx" ON "EnterpriseMeetingAction"("organizationId", "meetingId", "createdAt");
CREATE INDEX "EnterpriseMeetingAction_organizationId_taskId_idx" ON "EnterpriseMeetingAction"("organizationId", "taskId");
CREATE UNIQUE INDEX "EnterpriseDocumentLink_scope_key" ON "EnterpriseDocumentLink"("organizationId", "documentId", "targetEntityType", "targetEntityId", "linkType");
CREATE UNIQUE INDEX "EnterpriseDocumentLink_organizationId_id_key" ON "EnterpriseDocumentLink"("organizationId", "id");
CREATE INDEX "EnterpriseDocumentLink_target_idx" ON "EnterpriseDocumentLink"("organizationId", "targetEntityType", "targetEntityId", "archivedAt");
CREATE INDEX "EnterpriseDocumentLink_document_idx" ON "EnterpriseDocumentLink"("organizationId", "documentId", "archivedAt");
CREATE UNIQUE INDEX "EnterpriseWorkReminder_idempotencyKey_key" ON "EnterpriseWorkReminder"("idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseWorkReminder_organizationId_id_key" ON "EnterpriseWorkReminder"("organizationId", "id");
CREATE INDEX "EnterpriseWorkReminder_status_remindAt_idx" ON "EnterpriseWorkReminder"("status", "remindAt");
CREATE INDEX "EnterpriseWorkReminder_user_idx" ON "EnterpriseWorkReminder"("organizationId", "userId", "status", "remindAt");
CREATE INDEX "EnterpriseWorkReminder_entity_idx" ON "EnterpriseWorkReminder"("organizationId", "entityType", "entityId");

ALTER TABLE "EnterpriseTaskChecklistItem" ADD CONSTRAINT "EnterpriseTaskChecklistItem_task_fkey" FOREIGN KEY ("taskId") REFERENCES "EnterpriseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTaskDependency" ADD CONSTRAINT "EnterpriseTaskDependency_predecessor_fkey" FOREIGN KEY ("predecessorId") REFERENCES "EnterpriseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTaskDependency" ADD CONSTRAINT "EnterpriseTaskDependency_successor_fkey" FOREIGN KEY ("successorId") REFERENCES "EnterpriseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTaskBlocker" ADD CONSTRAINT "EnterpriseTaskBlocker_task_fkey" FOREIGN KEY ("taskId") REFERENCES "EnterpriseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseApprovalSubmissionVersion" ADD CONSTRAINT "EnterpriseApprovalSubmissionVersion_approval_fkey" FOREIGN KEY ("approvalId") REFERENCES "EnterpriseApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseApprovalDecision" ADD CONSTRAINT "EnterpriseApprovalDecision_approval_fkey" FOREIGN KEY ("approvalId") REFERENCES "EnterpriseApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseApprovalDecision" ADD CONSTRAINT "EnterpriseApprovalDecision_version_fkey" FOREIGN KEY ("submissionVersionId") REFERENCES "EnterpriseApprovalSubmissionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseMeetingAgendaItem" ADD CONSTRAINT "EnterpriseMeetingAgendaItem_meeting_fkey" FOREIGN KEY ("meetingId") REFERENCES "EnterpriseMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseMeetingMinutesVersion" ADD CONSTRAINT "EnterpriseMeetingMinutesVersion_meeting_fkey" FOREIGN KEY ("meetingId") REFERENCES "EnterpriseMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseMeetingAction" ADD CONSTRAINT "EnterpriseMeetingAction_meeting_fkey" FOREIGN KEY ("meetingId") REFERENCES "EnterpriseMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseMeetingAction" ADD CONSTRAINT "EnterpriseMeetingAction_task_fkey" FOREIGN KEY ("taskId") REFERENCES "EnterpriseTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentLink" ADD CONSTRAINT "EnterpriseDocumentLink_document_fkey" FOREIGN KEY ("documentId") REFERENCES "EnterpriseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
