import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const routes = read("lib/console/console-routes.ts");
const capabilities = read("lib/console/console-capability-catalog.ts");
const access = read("lib/console/console-capabilities.ts");
const consolePage = read("app/admin/console-page.tsx");
const navigation = read("components/admin/admin-floating-nav.tsx");
const data = read("lib/console/console-ai.ts");
const ui = read("components/admin/console-ai-overview.tsx");
const guide = read("lib/user-guides/iteration07-guides.ts");
const fr = JSON.parse(read("locales/fr.json"));
const en = JSON.parse(read("locales/en.json"));

assert(routes.includes('"ai-control-center"') && routes.includes('"ai-control-center": "platform"'), "AI center must be a canonical Console section in Platform settings");
assert(routes.includes('"ai-control-center": null'), "AI must not inherit platform-settings block access");
assert(routes.includes('"ai-control-center": "CONSOLE_PLATFORM_SETTINGS"'), "AI is a Console sub-section, not a duplicate ERP module");
assert(capabilities.includes('AI_READ: "CONSOLE_AI_READ"') && capabilities.includes('AI_MANAGE: "CONSOLE_AI_MANAGE"'), "AI read/manage permissions must be distinct");
assert(capabilities.includes('CONSOLE_AI_READ: "ai-control-center"') && capabilities.includes('CONSOLE_AI_MANAGE: "ai-control-center"'), "AI capabilities must map to protected section");
assert(access.includes("CAPABILITY_REQUIRED") && access.includes("getConsoleAccessDecision"), "Console AI must use canonical permissions");
assert(consolePage.includes('!isDtscInternalSession(session)'), "Console must reject non-internal context");
assert(consolePage.includes('"ai-control-center": CONSOLE_CAPABILITIES.AI_READ') && consolePage.includes('"ai-control-center": CONSOLE_CAPABILITIES.AI_MANAGE'), "Navigation must be capability gated, not a new role bypass");
assert(consolePage.includes('activeSection === "ai-control-center"') && consolePage.includes("getConsoleAiDataset"), "AI view must use the server-side canonical dataset after authorization");
assert(navigation.includes('"ai-control-center": "CONSOLE_AI_CONTROL"'), "AI control center must have a contextual user guide");
assert(guide.includes("CONSOLE_AI_CONTROL:") && guide.includes("AiAgentRun") === false, "User guide must use business labels and not expose model codes");
for (const dictionary of [fr, en]) {
  assert(dictionary.console.sections["ai-control-center"]?.label, "FR/EN section navigation must be translated");
}
assert(data.includes('import "server-only"'), "Aggregated AI metadata must remain server-only");
assert(data.includes('FROM "AiModelCall"') && data.includes('FROM "AiModelCall"'), "Model-call metrics must use canonical event source");
assert(data.includes('FROM "AiModelCall"') && !data.includes('FROM "UsageLog"'), "Model calls and legacy usage logs must not be added together");
assert(data.includes("prisma.aiAgentRun.groupBy"), "Agent statistics must read existing Agent Run source without extra model-call count");
assert(data.includes('COUNT(*) FILTER (WHERE "status" = \'SUCCESS\')'), "Success rate must have a status-specific terminal denominator");
assert(data.includes('"costKind" IN (\'EXACT\', \'ESTIMATED\')') && data.includes('"costCurrency" = \'USD\''), "Unknown cost and other currencies must not become USD zero or be summed");
assert(data.includes("costed ? Number(row.usdCost) : null"), "Cost with no priced calls must be null/unknown, not zero");
assert(data.includes("completed ? Math.round((successful / completed)"), "Success rate without completed calls must be unknown");
assert(data.includes("PERCENTILE_CONT(0.95)"), "Latency P95 must derive from a database percentile, not an average");
assert(data.includes('reachability: "NOT_MEASURED"') && data.includes('Promise.allSettled'), "MCP health must not be guessed from registry/configuration, and missing telemetry must remain unknown");
assert(!data.includes("McpUserOAuthConnection") && !data.includes("encryptedCredentials"), "Global Console must never retrieve personal OAuth grants or secrets");
assert(ui.includes("overflow-x-auto") && ui.includes("min-w-0") && ui.includes("sm:grid-cols-2"), "AI layout must remain usable on mobile");
assert(ui.includes('role="group"') && ui.includes("aria-current") && ui.includes("focus-visible"), "Date navigation must be keyboard accessible");
assert(ui.includes('formatMoment(data.period.refreshedAt, locale)') && ui.includes("sourceMeta"), "AI metrics must include source, unit, period and freshness");
assert(ui.includes("Disponibilité non mesurée") && ui.includes("Outils MCP opérationnels"), "MCP configuration must not be presented as operational certification");
console.log("PASS AI-CONSOLE-01 — canonical scope, cost semantics, RBAC, MCP uncertainty, FR/EN and responsive signals");
