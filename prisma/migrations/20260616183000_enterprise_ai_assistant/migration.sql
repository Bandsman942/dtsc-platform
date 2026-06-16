CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "EnterpriseAiAssistant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sectorCode" TEXT,
  "moduleCode" TEXT NOT NULL DEFAULT 'AI_ASSISTANT',
  "name" TEXT NOT NULL DEFAULT 'IA Assistant Entreprise',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "systemProfile" TEXT NOT NULL DEFAULT 'SECTOR_AWARE',
  "settingsJson" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiAssistant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiConversation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "model" TEXT,
  "citationsJson" JSONB,
  "toolResultsJson" JSONB,
  "tokenHint" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiKnowledgeSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantId" TEXT,
  "sectorCode" TEXT,
  "moduleCode" TEXT,
  "title" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'DOCUMENT',
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
  "fileName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "storageBucket" TEXT,
  "storagePath" TEXT,
  "extractedText" TEXT,
  "errorMessage" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiKnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiKnowledgeChunk" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sectorCode" TEXT,
  "moduleCode" TEXT,
  "content" TEXT NOT NULL,
  "tokenHint" INTEGER NOT NULL DEFAULT 0,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiToolCall" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantId" TEXT,
  "conversationId" TEXT,
  "userId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "toolType" TEXT NOT NULL DEFAULT 'READ',
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "inputJson" JSONB,
  "outputJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiToolCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantId" TEXT,
  "conversationId" TEXT,
  "userId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAiSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "defaultLanguage" TEXT NOT NULL DEFAULT 'fr',
  "allowKnowledgeUpload" BOOLEAN NOT NULL DEFAULT true,
  "allowReadTools" BOOLEAN NOT NULL DEFAULT true,
  "allowActionDrafts" BOOLEAN NOT NULL DEFAULT true,
  "retentionDays" INTEGER NOT NULL DEFAULT 365,
  "settingsJson" JSONB,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAiSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseAiAssistant_organizationId_moduleCode_key" ON "EnterpriseAiAssistant"("organizationId", "moduleCode");
CREATE INDEX IF NOT EXISTS "EnterpriseAiAssistant_organizationId_status_idx" ON "EnterpriseAiAssistant"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "EnterpriseAiAssistant_sectorCode_status_idx" ON "EnterpriseAiAssistant"("sectorCode", "status");

CREATE INDEX IF NOT EXISTS "EnterpriseAiConversation_organizationId_userId_updatedAt_idx" ON "EnterpriseAiConversation"("organizationId", "userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiConversation_organizationId_assistantId_status_updatedAt_idx" ON "EnterpriseAiConversation"("organizationId", "assistantId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS "EnterpriseAiMessage_organizationId_conversationId_createdAt_idx" ON "EnterpriseAiMessage"("organizationId", "conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiMessage_organizationId_userId_createdAt_idx" ON "EnterpriseAiMessage"("organizationId", "userId", "createdAt");

CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeSource_organizationId_status_createdAt_idx" ON "EnterpriseAiKnowledgeSource"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeSource_organizationId_sectorCode_moduleCode_idx" ON "EnterpriseAiKnowledgeSource"("organizationId", "sectorCode", "moduleCode");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeSource_organizationId_confidentiality_status_idx" ON "EnterpriseAiKnowledgeSource"("organizationId", "confidentiality", "status");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeSource_storageBucket_storagePath_idx" ON "EnterpriseAiKnowledgeSource"("storageBucket", "storagePath");

CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_organizationId_sourceId_idx" ON "EnterpriseAiKnowledgeChunk"("organizationId", "sourceId");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_organizationId_sectorCode_moduleCode_createdAt_idx" ON "EnterpriseAiKnowledgeChunk"("organizationId", "sectorCode", "moduleCode", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_embedding_idx" ON "EnterpriseAiKnowledgeChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "EnterpriseAiToolCall_organizationId_userId_createdAt_idx" ON "EnterpriseAiToolCall"("organizationId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiToolCall_organizationId_toolName_createdAt_idx" ON "EnterpriseAiToolCall"("organizationId", "toolName", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseAiToolCall_conversationId_createdAt_idx" ON "EnterpriseAiToolCall"("conversationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseAiUsage_organizationId_userId_periodStart_key" ON "EnterpriseAiUsage"("organizationId", "userId", "periodStart");
CREATE INDEX IF NOT EXISTS "EnterpriseAiUsage_organizationId_periodStart_idx" ON "EnterpriseAiUsage"("organizationId", "periodStart");
CREATE INDEX IF NOT EXISTS "EnterpriseAiUsage_conversationId_idx" ON "EnterpriseAiUsage"("conversationId");

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseAiSetting_organizationId_key" ON "EnterpriseAiSetting"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseAiSetting_enabled_updatedAt_idx" ON "EnterpriseAiSetting"("enabled", "updatedAt");

ALTER TABLE "EnterpriseAiAssistant" ADD CONSTRAINT "EnterpriseAiAssistant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiAssistant" ADD CONSTRAINT "EnterpriseAiAssistant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiConversation" ADD CONSTRAINT "EnterpriseAiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiConversation" ADD CONSTRAINT "EnterpriseAiConversation_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "EnterpriseAiAssistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiConversation" ADD CONSTRAINT "EnterpriseAiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiMessage" ADD CONSTRAINT "EnterpriseAiMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiMessage" ADD CONSTRAINT "EnterpriseAiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "EnterpriseAiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiMessage" ADD CONSTRAINT "EnterpriseAiMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiKnowledgeSource" ADD CONSTRAINT "EnterpriseAiKnowledgeSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiKnowledgeSource" ADD CONSTRAINT "EnterpriseAiKnowledgeSource_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "EnterpriseAiAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiKnowledgeSource" ADD CONSTRAINT "EnterpriseAiKnowledgeSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiKnowledgeChunk" ADD CONSTRAINT "EnterpriseAiKnowledgeChunk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiKnowledgeChunk" ADD CONSTRAINT "EnterpriseAiKnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EnterpriseAiKnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiToolCall" ADD CONSTRAINT "EnterpriseAiToolCall_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiToolCall" ADD CONSTRAINT "EnterpriseAiToolCall_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "EnterpriseAiAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiToolCall" ADD CONSTRAINT "EnterpriseAiToolCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "EnterpriseAiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiToolCall" ADD CONSTRAINT "EnterpriseAiToolCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiUsage" ADD CONSTRAINT "EnterpriseAiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiUsage" ADD CONSTRAINT "EnterpriseAiUsage_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "EnterpriseAiAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiUsage" ADD CONSTRAINT "EnterpriseAiUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "EnterpriseAiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiUsage" ADD CONSTRAINT "EnterpriseAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiSetting" ADD CONSTRAINT "EnterpriseAiSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseAiSetting" ADD CONSTRAINT "EnterpriseAiSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
