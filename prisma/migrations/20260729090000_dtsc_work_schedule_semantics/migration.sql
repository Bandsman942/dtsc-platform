-- Sprint 3: establish strong DTSC work-schedule semantics without breaking ORGANIZATION calendars.
-- CollaboratorAvailability remains the physical compatibility table for this sprint:
--   weekly availability = recurrenceType 'Hebdomadaire' + status 'Disponible' + no specificDate
--   dated exception/absence = recurrenceType 'Aucune' + specificDate + recurrenceStart/recurrenceUntil range
-- Ambiguous historical recurring Mission/Absence/Congé rows are intentionally preserved for manual review.

UPDATE "CollaboratorAvailability"
SET
  "locationMode" = CASE
    WHEN "availabilityStatus" = 'Télétravail' THEN 'Télétravail'
    WHEN "availabilityStatus" = 'Sur site' THEN 'Site DTSC'
    ELSE "locationMode"
  END,
  "availabilityStatus" = 'Disponible'
WHERE "organizationId" = 'dtsc-internal'
  AND "deletedAt" IS NULL
  AND "recurrenceType" = 'Hebdomadaire'
  AND "specificDate" IS NULL
  AND "dayOfWeek" IS NOT NULL
  AND "availabilityStatus" IN ('Disponible', 'Télétravail', 'Sur site');

-- Preserve one-off historical exceptions while giving the resolver a concrete range.
UPDATE "CollaboratorAvailability"
SET
  "recurrenceStart" = COALESCE(
    "recurrenceStart",
    ("specificDate"::date + "startTime"::time)
  ),
  "recurrenceUntil" = COALESCE(
    "recurrenceUntil",
    ("specificDate"::date + "endTime"::time)
  )
WHERE "organizationId" = 'dtsc-internal'
  AND "deletedAt" IS NULL
  AND "recurrenceType" = 'Aucune'
  AND "specificDate" IS NOT NULL
  AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" > "startTime";

CREATE INDEX IF NOT EXISTS "collab_avail_dtsc_weekly_effective_idx"
  ON "CollaboratorAvailability"("organizationId", "collaboratorId", "dayOfWeek", "recurrenceStart", "recurrenceUntil")
  WHERE "deletedAt" IS NULL AND "recurrenceType" = 'Hebdomadaire' AND "specificDate" IS NULL;

CREATE INDEX IF NOT EXISTS "collab_avail_dtsc_exception_range_idx"
  ON "CollaboratorAvailability"("organizationId", "collaboratorId", "recurrenceStart", "recurrenceUntil")
  WHERE "deletedAt" IS NULL AND "recurrenceType" = 'Aucune' AND "specificDate" IS NOT NULL;
