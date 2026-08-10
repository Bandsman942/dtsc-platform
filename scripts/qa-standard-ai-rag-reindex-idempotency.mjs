import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const personal = read("lib/rag.ts");
const enterprise = read("lib/enterprise-ai/knowledge.ts");
const reindex = read("lib/enterprise-ai/knowledge-reindex.ts");
const enterpriseUpload = read("app/api/enterprise/ai/knowledge-sources/route.ts");
const enterpriseAction = read("app/api/enterprise/ai/knowledge-sources/[id]/route.ts");
const personalUpload = read("app/api/documents/route.ts");
const personalReindex = read("app/api/documents/[id]/reindex/route.ts");
const migration = read("prisma/migrations/20260809234500_ai_rag_v2_index_metadata/migration.sql");
const planner = read("scripts/ai/plan-rag-reindex.mjs");

expect(enterprise.includes("indexPreparedEnterpriseAiKnowledgeSource"), "Enterprise retryable indexing function is missing");
expect(personal.includes("indexPreparedKnowledgeDocument"), "Personal retryable indexing function is missing");
expect(enterprise.includes("ON CONFLICT DO NOTHING") && personal.includes("ON CONFLICT DO NOTHING"), "Chunk retries must be idempotent");
expect(migration.includes("contentHash") && migration.includes("UNIQUE INDEX"), "Content hash uniqueness guard is missing");
expect(migration.includes("HEALTH_SENSITIVE") && migration.includes('UPDATE \"EnterpriseAiKnowledgeChunk\"'), "Legacy sensitive classification backfill is missing");
expect(enterpriseUpload.includes("after(async ()") && personalUpload.includes("after(async ()"), "Both upload paths must schedule indexing after response");
expect(enterpriseUpload.includes('status: "PROCESSING"') && personalUpload.includes('status: "PROCESSING"'), "Uploads must expose PROCESSING before completion");
expect(enterpriseAction.includes('action === "reindex"'), "Controlled enterprise reindex action is missing");
expect(enterpriseAction.includes("reindexEnterpriseAiKnowledgeSource"), "Enterprise reindex must perform explicit index cutover");
expect(enterpriseAction.includes("source.archivedAt"), "Archived enterprise sources must not be reindexed");
expect(reindex.includes('SET \"dataClassification\"=$3') && reindex.includes('"indexVersion"=$7'), "Enterprise reindex cutover must update classification and index version");
expect(personalReindex.includes("indexPreparedKnowledgeDocument"), "Personal reindex must use canonical indexing function");
expect(personalReindex.includes("userId: session.userId") && personalReindex.includes("organizationId"), "Personal reindex must preserve owner and tenant scope");
expect(planner.includes("dryRun: true") && planner.includes("LIMIT $3"), "Reindex planner must be dry-run and bounded");
expect(planner.includes("Math.min") && planner.includes("100"), "Reindex planner must cap batch size");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("standard-ai-rag-reindex-idempotency: OK");
