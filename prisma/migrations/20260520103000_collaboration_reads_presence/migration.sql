ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CollaborationGroupMessageRead" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CollaborationGroupMessageRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationGroupMessageRead_messageId_userId_key"
  ON "CollaborationGroupMessageRead"("messageId", "userId");

CREATE INDEX IF NOT EXISTS "CollaborationGroupMessageRead_groupId_userId_readAt_idx"
  ON "CollaborationGroupMessageRead"("groupId", "userId", "readAt");

CREATE INDEX IF NOT EXISTS "CollaborationGroupMessageRead_messageId_readAt_idx"
  ON "CollaborationGroupMessageRead"("messageId", "readAt");

CREATE INDEX IF NOT EXISTS "User_lastSeenAt_idx" ON "User"("lastSeenAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CollaborationGroupMessageRead_messageId_fkey'
  ) THEN
    ALTER TABLE "CollaborationGroupMessageRead"
      ADD CONSTRAINT "CollaborationGroupMessageRead_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "CollaborationGroupMessage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CollaborationGroupMessageRead_userId_fkey'
  ) THEN
    ALTER TABLE "CollaborationGroupMessageRead"
      ADD CONSTRAINT "CollaborationGroupMessageRead_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
