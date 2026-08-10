import fs from "node:fs";

const schemaPath = "prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

function updateModel(name, transform) {
  const pattern = new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m");
  const match = schema.match(pattern);
  if (!match) throw new Error(`MODEL_NOT_FOUND:${name}`);
  const next = transform(match[0]);
  if (next === match[0]) throw new Error(`MODEL_NOT_CHANGED:${name}`);
  schema = schema.replace(match[0], next);
}

function insertAfter(block, pattern, content, label) {
  if (!pattern.test(block)) throw new Error(`ANCHOR_NOT_FOUND:${label}`);
  pattern.lastIndex = 0;
  return block.replace(pattern, (match) => `${match}${content}`);
}

function addIndexBeforeClose(block, content) {
  return block.replace(/\n\}$/, `${content}\n}`);
}

updateModel("KnowledgeDocument", (block) => {
  if (block.includes("embeddingProviderCode")) throw new Error("RAG_METADATA_ALREADY_PRESENT:KnowledgeDocument");
  let next = insertAfter(
    block,
    /\n\s*errorMessage\s+String\?\s*\n/,
    '  embeddingProviderCode String           @default("OPENAI")\n' +
      '  embeddingModelCode    String           @default("LEGACY_UNKNOWN")\n' +
      '  embeddingDimension    Int              @default(1536)\n' +
      '  indexVersion          String           @default("legacy-openai-1536-v1")\n' +
      '  chunkingVersion       String           @default("legacy-char-v1")\n' +
      '  indexedAt             DateTime?\n',
    "KnowledgeDocument.errorMessage"
  );
  next = addIndexBeforeClose(next, '\n  @@index([id, indexVersion])');
  return next;
});

updateModel("KnowledgeChunk", (block) => {
  if (block.includes("embeddingProviderCode")) throw new Error("RAG_METADATA_ALREADY_PRESENT:KnowledgeChunk");
  let next = insertAfter(
    block,
    /\n\s*embedding\s+Unsupported\("vector\(1536\)"\)\?\s*\n/,
    '  embeddingProviderCode String                       @default("OPENAI")\n' +
      '  embeddingModelCode    String                       @default("LEGACY_UNKNOWN")\n' +
      '  embeddingDimension    Int                          @default(1536)\n' +
      '  indexVersion          String                       @default("legacy-openai-1536-v1")\n' +
      '  chunkingVersion       String                       @default("legacy-char-v1")\n' +
      '  sourceVersion         Int                          @default(1)\n' +
      '  contentHash           String?\n',
    "KnowledgeChunk.embedding"
  );
  next = addIndexBeforeClose(next, '\n  @@index([documentId, indexVersion])');
  return next;
});

updateModel("EnterpriseAiKnowledgeSource", (block) => {
  if (block.includes("dataClassification")) throw new Error("RAG_METADATA_ALREADY_PRESENT:EnterpriseAiKnowledgeSource");
  let next = insertAfter(
    block,
    /\n\s*errorMessage\s+String\?\s*\n/,
    '  dataClassification    String                       @default("INTERNAL")\n' +
      '  embeddingProviderCode String                       @default("OPENAI")\n' +
      '  embeddingModelCode    String                       @default("LEGACY_UNKNOWN")\n' +
      '  embeddingDimension    Int                          @default(1536)\n' +
      '  indexVersion          String                       @default("legacy-openai-1536-v1")\n' +
      '  chunkingVersion       String                       @default("legacy-char-v1")\n' +
      '  sourceVersion         Int                          @default(1)\n' +
      '  indexedAt             DateTime?\n',
    "EnterpriseAiKnowledgeSource.errorMessage"
  );
  next = addIndexBeforeClose(next, '\n  @@index([organizationId, indexVersion])');
  return next;
});

updateModel("EnterpriseAiKnowledgeChunk", (block) => {
  if (block.includes("dataClassification")) throw new Error("RAG_METADATA_ALREADY_PRESENT:EnterpriseAiKnowledgeChunk");
  let next = insertAfter(
    block,
    /\n\s*embedding\s+Unsupported\("vector\(1536\)"\)\?\s*\n/,
    '  dataClassification    String                       @default("INTERNAL")\n' +
      '  embeddingProviderCode String                       @default("OPENAI")\n' +
      '  embeddingModelCode    String                       @default("LEGACY_UNKNOWN")\n' +
      '  embeddingDimension    Int                          @default(1536)\n' +
      '  indexVersion          String                       @default("legacy-openai-1536-v1")\n' +
      '  chunkingVersion       String                       @default("legacy-char-v1")\n' +
      '  sourceVersion         Int                          @default(1)\n' +
      '  contentHash           String?\n',
    "EnterpriseAiKnowledgeChunk.embedding"
  );
  next = addIndexBeforeClose(
    next,
    '\n  @@index([organizationId, indexVersion])\n  @@index([organizationId, dataClassification])'
  );
  return next;
});

fs.writeFileSync(schemaPath, schema);
console.log("AI05 RAG V2 Prisma schema synchronized");
