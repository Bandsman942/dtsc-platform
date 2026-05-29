ALTER TABLE "CollaboratorAvailability" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "InternalCalendarEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "CollaboratorAvailability"
SET "organizationId" = 'dtsc-internal'
WHERE "organizationId" IS NULL;

UPDATE "InternalCalendarEvent"
SET "organizationId" = 'dtsc-internal'
WHERE "organizationId" IS NULL;

CREATE INDEX IF NOT EXISTS "CollaboratorAvailability_organizationId_collaboratorId_dayOfWeek_deletedAt_idx"
  ON "CollaboratorAvailability"("organizationId", "collaboratorId", "dayOfWeek", "deletedAt");

CREATE INDEX IF NOT EXISTS "InternalCalendarEvent_organizationId_startDateTime_endDateTime_idx"
  ON "InternalCalendarEvent"("organizationId", "startDateTime", "endDateTime");

CREATE INDEX IF NOT EXISTS "InternalCalendarEvent_organizationId_status_eventType_idx"
  ON "InternalCalendarEvent"("organizationId", "status", "eventType");

ALTER TABLE "CollaboratorAvailability"
  ADD CONSTRAINT "CollaboratorAvailability_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InternalCalendarEvent"
  ADD CONSTRAINT "InternalCalendarEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
