CREATE TABLE "AiAgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "scope" TEXT NOT NULL,
    "executionClass" TEXT NOT NULL DEFAULT 'INTERACTIVE',
    "contextCode" TEXT NOT NULL,
    "assistantCode" TEXT,
    "conversationId" TEXT,
    "enterpriseConversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "maxSteps" INTEGER NOT NULL,
    "maxToolCalls" INTEGER NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "maxEstimatedCost" DECIMAL(14,8) NOT NULL,
    "maxDurationMs" INTEGER NOT NULL,
    "allowedToolModesJson" JSONB NOT NULL,
    "allowedToolCodesJson" JSONB,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "pendingConfirmationId" TEXT,
    "reasonCode" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "toolCode" TEXT,
    "providerCode" TEXT,
    "modelCode" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "reasonCode" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AiAgentStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiAgentRun_userId_organizationId_createdAt_idx" ON "AiAgentRun"("userId", "organizationId", "createdAt");
CREATE INDEX "AiAgentRun_conversationId_createdAt_idx" ON "AiAgentRun"("conversationId", "createdAt");
CREATE INDEX "AiAgentRun_enterpriseConversationId_createdAt_idx" ON "AiAgentRun"("enterpriseConversationId", "createdAt");
CREATE INDEX "AiAgentRun_status_createdAt_idx" ON "AiAgentRun"("status", "createdAt");
CREATE INDEX "AiAgentRun_pendingConfirmationId_status_idx" ON "AiAgentRun"("pendingConfirmationId", "status");
CREATE INDEX "AiAgentStep_runId_stepIndex_createdAt_idx" ON "AiAgentStep"("runId", "stepIndex", "createdAt");
CREATE INDEX "AiAgentStep_kind_status_createdAt_idx" ON "AiAgentStep"("kind", "status", "createdAt");
CREATE INDEX "AiAgentStep_toolCode_status_createdAt_idx" ON "AiAgentStep"("toolCode", "status", "createdAt");
ALTER TABLE "AiAgentStep" ADD CONSTRAINT "AiAgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
