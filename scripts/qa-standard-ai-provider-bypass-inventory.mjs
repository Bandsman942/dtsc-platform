import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const inventoryPath = "docs/STANDARD_AI_PROVIDER_BYPASS_INVENTORY.md";
expect(fs.existsSync(inventoryPath), "Provider bypass inventory document must exist");

if (fs.existsSync(inventoryPath)) {
  const inventory = fs.readFileSync(inventoryPath, "utf8");
  for (const path of ["lib/rag.ts", "lib/openai.ts", "lib/private-chat-actions.ts", "app/api/public/dtsc-agent/route.ts"]) {
    expect(inventory.includes(path), `Provider bypass inventory must classify ${path}`);
  }
  for (const classification of ["MIGRATE_TO_ORCHESTRATOR", "KEEP_DIRECT_TEMPORARILY", "EMBEDDING_PROVIDER_MIGRATED"]) {
    expect(inventory.includes(classification), `Provider bypass inventory must use classification ${classification}`);
  }
}

const rag = fs.readFileSync("lib/rag.ts", "utf8");
const enterpriseKnowledge = fs.readFileSync("lib/enterprise-ai/knowledge.ts", "utf8");
const embeddings = fs.readFileSync("lib/ai/embeddings.ts", "utf8");
expect(!rag.includes("api.openai.com/v1/embeddings"), "Personal RAG must no longer call the OpenAI embedding endpoint directly");
expect(!enterpriseKnowledge.includes("api.openai.com/v1/embeddings"), "Enterprise RAG must no longer call the OpenAI embedding endpoint directly");
expect(embeddings.includes("api.openai.com/v1/embeddings"), "The current OpenAI embedding transport must live behind the canonical embedding provider abstraction");
expect(embeddings.includes("EmbeddingProviderDefinition"), "Embedding provider abstraction contract must remain explicit");

if (failures.length) {
  console.error("AI provider bypass inventory QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI provider bypass inventory QA passed");
