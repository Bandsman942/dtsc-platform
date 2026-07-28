CREATE TABLE IF NOT EXISTS "UserSessionPreference" (
  "userId" TEXT NOT NULL,
  "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSessionPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserSessionPreference"
  ADD COLUMN IF NOT EXISTS "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"UserSessionPreference"'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "UserSessionPreference"
      ADD CONSTRAINT "UserSessionPreference_pkey" PRIMARY KEY ("userId");
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"UserSessionPreference"'::regclass
      AND conname = 'UserSessionPreference_sessionIdleTimeoutMinutes_allowed'
  ) THEN
    ALTER TABLE "UserSessionPreference"
      ADD CONSTRAINT "UserSessionPreference_sessionIdleTimeoutMinutes_allowed"
      CHECK ("sessionIdleTimeoutMinutes" IN (15, 30, 60, 240, 480, 1440, 10080, 43200));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "UserSessionPreference_updatedAt_idx"
ON "UserSessionPreference"("updatedAt");

ALTER TABLE "UserSessionPreference"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
