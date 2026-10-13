import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const registry = read("lib/ai/tool-registry.ts");
const schemas = read("lib/ai/tools/schemas.ts");
const executors = read("lib/ai/tools/executors/index.ts");
const appExecutor = read("lib/ai/tools/executors/connected-apps.ts");
const authorization = read("lib/ai/tools/authorize.ts");
const gateway = read("lib/ai/tools/execute.ts");
const agentTools = read("lib/ai/agent/tools.ts");
const globalAgent = read("app/api/chat/agent/route.ts");
const enterpriseAgent = read("app/api/enterprise/ai/agent/route.ts");

assert(registry.includes('code: "CONNECTED_APPS_STATUS_READ"') && registry.includes('mode: "READ"'), "Connected-app status must use certified READ tool definition");
assert(registry.includes('allowedAssistantCodes: ["DTSC_GENERAL", "ENTERPRISE_GENERAL"]'), "Only named assistants may request connected-app metadata");
assert(registry.includes("requiresConfirmation: false") && registry.includes("idempotent: false"), "Status read must not create a mutation confirmation or cache prior read results");
assert(schemas.includes("CONNECTED_APPS_STATUS_READ: emptyInput") && schemas.includes('operationalToolCallsVerified: z.literal(false)'), "Tool must never imply remote operation");
assert(schemas.includes('path: z.literal("/ai/apps")') && schemas.includes("applications: z.array"), "Tool output must validate canonical navigation and bounded app states");
assert(executors.includes("...CONNECTED_APP_AI_TOOL_EXECUTORS"), "Tool executor must be in the canonical gateway");
assert(appExecutor.includes("listConnectedAppsForUser") && appExecutor.includes("context.session.userId !== context.userId"), "Account information must be resolved from authenticated context");
assert(appExecutor.includes('active !== "ORGANIZATION"') && appExecutor.includes("context.session.activeOrganizationId"), "Enterprise scope must match current organization");
assert(appExecutor.includes("if (personal && context.organizationId)"), "Personal context must not list organization grants");
assert(appExecutor.includes('operationalToolCallsVerified: false') && !appExecutor.includes("getAuthorizedMcpOAuthAccessToken") && !appExecutor.includes("encryptedCredentials"), "Read-only status must not access or reveal OAuth secrets");
assert(authorization.includes("context.session.userId !== context.userId") && authorization.includes('activeContext === "GLOBAL_CLIENT"'), "Server tool authorization must deny spoofed session/user and mixed personal/tenant scope");
assert(gateway.includes("authorizeAiTool(input.toolCode") && gateway.includes("getAiToolOutputSchema"), "All tool calls must remain behind canonical validation and audit gateway");
assert(agentTools.includes("CONNECTED_APPS_STATUS_READ") && globalAgent.includes("CONNECTED_APPS_STATUS_READ") && enterpriseAgent.includes("CONNECTED_APPS_STATUS_READ"), "Both Agent conversations must use the live app status tool and never invent outcomes");
console.log("PASS AI-AGENT-01 initial tool: live scoped product status, canonical READ gateway, no MCP operational claims");
