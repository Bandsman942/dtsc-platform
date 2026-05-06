ALTER TABLE "KnowledgeDocument"
  ADD COLUMN IF NOT EXISTS "storageBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "storagePath" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeDocument_storageBucket_storagePath_idx" ON "KnowledgeDocument"("storageBucket", "storagePath");
