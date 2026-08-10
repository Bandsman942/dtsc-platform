import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const migration = read("prisma/migrations/20260809234500_ai_rag_v2_index_metadata/migration.sql");
const schema = read("prisma/schema.prisma");
const rag = read("lib/rag.ts");
const enterprise = read("lib/enterprise-ai/knowledge.ts");

for (const field of [
  "embeddingProviderCode",
  "embeddingModelCode",
  "embeddingDimension",
  "indexVersion",
  "chunkingVersion",
  "indexedAt",
]) {
  expect(migration.includes(`\"${field}\"`), `Migration index metadata missing: ${field}`);
  expect(schema.includes(field), `Prisma schema index metadata missing: ${field}`);
}
expect(migration.includes("LEGACY_UNKNOWN"), "Legacy embedding model must not be guessed");
expect(migration.includes("legacy-openai-1536-v1"), "Legacy index marker missing");
expect(rag.includes('kc.\"indexVersion\" = kd.\"indexVersion\"'), "Personal retrieval must prevent mixed document/chunk index versions");
expect(enterprise.includes('kc.\"indexVersion\" = ks.\"indexVersion\"'), "Enterprise retrieval must prevent mixed source/chunk index versions");
expect(schema.includes("dataClassification"), "Prisma schema must expose enterprise RAG data classification");
expect(schema.includes("contentHash"), "Prisma schema must expose RAG content hash metadata");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("standard-ai-index-versioning: OK");
