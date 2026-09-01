import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chatRoute = read("app/api/enterprise/ai/chat/route.ts");
const agentRoute = read("app/api/enterprise/ai/agent/route.ts");
const shell = read("components/chat/assistant-immersive-workspace-shell.tsx");
const confirmationBridge = read("components/chat/enterprise-ai-tool-confirmation-bridge.tsx");
const financeContract = read("lib/ai/tools/finance-contract.ts");
const financeExecutor = read("lib/ai/tools/executors/finance.ts");
const executorIndex = read("lib/ai/tools/executors/index.ts");
const schemas = read("lib/ai/tools/schemas.ts");
const registry = read("lib/ai/tool-registry.ts");
const agentTools = read("lib/ai/agent/tools.ts");
const authorization = read("lib/ai/tools/authorize.ts");
const execution = read("lib/ai/tools/execute.ts");
const enterpriseContext = read("lib/enterprise-ai/context.ts");
const regressionRunner = read("scripts/run-regression-qa-ci.mjs");

assert(chatRoute.includes('POST as enterpriseAgentPost') && chatRoute.includes("const agentRequest = req.clone()") && chatRoute.includes("if (data.useTools)"), "Tool-enabled Enterprise chat must delegate to the canonical agent endpoint before legacy side effects");
assert(chatRoute.includes("return enterpriseAgentPost(agentRequest)"), "Enterprise chat tool cutover must execute the canonical agent route");
assert(agentRoute.includes("createInteractiveAiAgentStream") && agentRoute.includes("maxToolCalls: 0") && agentRoute.includes("allowedToolModes: []"), "Canonical Enterprise agent route must remain the runtime source of truth and useTools=false must expose zero tools");

const tools = [
  ["FINANCE_OVERVIEW_READ", "FINANCE_OVERVIEW"],
  ["FINANCE_BUDGETS_READ", "FINANCE_BUDGETS"],
  ["FINANCE_RECEIVABLES_READ", "FINANCE_RECEIVABLES"],
  ["FINANCE_PAYABLES_READ", "FINANCE_PAYABLES"],
  ["FINANCE_PAYMENTS_READ", "FINANCE_PAYMENTS"],
  ["FINANCE_TREASURY_READ", "FINANCE_TREASURY"],
  ["FINANCE_CASH_READ", "FINANCE_CASH"],
  ["FINANCE_BANK_READ", "FINANCE_BANK"],
  ["FINANCE_RECONCILIATION_READ", "FINANCE_RECONCILIATION"],
  ["FINANCE_ACCOUNTING_READ", "FINANCE_ACCOUNTING"],
  ["FINANCE_TAX_READ", "FINANCE_TAX"],
  ["FINANCE_CLOSE_READ", "FINANCE_CLOSE"],
  ["FINANCE_STATEMENTS_READ", "FINANCE_STATEMENTS"],
  ["FINANCE_ASSETS_READ", "FINANCE_ASSETS"],
  ["FINANCE_INVENTORY_READ", "FINANCE_INVENTORY"],
];
for (const [toolCode, moduleCode] of tools) {
  assert(financeContract.includes(`code: \"${toolCode}\"`) && financeContract.includes(`moduleCode: \"${moduleCode}\"`), `${toolCode} must stay bound to ${moduleCode}`);
  assert(financeExecutor.includes(`case \"${toolCode}\"`), `${toolCode} must have a fixed native executor branch`);
}
assert(financeContract.includes('requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"]'), "Finance AI reads must declare the Enterprise AI read capability");
assert(financeContract.includes('contexts: ["ORGANIZATION"]') && financeContract.includes('mode: "READ"') && financeContract.includes("requiresConfirmation: false"), "Finance tools must remain organization-scoped READ operations");
assert(financeContract.includes('status: { enum: ["AVAILABLE", "EMPTY"] }') && !financeContract.includes('"UNAVAILABLE"') && !financeContract.includes('"DEGRADED"'), "Successful Finance tool payloads must distinguish data from empty reads without disguising backend failures");
assert(registry.includes("FINANCE_AI_TOOL_DEFINITIONS") && schemas.includes("FINANCE_AI_TOOL_INPUT_SCHEMAS") && schemas.includes("FINANCE_AI_TOOL_OUTPUT_SCHEMAS"), "Finance tools must be registered with canonical schemas");
assert(executorIndex.includes("FINANCE_AI_TOOL_EXECUTORS") && agentTools.includes("FINANCE_AI_TOOL_DESCRIPTIONS"), "Finance tools must be executable and described to the model");

assert(financeExecutor.includes("MAX_QUERY_ROWS = 25") && financeExecutor.includes("Math.min(MAX_QUERY_ROWS"), "Finance AI reads must remain bounded to 25 rows");
assert(financeExecutor.includes("context.session.activeOrganizationId !== organizationId"), "Finance executor must reject tenant/context mismatches");
assert(financeExecutor.includes("enterpriseBudgetVisibilityWhere") && financeExecutor.includes("enterpriseExpenseVisibilityWhere") && financeExecutor.includes("getEnterpriseFinanceAccess"), "Budget AI reads must preserve canonical per-user visibility");
assert(financeExecutor.includes('groupBy({ by: ["currencyCode"]') || financeExecutor.includes('by: ["currencyCode", "direction"]'), "Money summaries must preserve currency boundaries");
assert(!/\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(financeExecutor), "Finance READ executors must not mutate business data");
assert(!financeExecutor.includes("$executeRaw"), "Finance READ executors must not execute raw mutations");
assert(financeExecutor.includes('take: Math.min(limit, 12)') && !financeExecutor.includes("snapshotJson: true"), "Financial statement reads must not dump full persisted snapshots into model context");

assert(authorization.includes("resolveEnterpriseModuleAccess") && authorization.includes("canUseReadTools"), "Every exposed Finance tool must inherit canonical module and AI read authorization");
assert(execution.includes('INSERT INTO "AiToolExecution"') && execution.includes("enterpriseAiToolCall.create"), "Canonical Tool Gateway audit persistence must remain active");
assert(execution.includes('status: "FAILED"') || execution.includes("'FAILED'"), "Tool execution failures must remain explicit and auditable");

assert(enterpriseContext.includes("appelle cet outil dans le même tour") && enterpriseContext.includes("je vais tenter") && enterpriseContext.includes("aucun appel d'outil réel"), "Enterprise prompt must prohibit fake or deferred backend execution claims");
assert(enterpriseContext.includes("EMPTY signifie que la lecture backend a réussi") && enterpriseContext.includes("ne doit jamais être reformulée comme zéro"), "Enterprise prompt must distinguish successful empty reads from failures");

assert(shell.includes("EnterpriseAiToolConfirmationBridge") && confirmationBridge.includes("/api/ai/tools/pending"), "Enterprise workspace must surface structural pending confirmations");
assert(confirmationBridge.includes('import { createPortal } from "react-dom"') && confirmationBridge.includes("document.body"), "Enterprise confirmation UI must render outside the immersive shell layout contract");
assert(confirmationBridge.includes("/api/ai/tools/confirm") && confirmationBridge.includes("/api/ai/tools/cancel") && confirmationBridge.includes("/resume"), "Enterprise confirmation bridge must confirm/reject structurally and resume the linked agent run");
assert(!confirmationBridge.includes('body: JSON.stringify({ content: "oui"') && !confirmationBridge.includes('body: JSON.stringify({ content: "yes"'), "Natural-language confirmation must never authorize a mutation");

assert(regressionRunner.includes("qa-hotfix-543-enterprise-ai-erp-tool-gateway.mjs"), "Hotfix #543 QA must run inside the CI regression gate");

console.log("Hotfix #543 Enterprise AI ERP Tool Gateway QA passed");
