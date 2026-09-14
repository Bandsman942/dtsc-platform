CREATE OR REPLACE FUNCTION "guard_gaming_station_live_session_status"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" <> OLD."status"
     AND OLD."status" = 'IN_USE'
     AND NEW."status" <> 'IN_USE'
     AND EXISTS (
       SELECT 1
       FROM "EnterpriseGamingSession" s
       WHERE s."organizationId" = OLD."organizationId"
         AND s."stationId" = OLD."id"
         AND s."archivedAt" IS NULL
         AND s."status" IN ('ACTIVE', 'PAUSED')
     ) THEN
    RAISE EXCEPTION 'GAMING_STATION_HAS_LIVE_SESSION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EnterpriseGamingStationProfile_live_session_guard"
BEFORE UPDATE OF "status"
ON "EnterpriseGamingStationProfile"
FOR EACH ROW
EXECUTE FUNCTION "guard_gaming_station_live_session_status"();
