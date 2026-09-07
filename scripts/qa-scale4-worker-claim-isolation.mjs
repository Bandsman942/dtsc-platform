import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const count = (source, token) => source.split(token).length - 1;

const bulkConstants = read("lib/enterprise/bulk-jobs/constants.ts");
const bulkWorker = read("lib/enterprise/bulk-jobs/worker.ts");
const workflowWorker = read("lib/enterprise/workflows/worker.ts");
const isolatedWorkflowWorker = read("lib/enterprise/workflows/worker-isolated.ts");
const workflowConstants = read("lib/enterprise/workflows/constants.ts");
const pushWorker = read("lib/push/worker.ts");
const mailWorker = read("lib/mail/admin-broadcast-worker.ts");
const knowledgeWorker = read("lib/knowledge-index/worker.ts");
const vercel = read("vercel.json");
const regression = read("scripts/qa-regression-checks.mjs");

const bulkEventTokens = [...bulkConstants.matchAll(/export const ([A-Z0-9_]+_EVENT_TYPE)\s*=/g)].map((match) => match[1]);
ok(bulkEventTokens.length === 3, `SCALE-4 claim isolation: expected 3 bulk event types, found ${bulkEventTokens.length}.`);

for (const token of bulkEventTokens) {
  ok(
    count(workflowWorker, token) >= 6,
    `SCALE-4 claim isolation: workflow worker must exclude ${token} from four queue metrics and its claim.`,
  );
  ok(
    count(isolatedWorkflowWorker, token) >= 6,
    `SCALE-4 claim isolation: isolated workflow worker must exclude ${token} from four queue metrics and its claim.`,
  );
  ok(
    bulkWorker.includes(token),
    `SCALE-4 claim isolation: bulk worker must own ${token}.`,
  );
}

for (const token of [
  "WEB_PUSH_DOMAIN_EVENT_TYPE",
  "ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE",
  "KNOWLEDGE_INDEX_EVENT_TYPE",
]) {
  ok(count(workflowWorker, token) >= 6, `SCALE-4 claim isolation: workflow worker lost reserved exclusion ${token}.`);
  ok(count(isolatedWorkflowWorker, token) >= 6, `SCALE-4 claim isolation: isolated workflow worker lost reserved exclusion ${token}.`);
}

ok(
  bulkWorker.includes('WHERE "eventType" IN (${BANK_STATEMENT_IMPORT_EVENT_TYPE}, ${AUDIT_EXPORT_EVENT_TYPE}, ${FINANCE_REPORT_GENERATION_EVENT_TYPE})'),
  "SCALE-4 claim isolation: bulk worker claim must remain an allowlist of the three Finance bulk event types.",
);
ok(bulkWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: bulk claim must remain multi-instance safe.");
ok(workflowWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: workflow claim must remain multi-instance safe.");
ok(isolatedWorkflowWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: isolated workflow claim must remain multi-instance safe.");

for (const literal of [
  "FINANCE_BANK_STATEMENT_IMPORT_REQUESTED",
  "ENTERPRISE_AUDIT_EXPORT_REQUESTED",
  "FINANCE_REPORT_GENERATION_REQUESTED",
]) {
  ok(!workflowConstants.includes(`"${literal}"`), `SCALE-4 claim isolation: technical bulk event ${literal} must not become a workflow business trigger.`);
}

ok(pushWorker.includes("WEB_PUSH_DOMAIN_EVENT_TYPE") && pushWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: Web Push must keep its dedicated claim.");
ok(mailWorker.includes("ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE") && mailWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: admin email must keep its dedicated claim.");
ok(knowledgeWorker.includes("KNOWLEDGE_INDEX_EVENT_TYPE") && knowledgeWorker.includes("FOR UPDATE SKIP LOCKED"), "SCALE-4 claim isolation: knowledge indexing must keep its dedicated claim.");

const parsedVercel = JSON.parse(vercel);
const cronPaths = new Set((parsedVercel.crons || []).map((cron) => `${cron.path}|${cron.schedule}`));
ok(cronPaths.has("/api/internal/workflows/process?batch=20|* * * * *"), "SCALE-4 claim isolation: workflow cron ownership contract missing.");
ok(cronPaths.has("/api/internal/enterprise-bulk/process?batch=2|* * * * *"), "SCALE-4 claim isolation: bulk cron ownership contract missing.");
ok(regression.includes('await import("./qa-scale4-worker-claim-isolation.mjs")'), "SCALE-4 claim isolation gate must remain wired into Regression QA.");

if (failures.length) {
  console.error("SCALE-4 worker claim isolation QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("SCALE-4 worker claim isolation QA passed: workflow, Push, email, knowledge and Finance bulk event families keep disjoint durable claims.");
