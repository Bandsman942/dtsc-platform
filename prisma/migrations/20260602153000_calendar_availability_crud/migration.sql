ALTER TABLE "CollaboratorAvailability"
  ADD COLUMN "specificDate" TIMESTAMP(3),
  ADD COLUMN "recurrenceStart" TIMESTAMP(3),
  ADD COLUMN "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "dayOfWeek" DROP NOT NULL;

CREATE INDEX "collab_avail_org_collab_date_deleted_idx"
  ON "CollaboratorAvailability"("organizationId", "collaboratorId", "specificDate", "deletedAt");

CREATE INDEX "collab_avail_org_collab_recur_start_idx"
  ON "CollaboratorAvailability"("organizationId", "collaboratorId", "recurrenceType", "recurrenceStart");
