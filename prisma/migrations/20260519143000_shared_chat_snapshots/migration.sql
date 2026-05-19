-- Store group-safe snapshots for chatbot conversations shared in Mes collaborateurs.

CREATE TABLE IF NOT EXISTS "CollaborationSharedConversation" (
  "id" TEXT NOT NULL,
  "originalConversationId" TEXT,
  "sharedById" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "messageId" TEXT,
  "title" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'GROUP',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CollaborationSharedConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationSharedConversation_messageId_key" ON "CollaborationSharedConversation"("messageId");
CREATE INDEX IF NOT EXISTS "CollaborationSharedConversation_groupId_status_createdAt_idx" ON "CollaborationSharedConversation"("groupId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationSharedConversation_sharedById_createdAt_idx" ON "CollaborationSharedConversation"("sharedById", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationSharedConversation_originalConversationId_idx" ON "CollaborationSharedConversation"("originalConversationId");

DO $$ BEGIN
  ALTER TABLE "CollaborationSharedConversation" ADD CONSTRAINT "CollaborationSharedConversation_originalConversationId_fkey" FOREIGN KEY ("originalConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationSharedConversation" ADD CONSTRAINT "CollaborationSharedConversation_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationSharedConversation" ADD CONSTRAINT "CollaborationSharedConversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CollaborationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollaborationSharedConversation" ADD CONSTRAINT "CollaborationSharedConversation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
