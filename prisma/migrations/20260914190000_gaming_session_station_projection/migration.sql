CREATE OR REPLACE FUNCTION "sync_gaming_station_occupation"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."archivedAt" IS NULL AND NEW."status" IN ('ACTIVE', 'PAUSED') THEN
      UPDATE "EnterpriseGamingStationProfile"
      SET "status" = 'IN_USE',
          "revision" = "revision" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "organizationId" = NEW."organizationId"
        AND "id" = NEW."stationId"
        AND "archivedAt" IS NULL
        AND "status" = 'AVAILABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."archivedAt" IS NULL
     AND OLD."status" IN ('ACTIVE', 'PAUSED')
     AND (
       NEW."archivedAt" IS NOT NULL
       OR NEW."status" NOT IN ('ACTIVE', 'PAUSED')
       OR NEW."stationId" <> OLD."stationId"
     ) THEN
    UPDATE "EnterpriseGamingStationProfile" g
    SET "status" = 'AVAILABLE',
        "revision" = g."revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE g."organizationId" = OLD."organizationId"
      AND g."id" = OLD."stationId"
      AND g."archivedAt" IS NULL
      AND g."status" = 'IN_USE'
      AND NOT EXISTS (
        SELECT 1
        FROM "EnterpriseGamingSession" s
        WHERE s."organizationId" = OLD."organizationId"
          AND s."stationId" = OLD."stationId"
          AND s."id" <> OLD."id"
          AND s."archivedAt" IS NULL
          AND s."status" IN ('ACTIVE', 'PAUSED')
      );
  END IF;

  IF NEW."archivedAt" IS NULL
     AND NEW."status" IN ('ACTIVE', 'PAUSED')
     AND (
       OLD."archivedAt" IS NOT NULL
       OR OLD."status" NOT IN ('ACTIVE', 'PAUSED')
       OR NEW."stationId" <> OLD."stationId"
     ) THEN
    UPDATE "EnterpriseGamingStationProfile"
    SET "status" = 'IN_USE',
        "revision" = "revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "organizationId" = NEW."organizationId"
      AND "id" = NEW."stationId"
      AND "archivedAt" IS NULL
      AND "status" = 'AVAILABLE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EnterpriseGamingSession_station_occupation_trigger"
AFTER INSERT OR UPDATE OF "stationId", "status", "archivedAt"
ON "EnterpriseGamingSession"
FOR EACH ROW
EXECUTE FUNCTION "sync_gaming_station_occupation"();
