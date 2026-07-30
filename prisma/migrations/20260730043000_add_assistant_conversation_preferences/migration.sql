CREATE TABLE "ChatConversationPreference" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "pinnedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "modelOverride" TEXT,
  "responseStyle" TEXT,
  "responseLength" TEXT,
  "useCompanyContext" BOOLEAN NOT NULL DEFAULT true,
  "useKnowledge" BOOLEAN NOT NULL DEFAULT true,
  "customInstructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseAiConversationPreference" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3),
  "modelOverride" TEXT,
  "responseStyle" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
  "responseLength" TEXT NOT NULL DEFAULT 'BALANCED',
  "useKnowledge" BOOLEAN NOT NULL DEFAULT true,
  "useTools" BOOLEAN NOT NULL DEFAULT true,
  "customInstructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseAiConversationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseAiMessageFeedback" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseAiMessageFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseAiMessageFeedback_value_check" CHECK ("value" IN (-1, 1))
);

CREATE UNIQUE INDEX "ChatConversationPreference_conversationId_key" ON "ChatConversationPreference"("conversationId");
CREATE INDEX "ChatConversationPreference_userId_organizationId_archivedAt_pinnedAt_updatedAt_idx" ON "ChatConversationPreference"("userId", "organizationId", "archivedAt", "pinnedAt", "updatedAt");
CREATE INDEX "ChatConversationPreference_userId_organizationId_updatedAt_idx" ON "ChatConversationPreference"("userId", "organizationId", "updatedAt");

CREATE UNIQUE INDEX "EnterpriseAiConversationPreference_conversationId_key" ON "EnterpriseAiConversationPreference"("conversationId");
CREATE INDEX "EnterpriseAiConversationPreference_organizationId_userId_pinnedAt_updatedAt_idx" ON "EnterpriseAiConversationPreference"("organizationId", "userId", "pinnedAt", "updatedAt");
CREATE INDEX "EnterpriseAiConversationPreference_organizationId_userId_updatedAt_idx" ON "EnterpriseAiConversationPreference"("organizationId", "userId", "updatedAt");

CREATE UNIQUE INDEX "EnterpriseAiMessageFeedback_messageId_key" ON "EnterpriseAiMessageFeedback"("messageId");
CREATE INDEX "EnterpriseAiMessageFeedback_organizationId_userId_updatedAt_idx" ON "EnterpriseAiMessageFeedback"("organizationId", "userId", "updatedAt");
