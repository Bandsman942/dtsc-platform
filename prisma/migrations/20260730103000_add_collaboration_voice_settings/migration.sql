-- Additive backend configuration for collaboration voice messages.
-- Existing collaboration messages and media remain untouched.

CREATE TABLE "CollaborationVoiceSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxFileSizeBytes" INTEGER NOT NULL DEFAULT 16777216,
    "rateLimitPerHour" INTEGER NOT NULL DEFAULT 120,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationVoiceSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CollaborationVoiceSetting" (
    "id",
    "enabled",
    "maxDurationSeconds",
    "maxFileSizeBytes",
    "rateLimitPerHour",
    "createdAt",
    "updatedAt"
)
VALUES ('global', true, 300, 16777216, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
