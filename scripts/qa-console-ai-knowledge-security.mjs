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
console.log("PASS AI-CONSOLE-04 initial knowledge/safety metrics: canonical sources, metadata only, explicit UNKNOWN and responsive UI");
