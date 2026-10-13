CREATE TABLE "AiGovernanceAlertRule" (
  "code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "severity" TEXT NOT NULL DEFAULT 'WARNING',
  "threshold" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiGovernanceAlertRule_pkey" PRIMARY KEY ("code")
);
