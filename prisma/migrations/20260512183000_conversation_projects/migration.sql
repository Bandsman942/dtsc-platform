-- Dedicated folders/projects for chatbot conversation organization.
CREATE TABLE "ConversationProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationProject_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation" ADD COLUMN "projectId" TEXT;

CREATE UNIQUE INDEX "ConversationProject_userId_name_key" ON "ConversationProject"("userId", "name");
CREATE INDEX "ConversationProject_userId_updatedAt_idx" ON "ConversationProject"("userId", "updatedAt");
CREATE INDEX "Conversation_userId_projectId_updatedAt_idx" ON "Conversation"("userId", "projectId", "updatedAt");

ALTER TABLE "ConversationProject" ADD CONSTRAINT "ConversationProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConversationProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
