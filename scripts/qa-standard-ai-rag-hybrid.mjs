import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const personal = read("lib/rag.ts");
const enterprise = read("lib/enterprise-ai/knowledge.ts");
const chat = read("app/api/enterprise/ai/chat/route.ts");
for (const source of [personal, enterprise]) {
  expect(source.includes("ts_rank_cd"), "Hybrid retrieval must include PostgreSQL lexical ranking");
  expect(source.includes("hybridScore"), "Hybrid retrieval score is missing");
  expect(source.includes("<= 0.55"), "Retrieval relevance threshold is missing");
}
expect(enterprise.includes('ks.\"organizationId\" = $2'), "Enterprise retrieval must enforce source tenant equality");
expect(enterprise.includes('ks.\"archivedAt\" IS NULL'), "Archived sources must be excluded before ranking");
for (const classification of ["HEALTH_SENSITIVE", "HR_SENSITIVE", "FINANCIAL_SENSITIVE", "LEGAL_SENSITIVE"]) expect(enterprise.includes(classification), `Missing RAG classification: ${classification}`);
expect(chat.includes("knowledge.dataClassifications"), "Retrieved classifications must be propagated into model policy");
expect(chat.includes("dataClassifications: routeDataClassifications"), "Policy Router must receive merged RAG classifications");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-rag-hybrid: OK");
