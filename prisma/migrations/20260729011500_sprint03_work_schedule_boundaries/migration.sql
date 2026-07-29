-- Sprint 3 — DTSC work schedule boundaries
--
-- CollaboratorAvailability is intentionally retained as the physical storage table in this sprint.
-- The application now separates weekly availability from dated exceptions/absences through
-- strict service/API contracts. Existing rows are therefore preserved in place so ambiguous
-- historical records (for example recurring Mission rows) are not guessed or destroyed.
--
-- This data-only migration is idempotent and defensive: recurrenceInterval has always been
-- validated as >= 1 by the application, but older/manual rows may predate that validation.

UPDATE "CollaboratorAvailability"
SET "recurrenceInterval" = 1
WHERE "recurrenceInterval" IS NULL OR "recurrenceInterval" < 1;

-- Do not rewrite availabilityStatus, recurrenceType, specificDate, recurrenceStart or
-- recurrenceUntil here. Their legacy semantics are resolved compatibly by lib/work-schedule.ts.
-- New DTSC rows use these canonical representations:
--   weekly availability: recurrenceType='Hebdomadaire', availabilityStatus='Disponible',
--                        specificDate=NULL, recurrenceStart/effectiveFrom,
--                        recurrenceUntil/effectiveUntil
--   dated exception:     recurrenceType='Aucune', specificDate=start date,
--                        recurrenceUntil=end date, availabilityStatus=controlled exception label
