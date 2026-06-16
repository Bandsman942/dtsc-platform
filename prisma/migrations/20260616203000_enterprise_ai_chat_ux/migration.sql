-- Enterprise AI chat UX: projects, soft deletion, archive state and message edition metadata.
ALTER TABLE "EnterpriseAiConversation"
  ADD COLUMN "projectName" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseAiMessage"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "EnterpriseAiConversation_organizationId_userId_projectName_updatedAt_idx"
  ON "EnterpriseAiConversation"("organizationId", "userId", "projectName", "updatedAt");

CREATE INDEX "EnterpriseAiConversation_organizationId_userId_status_updatedAt_idx"
  ON "EnterpriseAiConversation"("organizationId", "userId", "status", "updatedAt");

CREATE INDEX "EnterpriseAiMessage_organizationId_conversationId_deletedAt_idx"
  ON "EnterpriseAiMessage"("organizationId", "conversationId", "deletedAt");
