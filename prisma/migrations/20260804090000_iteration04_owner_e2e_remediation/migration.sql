CREATE TABLE "DtscIndividualPermissionGrant" (
  "id" TEXT NOT NULL,
  "grantKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "employeeId" TEXT,
  "permissionCode" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL DEFAULT 'GLOBAL',
  "scopeValue" TEXT,
  "effect" TEXT NOT NULL DEFAULT 'ALLOW',
  "reason" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "grantedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DtscIndividualPermissionGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalChecklistItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "createdById" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalStatusTransition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorEmployeeId" TEXT,
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalStatusTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarResource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "capacity" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "configurationJson" JSONB,
  "createdById" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarResourceReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT,
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarResourceReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarExternalSyncState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "credentialReference" TEXT,
  "externalCalendarId" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarExternalSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSlotSuggestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "participantIdsJson" JSONB NOT NULL,
  "rangeStart" TIMESTAMP(3) NOT NULL,
  "rangeEnd" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'LOCAL',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "suggestionsJson" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarSlotSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseDocumentIndexState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'LOCAL_METADATA',
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "contentHash" TEXT,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "indexReference" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "indexedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseDocumentIndexState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseDocumentVersionComparison" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "leftVersionId" TEXT NOT NULL,
  "rightVersionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'LOCAL_METADATA',
  "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "summaryJson" JSONB,
  "visualDiffStoragePath" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requestedById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseDocumentVersionComparison_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalSlaPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "priority" TEXT,
  "startStatus" TEXT,
  "stopStatusesJson" JSONB,
  "targetMinutes" INTEGER NOT NULL,
  "warningMinutes" INTEGER,
  "escalationJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalSlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalSlaInstance" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "policyId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "responsibleUserId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "warnedAt" TIMESTAMP(3),
  "breachedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "lastEvaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalSlaInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DtscIndividualPermissionGrant_grantKey_key" ON "DtscIndividualPermissionGrant"("grantKey");
CREATE INDEX "DtscIndividualPermissionGrant_userId_permissionCode_revokedAt_idx" ON "DtscIndividualPermissionGrant"("userId", "permissionCode", "revokedAt");
CREATE INDEX "DtscIndividualPermissionGrant_employeeId_permissionCode_revokedAt_idx" ON "DtscIndividualPermissionGrant"("employeeId", "permissionCode", "revokedAt");
CREATE INDEX "DtscIndividualPermissionGrant_scopeType_scopeValue_permissionCode_idx" ON "DtscIndividualPermissionGrant"("scopeType", "scopeValue", "permissionCode");
CREATE INDEX "DtscIndividualPermissionGrant_validUntil_revokedAt_idx" ON "DtscIndividualPermissionGrant"("validUntil", "revokedAt");

CREATE INDEX "OperationalChecklistItem_organizationId_objectType_objectId_deletedAt_idx" ON "OperationalChecklistItem"("organizationId", "objectType", "objectId", "deletedAt");
CREATE INDEX "OperationalChecklistItem_objectType_objectId_position_idx" ON "OperationalChecklistItem"("objectType", "objectId", "position");
CREATE INDEX "OperationalChecklistItem_completed_completedAt_idx" ON "OperationalChecklistItem"("completed", "completedAt");

CREATE INDEX "OperationalStatusTransition_organizationId_objectType_objectId_createdAt_idx" ON "OperationalStatusTransition"("organizationId", "objectType", "objectId", "createdAt");
CREATE INDEX "OperationalStatusTransition_actorUserId_createdAt_idx" ON "OperationalStatusTransition"("actorUserId", "createdAt");

CREATE UNIQUE INDEX "CalendarResource_organizationId_name_resourceType_key" ON "CalendarResource"("organizationId", "name", "resourceType");
CREATE INDEX "CalendarResource_organizationId_resourceType_isActive_archivedAt_idx" ON "CalendarResource"("organizationId", "resourceType", "isActive", "archivedAt");

CREATE UNIQUE INDEX "CalendarResourceReservation_resourceId_eventId_key" ON "CalendarResourceReservation"("resourceId", "eventId");
CREATE INDEX "CalendarResourceReservation_organizationId_resourceId_startsAt_endsAt_status_idx" ON "CalendarResourceReservation"("organizationId", "resourceId", "startsAt", "endsAt", "status");
CREATE INDEX "CalendarResourceReservation_eventId_status_idx" ON "CalendarResourceReservation"("eventId", "status");

CREATE UNIQUE INDEX "CalendarExternalSyncState_organizationId_userId_provider_key" ON "CalendarExternalSyncState"("organizationId", "userId", "provider");
CREATE INDEX "CalendarExternalSyncState_organizationId_provider_status_idx" ON "CalendarExternalSyncState"("organizationId", "provider", "status");
CREATE INDEX "CalendarExternalSyncState_userId_status_idx" ON "CalendarExternalSyncState"("userId", "status");

CREATE INDEX "CalendarSlotSuggestion_organizationId_requestedById_createdAt_idx" ON "CalendarSlotSuggestion"("organizationId", "requestedById", "createdAt");
CREATE INDEX "CalendarSlotSuggestion_status_createdAt_idx" ON "CalendarSlotSuggestion"("status", "createdAt");

CREATE UNIQUE INDEX "EnterpriseDocumentIndexState_organizationId_documentId_versionId_key" ON "EnterpriseDocumentIndexState"("organizationId", "documentId", "versionId");
CREATE INDEX "EnterpriseDocumentIndexState_organizationId_status_updatedAt_idx" ON "EnterpriseDocumentIndexState"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseDocumentIndexState_documentId_versionId_idx" ON "EnterpriseDocumentIndexState"("documentId", "versionId");

CREATE UNIQUE INDEX "EnterpriseDocumentVersionComparison_documentId_leftVersionId_rightVersionId_key" ON "EnterpriseDocumentVersionComparison"("documentId", "leftVersionId", "rightVersionId");
CREATE INDEX "EnterpriseDocumentVersionComparison_organizationId_status_createdAt_idx" ON "EnterpriseDocumentVersionComparison"("organizationId", "status", "createdAt");

CREATE INDEX "OperationalSlaPolicy_organizationId_objectType_isActive_archivedAt_idx" ON "OperationalSlaPolicy"("organizationId", "objectType", "isActive", "archivedAt");
CREATE UNIQUE INDEX "OperationalSlaInstance_policyId_objectType_objectId_key" ON "OperationalSlaInstance"("policyId", "objectType", "objectId");
CREATE INDEX "OperationalSlaInstance_organizationId_status_dueAt_idx" ON "OperationalSlaInstance"("organizationId", "status", "dueAt");
CREATE INDEX "OperationalSlaInstance_responsibleUserId_status_dueAt_idx" ON "OperationalSlaInstance"("responsibleUserId", "status", "dueAt");

ALTER TABLE "DtscIndividualPermissionGrant" ADD CONSTRAINT "DtscIndividualPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DtscIndividualPermissionGrant" ADD CONSTRAINT "DtscIndividualPermissionGrant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DtscIndividualPermissionGrant" ADD CONSTRAINT "DtscIndividualPermissionGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DtscIndividualPermissionGrant" ADD CONSTRAINT "DtscIndividualPermissionGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalChecklistItem" ADD CONSTRAINT "OperationalChecklistItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalChecklistItem" ADD CONSTRAINT "OperationalChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationalStatusTransition" ADD CONSTRAINT "OperationalStatusTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalStatusTransition" ADD CONSTRAINT "OperationalStatusTransition_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CalendarResource" ADD CONSTRAINT "CalendarResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarResource" ADD CONSTRAINT "CalendarResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarResourceReservation" ADD CONSTRAINT "CalendarResourceReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarResourceReservation" ADD CONSTRAINT "CalendarResourceReservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CalendarResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarResourceReservation" ADD CONSTRAINT "CalendarResourceReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InternalCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarResourceReservation" ADD CONSTRAINT "CalendarResourceReservation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarExternalSyncState" ADD CONSTRAINT "CalendarExternalSyncState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarExternalSyncState" ADD CONSTRAINT "CalendarExternalSyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSlotSuggestion" ADD CONSTRAINT "CalendarSlotSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSlotSuggestion" ADD CONSTRAINT "CalendarSlotSuggestion_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnterpriseDocumentIndexState" ADD CONSTRAINT "EnterpriseDocumentIndexState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentIndexState" ADD CONSTRAINT "EnterpriseDocumentIndexState_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EnterpriseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentIndexState" ADD CONSTRAINT "EnterpriseDocumentIndexState_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EnterpriseDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentVersionComparison" ADD CONSTRAINT "EnterpriseDocumentVersionComparison_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentVersionComparison" ADD CONSTRAINT "EnterpriseDocumentVersionComparison_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EnterpriseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentVersionComparison" ADD CONSTRAINT "EnterpriseDocumentVersionComparison_leftVersionId_fkey" FOREIGN KEY ("leftVersionId") REFERENCES "EnterpriseDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentVersionComparison" ADD CONSTRAINT "EnterpriseDocumentVersionComparison_rightVersionId_fkey" FOREIGN KEY ("rightVersionId") REFERENCES "EnterpriseDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentVersionComparison" ADD CONSTRAINT "EnterpriseDocumentVersionComparison_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalSlaPolicy" ADD CONSTRAINT "OperationalSlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalSlaPolicy" ADD CONSTRAINT "OperationalSlaPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalSlaInstance" ADD CONSTRAINT "OperationalSlaInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalSlaInstance" ADD CONSTRAINT "OperationalSlaInstance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "OperationalSlaPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalSlaInstance" ADD CONSTRAINT "OperationalSlaInstance_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
