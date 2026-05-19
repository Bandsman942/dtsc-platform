ALTER TABLE "CollaborationMessageMention"
  ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CollaborationMessageMention_mentionedUserId_isRead_createdAt_idx"
  ON "CollaborationMessageMention"("mentionedUserId", "isRead", "createdAt");
