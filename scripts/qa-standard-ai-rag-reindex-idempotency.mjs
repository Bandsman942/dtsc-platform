import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const enterprise = read("lib/enterprise-ai/knowledge.ts");
const uploadRoute = read("app/api/enterprise/ai/knowledge-sources/route.ts");
const actionRoute = read("app/api/enterprise/ai/knowledge-sources/[id]/route.ts");
const migration = read("prisma/migrations/20260809234500_ai_rag_v2_index_metadata/migration.sql");
const planner = read("scripts/ai/plan-rag-reindex.mjs");
expect(enterprise.includes("indexPreparedEnterpriseAiKnowledgeSource"), "Retryable indexing function is missing");
expect(enterprise.includes("ON CONFLICT DO NOTHING"), "Chunk retry must be idempotent");
expect(migration.includes("contentHash") && migration.includes("UNIQUE INDEX"), "Content hash uniqueness guard is missing");
expect(uploadRoute.includes("after(async ()"), "Upload must schedule indexing after response");
expect(uploadRoute.includes('status: "PROCESSING"'), "Upload must expose PROCESSING before index completion");
expect(actionRoute.includes('action === "reindex"'), "Controlled reindex action is missing");
expect(actionRoute.includes("indexPreparedEnterpriseAiKnowledgeSource"), "Reindex must use canonical indexing job");
expect(planner.includes("dryRun: true") && planner.includes("LIMIT $3"), "Reindex planner must be dry-run and bounded");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("standard-ai-rag-reindex-idempotency: OK");
