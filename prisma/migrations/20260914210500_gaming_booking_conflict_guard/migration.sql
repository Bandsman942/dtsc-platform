CREATE OR REPLACE FUNCTION guard_gaming_booking_schedule_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."archivedAt" IS NULL AND NEW."status" IN ('CONFIRMED', 'CHECKED_IN') THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."organizationId" || ':gaming-booking:' || NEW."stationId")::bigint);

    IF EXISTS (
      SELECT 1
      FROM "EnterpriseGamingBooking" b
      WHERE b."organizationId" = NEW."organizationId"
        AND b."stationId" = NEW."stationId"
        AND b."id" <> NEW."id"
        AND b."archivedAt" IS NULL
        AND b."status" IN ('CONFIRMED', 'CHECKED_IN')
        AND b."scheduledStartAt" < NEW."scheduledEndAt"
        AND b."scheduledEndAt" > NEW."scheduledStartAt"
    ) THEN
      RAISE EXCEPTION 'GAMING_BOOKING_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "EnterpriseGamingBooking_conflict_guard"
BEFORE INSERT OR UPDATE OF "stationId", "scheduledStartAt", "scheduledEndAt", "status", "archivedAt"
ON "EnterpriseGamingBooking"
FOR EACH ROW
EXECUTE FUNCTION guard_gaming_booking_schedule_conflict();
