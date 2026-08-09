-- DTSC AI RAG V2: additive metadata only. Existing vector(1536) values remain untouched.
-- The historical embedding model was configurable through env, so legacy rows are not relabeled with an unverified model id.

ALTER TABLE "KnowledgeDocument"
  ADD COLUMN IF NOT EXISTS "embeddingProviderCode" TEXT NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN IF NOT EXISTS "embeddingModelCode" TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER NOT NULL DEFAULT 1536,
  ADD COLUMN IF NOT EXISTS "indexVersion" TEXT NOT NULL DEFAULT 'legacy-openai-1536-v1',
  ADD COLUMN IF NOT EXISTS "chunkingVersion" TEXT NOT NULL DEFAULT 'legacy-char-v1',
  ADD COLUMN IF NOT EXISTS "indexedAt" TIMESTAMP(3);

ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "embeddingProviderCode" TEXT NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN IF NOT EXISTS "embeddingModelCode" TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER NOT NULL DEFAULT 1536,
  ADD COLUMN IF NOT EXISTS "indexVersion" TEXT NOT NULL DEFAULT 'legacy-openai-1536-v1',
  ADD COLUMN IF NOT EXISTS "chunkingVersion" TEXT NOT NULL DEFAULT 'legacy-char-v1',
  ADD COLUMN IF NOT EXISTS "sourceVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

ALTER TABLE "EnterpriseAiKnowledgeSource"
  ADD COLUMN IF NOT EXISTS "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS "embeddingProviderCode" TEXT NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN IF NOT EXISTS "embeddingModelCode" TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER NOT NULL DEFAULT 1536,
  ADD COLUMN IF NOT EXISTS "indexVersion" TEXT NOT NULL DEFAULT 'legacy-openai-1536-v1',
  ADD COLUMN IF NOT EXISTS "chunkingVersion" TEXT NOT NULL DEFAULT 'legacy-char-v1',
  ADD COLUMN IF NOT EXISTS "sourceVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "indexedAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseAiKnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "dataClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS "embeddingProviderCode" TEXT NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN IF NOT EXISTS "embeddingModelCode" TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER NOT NULL DEFAULT 1536,
  ADD COLUMN IF NOT EXISTS "indexVersion" TEXT NOT NULL DEFAULT 'legacy-openai-1536-v1',
  ADD COLUMN IF NOT EXISTS "chunkingVersion" TEXT NOT NULL DEFAULT 'legacy-char-v1',
  ADD COLUMN IF NOT EXISTS "sourceVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- Backfill legacy Enterprise sources conservatively before any provider can consume them.
UPDATE "EnterpriseAiKnowledgeSource"
SET "dataClassification" = CASE
  WHEN "confidentiality" = 'PUBLIC' THEN 'PUBLIC'
  WHEN "sectorCode" IN ('HEALTH_CARE', 'PHARMACY') THEN 'HEALTH_SENSITIVE'
  WHEN UPPER(COALESCE("moduleCode", '')) LIKE '%HR%' OR UPPER(COALESCE("moduleCode", '')) LIKE '%PAYROLL%' THEN 'HR_SENSITIVE'
  WHEN UPPER(COALESCE("moduleCode", '')) LIKE '%FINANCE%' OR UPPER(COALESCE("moduleCode", '')) LIKE '%ACCOUNT%' OR UPPER(COALESCE("moduleCode", '')) LIKE '%BUDGET%' THEN 'FINANCIAL_SENSITIVE'
  WHEN UPPER(COALESCE("moduleCode", '')) LIKE '%LEGAL%' OR UPPER(COALESCE("moduleCode", '')) LIKE '%CONTRACT%' THEN 'LEGAL_SENSITIVE'
  WHEN "confidentiality" IN ('CONFIDENTIAL', 'MANAGERS_ONLY') THEN 'CONFIDENTIAL'
  ELSE 'INTERNAL'
END;

UPDATE "EnterpriseAiKnowledgeChunk" AS chunk
SET "dataClassification" = source."dataClassification",
    "sourceVersion" = source."sourceVersion"
FROM "EnterpriseAiKnowledgeSource" AS source
WHERE source."id" = chunk."sourceId"
  AND source."organizationId" = chunk."organizationId";

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_indexVersion_idx"
  ON "KnowledgeChunk"("documentId", "indexVersion");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_org_indexVersion_idx"
  ON "EnterpriseAiKnowledgeChunk"("organizationId", "indexVersion");
CREATE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_org_classification_idx"
  ON "EnterpriseAiKnowledgeChunk"("organizationId", "dataClassification");
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_contentHash_indexVersion_key"
  ON "KnowledgeChunk"("documentId", "contentHash", "indexVersion") WHERE "contentHash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseAiKnowledgeChunk_sourceId_contentHash_indexVersion_key"
  ON "EnterpriseAiKnowledgeChunk"("sourceId", "contentHash", "indexVersion") WHERE "contentHash" IS NOT NULL;
