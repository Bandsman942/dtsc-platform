CREATE TABLE "UserSessionPreference" (
  "userId" TEXT NOT NULL,
  "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserSessionPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserSessionPreference_sessionIdleTimeoutMinutes_allowed"
    CHECK ("sessionIdleTimeoutMinutes" IN (15, 30, 60, 240, 480, 1440, 10080, 43200))
);

CREATE INDEX "UserSessionPreference_updatedAt_idx"
ON "UserSessionPreference"("updatedAt");
