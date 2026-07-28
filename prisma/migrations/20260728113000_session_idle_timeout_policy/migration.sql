ALTER TABLE "User"
ADD COLUMN "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "User"
ADD CONSTRAINT "User_sessionIdleTimeoutMinutes_allowed"
CHECK ("sessionIdleTimeoutMinutes" IN (15, 30, 60, 240, 480, 1440, 10080, 43200));
