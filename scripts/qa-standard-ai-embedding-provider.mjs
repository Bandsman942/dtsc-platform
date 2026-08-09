import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const embeddings = read("lib/ai/embeddings.ts");
const rag = read("lib/rag.ts");
expect(embeddings.includes("EmbeddingProviderDefinition"), "EmbeddingProvider contract is missing");
for (const field of ["providerCode", "modelCode", "dimension", "maximumInputCharacters", "supportsBatch", "version"]) expect(embeddings.includes(field), `Embedding provider field missing: ${field}`);
expect(embeddings.includes("createEmbeddings"), "Batch embedding API is missing");
expect(!rag.includes('fetch("https://api.openai.com/v1/embeddings"'), "RAG must not call OpenAI embeddings directly");
expect(rag.includes("createEmbeddings"), "RAG indexing must use provider abstraction batch API");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-embedding-provider: OK");
