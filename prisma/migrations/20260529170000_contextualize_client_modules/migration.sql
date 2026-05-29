-- Add organization context to user-facing private modules without moving existing global data.
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "CompanyActivity" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "ConversationProject" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "UsageLog" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationProject" ADD CONSTRAINT "ConversationProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "CompanyProfile_userId_key";
DROP INDEX IF EXISTS "CompanyProfile_sector_idx";
DROP INDEX IF EXISTS "CompanyProfile_updatedAt_idx";
DROP INDEX IF EXISTS "CompanyActivity_userId_priority_updatedAt_idx";
DROP INDEX IF EXISTS "KnowledgeDocument_userId_status_createdAt_idx";
DROP INDEX IF EXISTS "KnowledgeChunk_userId_createdAt_idx";
DROP INDEX IF EXISTS "Conversation_userId_updatedAt_idx";
DROP INDEX IF EXISTS "Conversation_userId_projectName_updatedAt_idx";
DROP INDEX IF EXISTS "Conversation_userId_projectId_updatedAt_idx";
DROP INDEX IF EXISTS "ConversationProject_userId_name_key";
DROP INDEX IF EXISTS "ConversationProject_userId_updatedAt_idx";
DROP INDEX IF EXISTS "Message_userId_idx";
DROP INDEX IF EXISTS "UsageLog_userId_createdAt_idx";
DROP INDEX IF EXISTS "Notification_userId_readAt_createdAt_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyProfile_userId_organizationId_key" ON "CompanyProfile"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "CompanyProfile_sector_idx" ON "CompanyProfile"("sector");
CREATE INDEX IF NOT EXISTS "CompanyProfile_updatedAt_idx" ON "CompanyProfile"("updatedAt");
CREATE INDEX IF NOT EXISTS "CompanyProfile_userId_organizationId_updatedAt_idx" ON "CompanyProfile"("userId", "organizationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CompanyActivity_userId_organizationId_priority_updatedAt_idx" ON "CompanyActivity"("userId", "organizationId", "priority", "updatedAt");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_userId_organizationId_status_createdAt_idx" ON "KnowledgeDocument"("userId", "organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_userId_organizationId_createdAt_idx" ON "KnowledgeChunk"("userId", "organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_userId_organizationId_updatedAt_idx" ON "Conversation"("userId", "organizationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Conversation_userId_organizationId_projectName_updatedAt_idx" ON "Conversation"("userId", "organizationId", "projectName", "updatedAt");
CREATE INDEX IF NOT EXISTS "Conversation_userId_organizationId_projectId_updatedAt_idx" ON "Conversation"("userId", "organizationId", "projectId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationProject_userId_organizationId_name_key" ON "ConversationProject"("userId", "organizationId", "name");
CREATE INDEX IF NOT EXISTS "ConversationProject_userId_organizationId_updatedAt_idx" ON "ConversationProject"("userId", "organizationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Message_userId_organizationId_idx" ON "Message"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "UsageLog_userId_organizationId_createdAt_idx" ON "UsageLog"("userId", "organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_organizationId_readAt_createdAt_idx" ON "Notification"("userId", "organizationId", "readAt", "createdAt");
