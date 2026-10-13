import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const data = read("lib/console/console-ai-knowledge-security.ts");
const panel = read("components/admin/console-ai-knowledge-security-panel.tsx");
const page = read("app/admin/console-page.tsx");

assert(data.includes('import "server-only"'), "Knowledge observability must stay server-side");
assert(data.includes("prisma.knowledgeDocument.groupBy") && data.includes("prisma.enterpriseAiKnowledgeSource.groupBy"), "Personal/enterprise knowledge status metrics must read canonical tables");
assert(data.includes("archivedAt: null"), "Archived enterprise sources must be excluded from readiness");
assert(data.includes("prisma.aiModelCall.groupBy") && data.includes("prisma.aiToolExecution.groupBy"), "AI failures and denied tools must read canonical audit metadata");
assert(data.includes("Promise.allSettled"), "Partial outages must be isolated by source");
assert(data.includes('indexVersion: "legacy-openai-1536-v1"') && data.includes("legacyEnterprise: enterpriseLegacy.value"), "Index reports must use canonical metadata and preserve historical unknown models");
assert(panel.includes("data.indexing === null") && panel.includes("No document is changed."), "UI must not imply mass reindex or hide missing measurements");
assert(data.includes("prisma.knowledgeDocument.count") && data.includes("prisma.enterpriseAiKnowledgeSource.count") && data.includes("Math.min(25, personalReindex.value)") && data.includes("reindexPreview:") && data.includes("executable: false"), "Console previews must query only aggregate counts, cap at 25 and never load private candidate IDs");
assert(panel.includes("data.reindexPreview === null") && panel.includes("maxPerDomain"), "Reindex preview must show the cap and unavailable state");
assert(data.includes("safeReasonCode") && data.includes("^[A-Z][A-Z0-9_]") && data.includes("reasonCode: safeReasonCode(r.reasonCode)"), "Only strict machine-readable reason codes may reach the global Console");
assert(data.includes('knowledge: personal.status === "fulfilled" && enterprise.status === "fulfilled"') && data.includes(': null'), "Missing knowledge data cannot be falsely displayed as zero");
const cagRegistry = read("lib/ai/cag-registry.ts");
const aiRuntime = read("lib/ai/assistant-runtime.ts");
assert(cagRegistry.includes("cacheHit: packs.every((pack) => pack.cacheHit)") && aiRuntime.includes("cagCacheHit: cag.cacheHit"), "Observed CAG hits must derive from actual builder cache state");
assert(data.includes('FROM "ApiLog"') && data.includes('jsonb_typeof("metadata"->\'cagCacheHit\') = \'boolean\'') && data.includes('"/api/chat/v2"') === false, "CAG metrics must aggregate verified boolean audit metadata from actual assistant paths");
assert(data.includes('status: "UNAVAILABLE"') && data.includes('"NO_OBSERVATIONS"') && data.includes('"MEASURED"'), "CAG telemetry outage, missing observations and real hits must remain distinct");
assert(panel.includes("data.cag.status === \"UNAVAILABLE\"") && panel.includes('instance-local cache') && !panel.includes("CAG cache hit rate: not instrumented"), "CAG UX must report actual local-cache observations, not fictitious global telemetry");
assert(!data.includes("alertHealth"), "Governed alert health must come only from alert rules");
assert(data.includes('citationProof: { status: "NOT_INSTRUMENTED", certifiedUsageCount: null }') && panel.includes("Proof of citations actually used"), "Do not invent citation-use metrics without source evidence");
assert(data.includes('FROM "EnterpriseAiMessage"') && data.includes('jsonb_array_length(') && data.includes('AND "deletedAt" IS NULL') && data.includes('citationAttachments.status === "fulfilled"'), "Citation metrics must aggregate only persisted answer attachments, filter deleted records and represent outage as unavailable");
assert(data.includes('meaning: "RETRIEVAL_CANDIDATES_NOT_PROVEN_USED"') && panel.includes("data.citationAttachments === null") && panel.includes("not proof it was referenced"), "Console must distinguish retrieved candidates from actual citation usage");

assert(!data.includes("select: { id: true }") && !data.includes("title: true") && !data.includes("argumentsJson") && !data.includes("extractedText: true"), "No document IDs, private text, user identities, tool arguments or prompts projected into Console");
assert(panel.includes("data.knowledge === null") && panel.includes("data.modelFailures === null") && panel.includes("data.toolDenials === null"), "UI must distinguish not measured from zero");
assert(panel.includes("statusLabel(status)") && !panel.includes(">KnowledgeDocument · EnterpriseAiKnowledgeSource</p>") && !panel.includes(">AiToolExecution · DENIED"), "Console must use localized business labels rather than exposing Prisma model names or raw statuses");
assert(panel.includes("overflow-x-auto") && panel.includes("aria-label") && panel.includes("toLocaleString"), "Mobile/accessible compact numbers and tables required");
assert(page.includes("getConsoleAiKnowledgeSecurity") && page.includes("ConsoleAiKnowledgeSecurityPanel"), "Centre IA must render source-bound knowledge and safety metrics");
assert(page.includes('activeSection === "ai-control-center"'), "AI metrics must remain behind existing Console AI_READ boundary");
const alerts = read("lib/ai/governance-alerts.ts");
const alertsApi = read("app/api/admin/ai/alerts/route.ts");
const alertsUi = read("components/admin/console-ai-alert-panel.tsx");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261013170000_ai_governance_alert_rules/migration.sql");
const citationIndexMigration = read("prisma/migrations/20261013210000_ai_citation_metadata_window_index/migration.sql");
assert(schema.includes("model AiGovernanceAlertRule") && migration.includes('CREATE TABLE "AiGovernanceAlertRule"'), "Alert rules must use additive versioned persistence");
assert(schema.includes("@@index([role, deletedAt, createdAt])") && citationIndexMigration.includes('CREATE INDEX IF NOT EXISTS "EnterpriseAiMessage_role_deletedAt_createdAt_idx"'), "Citation metadata aggregation must use an additive time-window index");
assert(!/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i.test(citationIndexMigration), "Citation observability migration cannot remove historical messages");

assert(alerts.includes('import "server-only"') && alerts.includes('AI_ALERT_CODES') && alerts.includes("Promise.allSettled"), "Alert counts must read from server-only governed sources");
assert(alerts.includes("prisma.aiModelCall.count") && alerts.includes("prisma.aiToolExecution.count") && alerts.includes("prisma.knowledgeDocument.count"), "Alert thresholds must use actual count queries, not a truncated top-ten table");
assert(alerts.includes('"TRIGGERED"') && alerts.includes('"UNAVAILABLE"') && alerts.includes('"NOT_CONFIGURED"'), "An unmeasured signal must never be shown below threshold");
assert(alerts.includes("records !== null && !raw ? 0 : null"), "An unconfigured rule must start at revision zero and remain configurable");
assert(alertsApi.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.AI_MANAGE)") && alertsApi.includes("isSameOriginRequest") && alertsApi.includes("await rateLimit"), "Alert mutation requires RBAC, same-origin and async rate limiting");
assert(alertsApi.includes("expectedRevision") && alertsApi.includes("REVISION_CONFLICT") && alertsApi.includes("tx.platformSettingHistory.create") && alertsApi.includes("writeAuditLog"), "Alert policies must have optimistic concurrency and audited changes");
assert(alertsUi.includes("canManage") && alertsUi.includes('fetch("/api/admin/ai/alerts"') && alertsUi.includes("no automatic notifications"), "UI must guard editing and state that signals are not automatic notifications");
assert(page.includes("ConsoleAiAlertPanel") && page.includes("getConsoleAiAlertSnapshot"), "Alert UI must remain under existing protected AI Console");

console.log("PASS AI-CONSOLE-04 initial knowledge/safety metrics: canonical sources, metadata only, explicit UNKNOWN and responsive UI");
