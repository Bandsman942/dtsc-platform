ALTER TABLE "EnterpriseGamingDailyClose"
  ADD COLUMN IF NOT EXISTS "approverUserId" TEXT;

CREATE INDEX IF NOT EXISTS "EnterpriseGamingDailyClose_organizationId_approverUserId_status_idx"
  ON "EnterpriseGamingDailyClose"("organizationId", "approverUserId", "status");
