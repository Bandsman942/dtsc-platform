import fs from "node:fs";

const schemaPath = "prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

function transformModel(name, transform) {
  const pattern = new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m");
  const match = schema.match(pattern);
  if (!match) throw new Error(`MODEL_NOT_FOUND:${name}`);
  schema = schema.replace(match[0], transform(match[0]));
}

function insertAfter(block, pattern, content, label) {
  if (!pattern.test(block)) throw new Error(`ANCHOR_NOT_FOUND:${label}`);
  pattern.lastIndex = 0;
  return block.replace(pattern, (match) => `${match}${content}`);
}

function addIndex(block, content) {
  return block.includes(content.trim()) ? block : block.replace(/\n\}$/, `\n${content}\n}`);
}

transformModel("KnowledgeDocument", (block) => {
  let next = block.replace(/\n\s*@@index\(\[id, indexVersion\]\)/, "");
  if (!next.includes("embeddingProviderCode")) {
    next = insertAfter(
      next,
      /\n\s*errorMessage\s+String\?\s*\n/,
      '  embeddingProviderCode String           @default("OPENAI")\n' +
        '  embeddingModelCode    String           @default("LEGACY_UNKNOWN")\n' +
        '  embeddingDimension    Int              @default(1536)\n' +
        '  indexVersion          String           @default("legacy-openai-1536-v1")\n' +
        '  chunkingVersion       String           @default("legacy-char-v1")\n' +
        '  indexedAt             DateTime?\n',
      "KnowledgeDocument.errorMessage"
    );
  }
  return next;
});

transformModel("KnowledgeChunk", (block) => {
  let next = block;
  if (!next.includes("embeddingProviderCode")) {
    next = insertAfter(
      next,
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
  }
  return addIndex(next, "  @@index([documentId, indexVersion])");
});

transformModel("EnterpriseAiKnowledgeSource", (block) => {
  let next = block.replace(/\n\s*@@index\(\[organizationId, indexVersion\]\)/, "");
  if (!next.includes("dataClassification")) {
    next = insertAfter(
      next,
      /\n\s*errorMessage\s+String\?\s*\n/,
      '  dataClassification      String                       @default("INTERNAL")\n' +
        '  embeddingProviderCode String                       @default("OPENAI")\n' +
        '  embeddingModelCode    String                       @default("LEGACY_UNKNOWN")\n' +
        '  embeddingDimension    Int                          @default(1536)\n' +
        '  indexVersion          String                       @default("legacy-openai-1536-v1")\n' +
        '  chunkingVersion       String                       @default("legacy-char-v1")\n' +
        '  sourceVersion         Int                          @default(1)\n' +
        '  indexedAt             DateTime?\n',
      "EnterpriseAiKnowledgeSource.errorMessage"
    );
  }
  return next;
});

transformModel("EnterpriseAiKnowledgeChunk", (block) => {
  let next = block;
  if (!next.includes("dataClassification")) {
    next = insertAfter(
      next,
      /\n\s*embedding\s+Unsupported\("vector\(1536\)"\)\?\s*\n/,
      '  dataClassification      String                       @default("INTERNAL")\n' +
        '  embeddingProviderCode String                       @default("OPENAI")\n' +
        '  embeddingModelCode    String                       @default("LEGACY_UNKNOWN")\n' +
        '  embeddingDimension    Int                          @default(1536)\n' +
        '  indexVersion          String                       @default("legacy-openai-1536-v1")\n' +
        '  chunkingVersion       String                       @default("legacy-char-v1")\n' +
        '  sourceVersion         Int                          @default(1)\n' +
        '  contentHash           String?\n',
      "EnterpriseAiKnowledgeChunk.embedding"
    );
  }
  next = addIndex(next, "  @@index([organizationId, indexVersion])");
  return addIndex(next, "  @@index([organizationId, dataClassification])");
});

fs.writeFileSync(schemaPath, schema);
console.log("AI05 RAG V2 Prisma schema synchronized");
