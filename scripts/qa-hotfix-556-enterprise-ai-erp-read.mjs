import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const includesAll = (content, values, label) => {
  for (const value of values) check(content.includes(value), `${label}: missing ${value}`);
};

const contract = read("lib/ai/tools/erp-contract.ts");
const executor = read("lib/ai/tools/executors/erp.ts");
const registry = read("lib/ai/tool-registry.ts");
const schemas = read("lib/ai/tools/schemas.ts");
const executorIndex = read("lib/ai/tools/executors/index.ts");
const agentTools = read("lib/ai/agent/tools.ts");
const runtime = read("lib/ai/agent/runtime.ts");
const authorize = read("lib/ai/tools/authorize.ts");
const finance = read("lib/ai/tools/executors/finance.ts");

const expectedTools = [
  ["ERP_TASKS_READ", "TASKS_OPERATIONS"],
  ["ERP_REQUESTS_READ", "INTERNAL_REQUESTS"],
  ["ERP_APPROVALS_READ", "VALIDATIONS"],
  ["ERP_MEETINGS_READ", "MEETINGS"],
  ["ERP_WORKFLOWS_READ", "WORKFLOWS"],
  ["ERP_PROCUREMENT_READ", "SUPPLIERS_PURCHASES"],
  ["ERP_DOCUMENTS_READ", "DOCUMENTS"],
  ["ERP_REPORTS_READ", "REPORTS"],
  ["ERP_CUSTOMERS_READ", "CRM_CUSTOMERS"],
  ["ERP_CATALOG_READ", "CATALOG"],
  ["ERP_SITES_READ", "SITES_WAREHOUSES"],
  ["ERP_CRM_PIPELINE_READ", "CRM_PIPELINE"],
  ["ERP_SALES_READ", "SALES_QUOTES_ORDERS"],
  ["ERP_CONTRACTS_READ", "CONTRACTS"],
  ["ERP_INVENTORY_READ", "INVENTORY_LOGISTICS"],
  ["ERP_HR_READ", "HUMAN_RESOURCES"],
  ["ERP_TIME_ATTENDANCE_READ", "TIME_ATTENDANCE"],
  ["ERP_PAYROLL_READ", "PAYROLL_OPERATIONS"],
  ["ERP_PROJECTS_READ", "PROJECTS_SERVICES"],
  ["ERP_DELIVERABLES_READ", "TIME_DELIVERABLES"],
  ["ERP_ASSETS_READ", "ASSETS_MAINTENANCE"],
  ["ERP_RETAIL_POS_READ", "RETAIL_POS"],
  ["ERP_MOBILE_MONEY_READ", "MOBILE_MONEY_AGENCY"],
  ["ERP_TELCO_READ", "TELCO_TOPUPS"],
  ["ERP_RETAIL_CLOSE_READ", "RETAIL_DAILY_CLOSE"],
];

check(expectedTools.length === 25, "Expected ERP READ inventory must contain 25 tools");
for (const [toolCode, moduleCode] of expectedTools) {
  check(contract.includes(`code: \"${toolCode}\"`) && contract.includes(`moduleCode: \"${moduleCode}\"`), `${toolCode}: canonical module mapping missing`);
  check(executor.includes(`case \"${toolCode}\"`), `${toolCode}: executor dispatch missing`);
}

includesAll(contract, [
  "ERP_AI_TOOL_DEFINITIONS",
  "requiredModuleCodes: [spec.moduleCode]",
  'requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"]',
  'allowedAssistantCodes: ["ENTERPRISE_GENERAL"]',
  'mode: "READ"',
  "requiresConfirmation: false",
  "idempotent: false",
], "ERP contract");
includesAll(registry, ["ERP_AI_TOOL_DEFINITIONS", "...ERP_AI_TOOL_DEFINITIONS"], "Tool registry");
includesAll(schemas, ["ERP_AI_TOOL_INPUT_SCHEMAS", "ERP_AI_TOOL_OUTPUT_SCHEMAS", "...ERP_AI_TOOL_INPUT_SCHEMAS", "...ERP_AI_TOOL_OUTPUT_SCHEMAS"], "Tool schemas");
includesAll(executorIndex, ["ERP_AI_TOOL_EXECUTORS", "...ERP_AI_TOOL_EXECUTORS"], "Executor registry");
includesAll(agentTools, ["ERP_AI_TOOL_DESCRIPTIONS", "...ERP_AI_TOOL_DESCRIPTIONS"], "Agent tool descriptions");

includesAll(authorize, [
  'if (mode === "READ") return "read" as const',
  "resolveEnterpriseModuleAccess",
  "for (const moduleCode of definition.requiredModuleCodes)",
  'deny("MODULE_NOT_ALLOWED"',
], "Tool authorization");

includesAll(runtime, [
  "Ne reproduis pas la structure JSON ni les champs techniques",
  "restitue fidèlement les valeurs métier autorisées",
  "montants, devises, quantités, prix, coûts, marges, dates, références, statuts, noms et libellés",
  "N'invente jamais une valeur absente",
], "Post-tool business-value guidance");

includesAll(finance, [
  "FINANCE_RECONCILIATION_READ",
  "amount: true",
  "currencyCode: true",
], "Finance monetary detail");

includesAll(executor, [
  "principalAmount: true",
  "customerFeeAmount: true",
  "providerCommissionAmount: true",
  "cashEffectAmount: true",
  "floatEffectAmount: true",
  "saleAmount: true",
  "operatorCost: true",
  "marginAmount: true",
  "grandTotal: true",
  "differenceAmount: true",
  "MAX_QUERY_ROWS = 25",
], "ERP/Retail monetary detail");

check(!executor.includes("customerPhone:"), "Mobile Money READ must not expose raw customer phone numbers");
check(!executor.includes("destinationPhone:"), "Telco READ must not expose raw destination phone numbers");
check(!executor.includes("primaryEmail:"), "ERP READ must not expose customer primary email by default");
check(!executor.includes("primaryPhone:"), "ERP READ must not expose customer primary phone by default");
check(!executor.includes("workEmail:"), "HR READ must not expose work email by default");
check(!executor.includes("workPhone:"), "HR READ must not expose work phone by default");
check(!executor.includes("prisma["), "ERP READ must never use dynamic Prisma model access");
for (const mutationToken of [".create({", ".update({", ".delete({", ".upsert({", ".$executeRaw", ".$queryRawUnsafe"]) {
  check(!executor.includes(mutationToken), `ERP READ executor must remain read-only: found ${mutationToken}`);
}

check(!executor.includes("movementType: true, quantity: true, occurredAt: true, reference: true, notes: true"), "Inventory READ must not select non-canonical stock movement fields");
includesAll(executor, ["movementType: true", "direction: true", "balanceAfter: true", "reason: true", "sourceEntityType: true"], "Canonical stock movement projection");

if (failures.length) {
  console.error("[hotfix-556] FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[hotfix-556] PASS — ${expectedTools.length} ERP READ adapters, RBAC mapping, monetary detail and safe projections verified.`);
