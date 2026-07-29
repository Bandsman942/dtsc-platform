-- Sprint 4 — hard database guards for independent work-submission review.
-- The API already enforces these transitions. These constraints make the rules race-safe
-- when two requests attempt to review the same submission concurrently.

ALTER TABLE "DtscWorkSubmission"
ADD CONSTRAINT "DtscWorkSubmission_no_self_reviewer_check"
CHECK ("reviewerEmployeeId" IS NULL OR "reviewerEmployeeId" <> "employeeId");

ALTER TABLE "DtscWorkSubmission"
ADD CONSTRAINT "DtscWorkSubmission_approved_minutes_check"
CHECK (
  ("status" = 'APPROVED' AND "validatedMinutes" IS NOT NULL)
  OR
  ("status" <> 'APPROVED' AND "validatedMinutes" IS NULL)
);

CREATE OR REPLACE FUNCTION "enforce_dtsc_work_submission_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- An approved period is immutable in the normal Sprint 4 workflow.
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved DTSC work submissions are immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN
      RETURN NEW;
    END IF;

    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') THEN
      RETURN NEW;
    END IF;

    IF OLD."status" = 'CHANGES_REQUESTED' AND NEW."status" IN ('SUBMITTED', 'CANCELLED') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid DTSC work submission transition: % -> %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "DtscWorkSubmission_transition_guard"
BEFORE UPDATE ON "DtscWorkSubmission"
FOR EACH ROW
EXECUTE FUNCTION "enforce_dtsc_work_submission_transition"();
