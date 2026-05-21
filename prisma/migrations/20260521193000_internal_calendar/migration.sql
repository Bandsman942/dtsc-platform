-- Internal DTSC calendar: collaborator availabilities, internal events, participants and conflicts.

CREATE TABLE "CollaboratorAvailability" (
  "id" TEXT NOT NULL,
  "collaboratorId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "availabilityStatus" TEXT NOT NULL DEFAULT 'Disponible',
  "recurrenceType" TEXT NOT NULL DEFAULT 'Aucune',
  "recurrenceUntil" TIMESTAMP(3),
  "locationMode" TEXT NOT NULL DEFAULT 'Non défini',
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CollaboratorAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalCalendarEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "eventType" TEXT NOT NULL DEFAULT 'Tâche',
  "startDateTime" TIMESTAMP(3) NOT NULL,
  "endDateTime" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Planifié',
  "priority" TEXT NOT NULL DEFAULT 'Normale',
  "locationMode" TEXT NOT NULL DEFAULT 'Non défini',
  "physicalLocation" TEXT,
  "meetingLink" TEXT,
  "sourceModule" TEXT,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "createdBy" TEXT,
  "ownerCollaboratorId" TEXT,
  "departmentId" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'Participants',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "InternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalCalendarEventParticipant" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "collaboratorId" TEXT NOT NULL,
  "participantStatus" TEXT NOT NULL DEFAULT 'Actif',
  "responseStatus" TEXT NOT NULL DEFAULT 'En attente',
  "role" TEXT NOT NULL DEFAULT 'Participant',
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InternalCalendarEventParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalCalendarConflict" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "collaboratorId" TEXT NOT NULL,
  "conflictType" TEXT NOT NULL,
  "conflictWithEventId" TEXT,
  "conflictWithAvailabilityId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'Avertissement',
  "message" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalCalendarConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollaboratorAvailability_collaboratorId_dayOfWeek_deletedAt_idx" ON "CollaboratorAvailability"("collaboratorId", "dayOfWeek", "deletedAt");
CREATE INDEX "CollaboratorAvailability_availabilityStatus_locationMode_idx" ON "CollaboratorAvailability"("availabilityStatus", "locationMode");
CREATE INDEX "CollaboratorAvailability_createdBy_createdAt_idx" ON "CollaboratorAvailability"("createdBy", "createdAt");

CREATE INDEX "InternalCalendarEvent_startDateTime_endDateTime_idx" ON "InternalCalendarEvent"("startDateTime", "endDateTime");
CREATE INDEX "InternalCalendarEvent_status_eventType_idx" ON "InternalCalendarEvent"("status", "eventType");
CREATE INDEX "InternalCalendarEvent_ownerCollaboratorId_startDateTime_idx" ON "InternalCalendarEvent"("ownerCollaboratorId", "startDateTime");
CREATE INDEX "InternalCalendarEvent_departmentId_startDateTime_idx" ON "InternalCalendarEvent"("departmentId", "startDateTime");
CREATE INDEX "InternalCalendarEvent_sourceModule_sourceEntityType_sourceEntityId_idx" ON "InternalCalendarEvent"("sourceModule", "sourceEntityType", "sourceEntityId");
CREATE INDEX "InternalCalendarEvent_createdBy_createdAt_idx" ON "InternalCalendarEvent"("createdBy", "createdAt");

CREATE UNIQUE INDEX "InternalCalendarEventParticipant_eventId_collaboratorId_key" ON "InternalCalendarEventParticipant"("eventId", "collaboratorId");
CREATE INDEX "InternalCalendarEventParticipant_collaboratorId_responseStatus_idx" ON "InternalCalendarEventParticipant"("collaboratorId", "responseStatus");
CREATE INDEX "InternalCalendarEventParticipant_eventId_participantStatus_idx" ON "InternalCalendarEventParticipant"("eventId", "participantStatus");

CREATE INDEX "InternalCalendarConflict_eventId_resolved_idx" ON "InternalCalendarConflict"("eventId", "resolved");
CREATE INDEX "InternalCalendarConflict_collaboratorId_resolved_createdAt_idx" ON "InternalCalendarConflict"("collaboratorId", "resolved", "createdAt");
CREATE INDEX "InternalCalendarConflict_severity_createdAt_idx" ON "InternalCalendarConflict"("severity", "createdAt");

ALTER TABLE "InternalCalendarEventParticipant" ADD CONSTRAINT "InternalCalendarEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InternalCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalCalendarConflict" ADD CONSTRAINT "InternalCalendarConflict_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InternalCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
