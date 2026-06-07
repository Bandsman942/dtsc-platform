ALTER TABLE "TicketMessage"
  ADD COLUMN IF NOT EXISTS "replyToId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "TicketMessage" SET "updatedAt" = "createdAt";

CREATE INDEX IF NOT EXISTS "TicketMessage_replyToId_idx" ON "TicketMessage"("replyToId");

DO $$ BEGIN
  ALTER TABLE "TicketMessage"
    ADD CONSTRAINT "TicketMessage_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "TicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CooComment"
  ADD COLUMN IF NOT EXISTS "replyToId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CooComment_replyToId_idx" ON "CooComment"("replyToId");

DO $$ BEGIN
  ALTER TABLE "CooComment"
    ADD CONSTRAINT "CooComment_replyToId_fkey"
    FOREIGN KEY ("replyToId") REFERENCES "CooComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
