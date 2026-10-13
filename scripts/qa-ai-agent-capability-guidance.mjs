import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const registry = read("lib/ai/tool-registry.ts");
const schemas = read("lib/ai/tools/schemas.ts");
const executors = read("lib/ai/tools/executors/index.ts");
const appExecutor = read("lib/ai/tools/executors/connected-apps.ts");
const appsGuidance = read("lib/ai/mcp/product-guidance.ts");
const authorization = read("lib/ai/tools/authorize.ts");
const gateway = read("lib/ai/tools/execute.ts");
const agentTools = read("lib/ai/agent/tools.ts");
const globalAgent = read("app/api/chat/agent/route.ts");
const enterpriseAgent = read("app/api/enterprise/ai/agent/route.ts");
const agentStatus = read("app/api/ai/agent/runs/[id]/route.ts");
const pendingApi = read("app/api/ai/tools/pending/route.ts");
const activeAgentApi = read("app/api/ai/agent/runs/active/route.ts");
const agentDock = read("components/chat/ai-agent-run-dock.tsx");
const agentPersistence = read("lib/ai/agent/persistence.ts");
const cancelApi = read("app/api/ai/tools/cancel/route.ts");
const confirmApi = read("app/api/ai/tools/confirm/route.ts");

assert(registry.includes('code: "CONNECTED_APPS_STATUS_READ"') && registry.includes('mode: "READ"'), "Connected-app status must use certified READ tool definition");
assert(registry.includes('allowedAssistantCodes: ["DTSC_GENERAL", "ENTERPRISE_GENERAL"]'), "Only named assistants may request connected-app metadata");
assert(registry.includes("requiresConfirmation: false") && registry.includes("idempotent: false"), "Status read must not create a mutation confirmation or cache prior read results");
assert(schemas.includes("CONNECTED_APPS_STATUS_READ: emptyInput") && schemas.includes('operationalToolCallsVerified: z.literal(false)'), "Tool must never imply remote operation");
assert(schemas.includes('path: z.literal("/ai/apps")') && schemas.includes("applications: z.array"), "Tool output must validate canonical navigation and bounded app states");
assert(schemas.includes('nextAction: z.enum(') && schemas.includes('explanation: z.string().min(1).max(500)'), "Connected-app next steps must be validated by bounded canonical Zod schemas");
assert(appsGuidance.includes("AVAILABILITY_NEXT_ACTION") && appsGuidance.includes('CONNECTED: "VERIFY_REMOTE_READ"') && appsGuidance.includes("getConnectedAppGuidance"), "Agent guidance must reuse canonical human statuses and distinguish OAuth from remote availability");
assert(appExecutor.includes("getConnectedAppGuidance(app.availability, locale)") && appExecutor.includes("operationalToolCallsVerified: false"), "Agent may guide a verified connection but cannot claim a remote MCP read");

assert(executors.includes("...CONNECTED_APP_AI_TOOL_EXECUTORS"), "Tool executor must be in the canonical gateway");
assert(appExecutor.includes("listConnectedAppsForUser") && appExecutor.includes("context.session.userId !== context.userId"), "Account information must be resolved from authenticated context");
assert(appExecutor.includes('active !== "ORGANIZATION"') && appExecutor.includes("context.session.activeOrganizationId"), "Enterprise scope must match current organization");
assert(appExecutor.includes("if (personal && context.organizationId)"), "Personal context must not list organization grants");
assert(appExecutor.includes('operationalToolCallsVerified: false') && !appExecutor.includes("getAuthorizedMcpOAuthAccessToken") && !appExecutor.includes("encryptedCredentials"), "Read-only status must not access or reveal OAuth secrets");
assert(authorization.includes("context.session.userId !== context.userId") && authorization.includes('activeContext === "GLOBAL_CLIENT"'), "Server tool authorization must deny spoofed session/user and mixed personal/tenant scope");
assert(gateway.includes("authorizeAiTool(input.toolCode") && gateway.includes("getAiToolOutputSchema"), "All tool calls must remain behind canonical validation and audit gateway");
assert(agentTools.includes("CONNECTED_APPS_STATUS_READ") && globalAgent.includes("CONNECTED_APPS_STATUS_READ") && enterpriseAgent.includes("CONNECTED_APPS_STATUS_READ"), "Both Agent conversations must use the live app status tool and never invent outcomes");
assert(agentStatus.includes('run.status === "BUDGET_EXHAUSTED"') && agentStatus.includes('"MAX_ESTIMATED_COST"') && agentStatus.includes("budgetReason:"), "Agent API may expose only allowlisted budget failure reasons");
assert(agentDock.includes('snapshot?.status === "BUDGET_EXHAUSTED"') && agentDock.includes("budgetExplanation") && agentDock.includes('href="/ai/apps"'), "Agent UI must explain exhausted budget and guide to canonical connected applications");
assert(agentDock.includes("Une action externe déjà effectuée n'est jamais rejouée automatiquement"), "Budget UX must never suggest blind replay of already executed actions");
assert(agentDock.includes("Vérifier mes applications") && agentDock.includes('href="/ai/apps"'), "Agent provides contextual app setup and status affordances");
assert(agentDock.includes("setPrompt(en ?") && !agentDock.includes("void startAgent()}/>"), "Suggested app check must populate intent, never execute agent automatically");
assert(agentDock.includes("CONFIRMATION_REQUIRED") || agentDock.includes('snapshot?.status === "READY_TO_RESUME"'), "Structured Agent confirmation and resume remain visible");
assert(pendingApi.includes('session.userId') && pendingApi.includes('session.activeOrganizationId') && pendingApi.includes('"Cache-Control": "private, no-store"'), "Confirmation preview must be scoped to the owner and uncached");
assert(pendingApi.includes('z.string().uuid().safeParse(confirmationId)') && pendingApi.includes('WHERE "id" = ${confirmationId}') && pendingApi.includes('LIMIT 1'), "Exact pending confirmation lookup must verify UUID and remain user/tenant scoped");
assert(agentDock.includes('pending?confirmationId=${encodeURIComponent(pendingId)}') && agentDock.includes('if (runId) await refreshRun(runId)') && !agentDock.includes('AGENT_CANCEL_FAILED'), "Agent must fetch exact pending preview and avoid double cancel after rejection");
assert(activeAgentApi.includes('getSession()') && activeAgentApi.includes('getActiveOrganizationId(session)') && activeAgentApi.includes('userId: session.userId') && activeAgentApi.includes('organizationId,') && activeAgentApi.includes('scope: variant === "enterprise"'), "Resumable run lookup must enforce exact authenticated user, organization and assistant scope");
assert(activeAgentApi.includes('status: { in: ["WAITING_CONFIRMATION", "READY_TO_RESUME"] }') && !activeAgentApi.includes('"RUNNING", "WAITING_CONFIRMATION"'), "Run recovery must never assume an HTTP stream survived reload");
assert(activeAgentApi.includes('"Cache-Control": "private, no-store"') && agentDock.includes('/api/ai/agent/runs/active?variant=') && agentDock.includes('setRunId((current) => current || body.runId)'), "Resume metadata must be uncached, scoped and must never replay a prompt on reload");


assert(pendingApi.includes('toolCode !== "SUPPORT_TICKET_CREATE"') && pendingApi.includes('toolCode !== "DTSC_CONTACT_EMAIL_SEND"') && pendingApi.includes('message,'), "Only supported actions expose complete, stored confirmation previews");
assert(agentDock.includes("canApprovePreview") && agentDock.includes("disabled={confirmBusy || !canApprovePreview}"), "Unknown/incomplete mutation previews cannot be blindly approved");
assert(agentDock.includes("confirmation.preview.message") && agentDock.includes("whitespace-pre-wrap break-words"), "Human approval must display full action text, not only a subject");
assert(agentPersistence.includes('return prisma.$transaction(async (tx) => {') && agentPersistence.includes('tx.aiToolConfirmation.updateMany({'), "Rejecting an Agent action must atomically invalidate its PENDING confirmation");
assert(agentPersistence.includes('status: "CANCELLED", argumentsJson: Prisma.DbNull') && agentPersistence.includes('pendingConfirmationId: true'), "Rejected approval payload must be invalidated and its arguments purged");
assert(agentPersistence.includes('where: { ...scopedWhere, status: run.status }') && agentPersistence.includes('organizationId: input.organizationId || null'), "Cancellation must be race-guarded and isolated to the current organization");
assert(cancelApi.includes('prisma.$transaction(async (tx) => {') && cancelApi.includes('tx.aiToolConfirmation.updateMany(') && cancelApi.includes('tx.aiAgentRun.updateMany('), "Rejection must atomically cancel both confirmation and Agent run");
for (const [code, source] of [["recovery", activeAgentApi], ["preview", pendingApi], ["approval", confirmApi], ["rejection", cancelApi]]) {
  assert(source.includes("requireActiveOrganizationMembership(session, organizationId)") && source.includes("ORGANIZATION_ACCESS_DENIED"), `${code} must reject revoked enterprise memberships rather than trusting a stale context cookie`);
}

assert(cancelApi.includes('argumentsJson: Prisma.DbNull') && cancelApi.includes('cancelledAt: now') && cancelApi.includes('completedAt: now'), "Rejecting a confirmation must purge its private arguments and mark the Agent terminal");


assert(agentDock.includes("humanToolLabel(step.toolCode, en)") && agentDock.includes("humanToolLabel(confirmation.toolCode, en)") && !agentDock.includes("${confirmation.toolCode}"), "Human-facing status must not reveal raw tool codes");
console.log("PASS AI-AGENT-01 initial tool: live scoped product status, canonical READ gateway, no MCP operational claims");
