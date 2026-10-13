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
assert(data.includes("safeReasonCode") && data.includes("^[A-Z][A-Z0-9_]") && data.includes("reasonCode: safeReasonCode(r.reasonCode)"), "Only strict machine-readable reason codes may reach the global Console");
assert(data.includes('knowledge: personal.status === "fulfilled" && enterprise.status === "fulfilled"') && data.includes(': null'), "Missing knowledge data cannot be falsely displayed as zero");
assert(data.includes('status: "NOT_INSTRUMENTED"') && data.includes('alertHealth: "NOT_CONFIGURED"'), "CAG and alerts must not invent operational telemetry");
assert(!data.includes("extractedText:") && !data.includes("title: true") && !data.includes("argumentsJson"), "No private knowledge, user, tool arguments or prompt data in Console projection");
assert(panel.includes("data.knowledge === null") && panel.includes("data.modelFailures === null") && panel.includes("data.toolDenials === null"), "UI must distinguish not measured from zero");
assert(panel.includes("overflow-x-auto") && panel.includes("aria-label") && panel.includes("toLocaleString"), "Mobile/accessible compact numbers and tables required");
assert(page.includes("getConsoleAiKnowledgeSecurity") && page.includes("ConsoleAiKnowledgeSecurityPanel"), "Centre IA must render source-bound knowledge and safety metrics");
assert(page.includes('activeSection === "ai-control-center"'), "AI metrics must remain behind existing Console AI_READ boundary");
const alerts = read("lib/ai/governance-alerts.ts");
const alertsApi = read("app/api/admin/ai/alerts/route.ts");
const alertsUi = read("components/admin/console-ai-alert-panel.tsx");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261013170000_ai_governance_alert_rules/migration.sql");
assert(schema.includes("model AiGovernanceAlertRule") && migration.includes('CREATE TABLE "AiGovernanceAlertRule"'), "Alert rules must use additive versioned persistence");
assert(alerts.includes('import "server-only"') && alerts.includes('AI_ALERT_CODES') && alerts.includes("Promise.allSettled"), "Alert counts must read from server-only governed sources");
assert(alerts.includes("prisma.aiModelCall.count") && alerts.includes("prisma.aiToolExecution.count") && alerts.includes("prisma.knowledgeDocument.count"), "Alert thresholds must use actual count queries, not a truncated top-ten table");
assert(alerts.includes('"TRIGGERED"') && alerts.includes('"UNAVAILABLE"') && alerts.includes('"NOT_CONFIGURED"'), "An unmeasured signal must never be shown below threshold");
assert(alertsApi.includes("requireConsoleCapability(CONSOLE_CAPABILITIES.AI_MANAGE)") && alertsApi.includes("isSameOriginRequest") && alertsApi.includes("await rateLimit"), "Alert mutation requires RBAC, same-origin and async rate limiting");
assert(alertsApi.includes("expectedRevision") && alertsApi.includes("REVISION_CONFLICT") && alertsApi.includes("tx.platformSettingHistory.create") && alertsApi.includes("writeAuditLog"), "Alert policies must have optimistic concurrency and audited changes");
assert(alertsUi.includes("canManage") && alertsUi.includes('fetch("/api/admin/ai/alerts"') && alertsUi.includes("no automatic notifications"), "UI must guard editing and state that signals are not automatic notifications");
assert(page.includes("ConsoleAiAlertPanel") && page.includes("getConsoleAiAlertSnapshot"), "Alert UI must remain under existing protected AI Console");

console.log("PASS AI-CONSOLE-04 initial knowledge/safety metrics: canonical sources, metadata only, explicit UNKNOWN and responsive UI");
