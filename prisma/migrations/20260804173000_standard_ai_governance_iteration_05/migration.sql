ALTER TABLE "KnowledgeDocument" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr', ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr', ADD COLUMN "pageNumber" INTEGER, ADD COLUMN "section" TEXT, ADD COLUMN "offsetStart" INTEGER, ADD COLUMN "offsetEnd" INTEGER;
ALTER TABLE "EnterpriseAiKnowledgeSource" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr', ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EnterpriseAiKnowledgeChunk" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr', ADD COLUMN "pageNumber" INTEGER, ADD COLUMN "section" TEXT, ADD COLUMN "offsetStart" INTEGER, ADD COLUMN "offsetEnd" INTEGER;

CREATE TABLE "AiModelCall" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "contextCode" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'fr',
  "conversationId" TEXT,
  "enterpriseConversationId" TEXT,
  "providerCode" TEXT NOT NULL,
  "modelCode" TEXT NOT NULL,
  "providerModelId" TEXT NOT NULL,
  "strategyCode" TEXT NOT NULL,
  "promptVersion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "reasonCode" TEXT,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(14,8),
  "costCurrency" TEXT,
  "costKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "firstTokenLatencyMs" INTEGER,
  "durationMs" INTEGER,
  "metadataJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiModelCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialMaturityEvidence" (
  "id" TEXT NOT NULL,
  "moduleType" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "url" TEXT,
  "prNumber" INTEGER,
  "commitSha" TEXT,
  "productionId" TEXT,
  "ownerValidated" BOOLEAN NOT NULL DEFAULT false,
  "metadataJson" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialMaturityEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialMaturityTransition" (
  "id" TEXT NOT NULL,
  "moduleType" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "fromMaturity" TEXT NOT NULL,
  "toMaturity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "reason" TEXT NOT NULL,
  "evidenceIdsJson" JSONB,
  "criteriaSnapshotJson" JSONB,
  "iterationCode" TEXT,
  "pullRequestNumber" INTEGER,
  "commitSha" TEXT,
  "productionDeploymentId" TEXT,
  "e2eStatus" TEXT NOT NULL DEFAULT 'NON_EXECUTED',
  "ownerValidatedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialMaturityTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialMaturityTransition_idempotencyKey_key" ON "CommercialMaturityTransition"("idempotencyKey");
CREATE INDEX "AiModelCall_userId_organizationId_createdAt_idx" ON "AiModelCall"("userId", "organizationId", "createdAt");
CREATE INDEX "AiModelCall_organizationId_providerCode_modelCode_createdAt_idx" ON "AiModelCall"("organizationId", "providerCode", "modelCode", "createdAt");
CREATE INDEX "AiModelCall_conversationId_createdAt_idx" ON "AiModelCall"("conversationId", "createdAt");
CREATE INDEX "AiModelCall_enterpriseConversationId_createdAt_idx" ON "AiModelCall"("enterpriseConversationId", "createdAt");
CREATE INDEX "AiModelCall_status_reasonCode_createdAt_idx" ON "AiModelCall"("status", "reasonCode", "createdAt");
CREATE INDEX "CommercialMaturityEvidence_moduleType_moduleCode_createdAt_idx" ON "CommercialMaturityEvidence"("moduleType", "moduleCode", "createdAt");
CREATE INDEX "CommercialMaturityEvidence_ownerValidated_createdAt_idx" ON "CommercialMaturityEvidence"("ownerValidated", "createdAt");
CREATE INDEX "CommercialMaturityEvidence_createdById_createdAt_idx" ON "CommercialMaturityEvidence"("createdById", "createdAt");
CREATE INDEX "CommercialMaturityTransition_moduleType_moduleCode_createdAt_idx" ON "CommercialMaturityTransition"("moduleType", "moduleCode", "createdAt");
CREATE INDEX "CommercialMaturityTransition_toMaturity_status_createdAt_idx" ON "CommercialMaturityTransition"("toMaturity", "status", "createdAt");
CREATE INDEX "CommercialMaturityTransition_createdById_createdAt_idx" ON "CommercialMaturityTransition"("createdById", "createdAt");
