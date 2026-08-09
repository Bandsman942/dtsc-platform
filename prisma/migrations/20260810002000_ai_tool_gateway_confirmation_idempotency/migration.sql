CREATE TABLE IF NOT EXISTS "AiToolConfirmation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "conversationId" TEXT,
  "turnId" TEXT,
  "toolCode" TEXT NOT NULL,
  "argumentsHash" TEXT NOT NULL,
  "argumentsJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiToolConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiToolConfirmation_userId_organizationId_toolCode_status_createdAt_idx"
  ON "AiToolConfirmation"("userId", "organizationId", "toolCode", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiToolConfirmation_conversationId_turnId_createdAt_idx"
  ON "AiToolConfirmation"("conversationId", "turnId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiToolConfirmation_expiresAt_status_idx"
  ON "AiToolConfirmation"("expiresAt", "status");

CREATE TABLE IF NOT EXISTS "AiToolExecution" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "conversationId" TEXT,
  "turnId" TEXT,
  "toolCode" TEXT NOT NULL,
  "toolMode" TEXT NOT NULL,
  "argumentsHash" TEXT NOT NULL,
  "confirmationId" TEXT,
  "idempotencyScopeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "reasonCode" TEXT,
  "resultJson" JSONB,
  "auditLevel" TEXT NOT NULL DEFAULT 'STANDARD',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiToolExecution_idempotencyScopeKey_key"
  ON "AiToolExecution"("idempotencyScopeKey");
CREATE INDEX IF NOT EXISTS "AiToolExecution_userId_organizationId_toolCode_createdAt_idx"
  ON "AiToolExecution"("userId", "organizationId", "toolCode", "createdAt");
CREATE INDEX IF NOT EXISTS "AiToolExecution_conversationId_turnId_createdAt_idx"
  ON "AiToolExecution"("conversationId", "turnId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiToolExecution_status_reasonCode_createdAt_idx"
  ON "AiToolExecution"("status", "reasonCode", "createdAt");
