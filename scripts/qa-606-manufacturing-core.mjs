import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const includesAll = (content, tokens, label) => {
  for (const token of tokens) check(content.includes(token), `${label}: missing ${token}`);
};
const excludesAll = (content, tokens, label) => {
  for (const token of tokens) check(!content.includes(token), `${label}: forbidden ${token}`);
};

const registry = read("lib/enterprise/module-registry-manufacturing.json");
const registryCore = read("lib/enterprise/module-registry.ts");
const order = read("lib/enterprise/module-order.ts");
const schema = read("prisma/enterprise-manufacturing.prisma");
const migration = read("prisma/migrations/20260909014000_manufacturing_core/migration.sql");
const inventoryConstants = read("lib/enterprise/inventory/constants.ts");
const shared = read("lib/enterprise/manufacturing/shared.ts");
const definitions = read("lib/enterprise/manufacturing/definitions-service.ts");
const production = read("lib/enterprise/manufacturing/production-service.ts");
const queries = read("lib/enterprise/manufacturing/queries.ts");
const collectionApi = read("app/api/enterprise/[organizationId]/manufacturing/route.ts");
const orderApi = read("app/api/enterprise/[organizationId]/manufacturing/orders/[orderId]/route.ts");
const http = read("lib/enterprise/manufacturing/http.ts");
const workspace = read("components/enterprise/manufacturing/enterprise-manufacturing-workspace.tsx");
const modulePage = read("app/enterprise-modules/[moduleCode]/page.tsx");
const aiContract = read("lib/ai/tools/manufacturing-contract.ts");
const aiExecutor = read("lib/ai/tools/executors/manufacturing.ts");
const aiRegistry = read("lib/ai/tool-registry.ts");
const aiSchemas = read("lib/ai/tools/schemas.ts");
const aiExecutors = read("lib/ai/tools/executors/index.ts");
const aiAgent = read("lib/ai/agent/tools.ts");
const procurementShared = read("lib/enterprise/procurement/shared.ts");
const docs = read("docs/MANUFACTURING_CORE_ARCHITECTURE.md");
const regression = read("scripts/qa-regression-checks.mjs");

const moduleCodes = [
  "MANUFACTURING_OVERVIEW",
  "BILL_OF_MATERIALS",
  "PRODUCTION_ORDERS",
  "PRODUCTION_ROUTINGS",
  "WORK_CENTERS",
  "MATERIAL_REQUIREMENTS",
  "PRODUCTION_EXECUTION",
  "QUALITY_CONTROL",
  "SCRAP_WASTE",
  "PRODUCTION_REPORTS",
];
for (const code of moduleCodes) includesAll(registry, [`\"code\": \"${code}\"`, '\"implementationStatus\": \"ACTIVE\"', '\"MANUFACTURING\"'], `registry ${code}`);
includesAll(registryCore, ["module-registry-manufacturing.json", "SECTOR_MANUFACTURING"], "canonical registry composition");
includesAll(order, ["SECTOR_MANUFACTURING"], "navigation order");
excludesAll(registry, ['\"code\": \"RAW_MATERIALS\"', '\"code\": \"FINISHED_PRODUCTS\"'], "no duplicate inventory modules");

for (const model of [
  "EnterpriseManufacturingConfiguration",
  "EnterpriseManufacturingWorkCenter",
  "EnterpriseManufacturingRouting",
  "EnterpriseManufacturingRoutingOperation",
  "EnterpriseBillOfMaterial",
  "EnterpriseBillOfMaterialLine",
  "EnterpriseProductionOrder",
  "EnterpriseProductionMaterialRequirement",
  "EnterpriseProductionExecution",
  "EnterpriseProductionQualityCheck",
  "EnterpriseProductionScrap",
]) check(schema.includes(`model ${model} {`), `Prisma model missing: ${model}`);
includesAll(schema, [
  "@@unique([organizationId, id])",
  "outputCatalogItemId",
  "salesOrderId",
  "inventoryItemId",
  "purchaseId",
  "employeeId",
  "timesheetEntryId",
  "assetId",
  "stockMovementId",
  "idempotencyKey",
], "tenant and common-domain references");
excludesAll(schema, ["ManufacturingStock", "ManufacturingCustomer", "ManufacturingSupplier", "ManufacturingInvoice", "ManufacturingPayment"], "no parallel truth models");

check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "Manufacturing migration must remain additive and non-destructive");
includesAll(migration, ["EnterpriseProductionOrder", "EnterpriseBillOfMaterial", "EnterpriseManufacturingRouting", "PRODUCTION_ORDERS", "RAW_MATERIALS", "FINISHED_PRODUCTS", '"defaultEnabled"=false'], "additive migration and placeholder cutover");

includesAll(inventoryConstants, ["PRODUCTION_CONSUMPTION", "PRODUCTION_OUTPUT", "PRODUCTION_SCRAP"], "common Inventory movement vocabulary");
includesAll(shared, ["organizationId", "requireManufacturingCatalogItem", "requireManufacturingInventoryItem", "requireManufacturingSalesOrderLine", "requireManufacturingEmployee", "requireManufacturingTimesheetEntry", "requireManufacturingAsset", "Serializable", "salesOrderId", "quantityOrdered", "quantityFulfilled"], "cross-domain tenant validation");
excludesAll(shared, ["fulfilledQuantity", "select: { id: true, orderId:"], "no legacy sales-order field names");
includesAll(definitions, ["enterpriseCatalogItem", "enterpriseInventoryItem", "enterpriseManufacturingWorkCenter", "enterpriseBillOfMaterial", "enterpriseManufacturingRouting"], "definition service canonical references");
includesAll(production, [
  "applyStockMovementTx",
  'movementType: "PRODUCTION_CONSUMPTION"',
  'movementType: "PRODUCTION_OUTPUT"',
  'movementType: "PRODUCTION_SCRAP"',
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  "createEnterprisePurchase",
  'sourceModule: "MATERIAL_REQUIREMENTS"',
  'sourceEntityType: "EnterpriseProductionOrder"',
  'sourceEntityType: "EnterpriseProductionMaterialRequirement"',
  'order.priority === "CRITICAL" ? "CRITICAL"',
  "await refreshMaterialRequirementsTx(tx, organizationId, order.id);",
], "production transaction contract");
check(!production.includes('? "URGENT"'), "Manufacturing shortage purchases must use canonical Procurement priority CRITICAL, never URGENT");
includesAll(procurementShared, ["EnterpriseProductionOrder", "EnterpriseProductionMaterialRequirement"], "Procurement source validation");
includesAll(queries, ["quantityOrdered", "quantityFulfilled", "organizationId", "PRODUCTION_CONSUMPTION", "PRODUCTION_OUTPUT", "PRODUCTION_SCRAP"], "read models use canonical fields");

includesAll(http, ["isSameOriginRequest", "rateLimit", "getManufacturingAccess", "activeOrganizationId !== organizationId", "ManufacturingDomainError"], "Manufacturing HTTP security");
includesAll(collectionApi, ["authorizeManufacturingRequest", "writeAuditLog", "writeApiLog", "SUPPLIERS_PURCHASES", "SALES_QUOTES_ORDERS", "HUMAN_RESOURCES", "TIME_ATTENDANCE", "ASSETS_MAINTENANCE", "INVENTORY_LOGISTICS"], "collection API permission composition");
includesAll(orderApi, ["authorizeManufacturingRequest", "CONSUME_MATERIAL", "RECEIVE_OUTPUT", "RECORD_EXECUTION", "REFRESH_REQUIREMENTS", "resolveEnterpriseModuleAccess", "writeAuditLog"], "order API contract");

includesAll(workspace, ["EnterpriseManufacturingWorkspace", "ModuleWorkspace", "ModuleMetrics", "ProfessionalTabs", "EnterpriseApproverSelect", "CREATE_BOM", "CREATE_ROUTING", "CREATE_ORDER", "CREATE_SHORTAGE_PURCHASE", "CONSUME_MATERIAL", "RECEIVE_OUTPUT", "CREATE_QUALITY_CHECK", "CREATE_SCRAP", "ProfessionalHelp"], "professional Manufacturing workspace");
for (const code of moduleCodes) check(workspace.includes(code), `Workspace must expose focus ${code}`);
includesAll(modulePage, ["EnterpriseManufacturingWorkspace", "MANUFACTURING_MODULE_CODES.includes", "resolveEnterpriseModuleCapabilities"], "canonical module page routing");

const aiCodes = [
  "ERP_MANUFACTURING_OVERVIEW_READ",
  "ERP_BOM_READ",
  "ERP_PRODUCTION_ORDERS_READ",
  "ERP_PRODUCTION_ROUTINGS_READ",
  "ERP_WORK_CENTERS_READ",
  "ERP_MATERIAL_REQUIREMENTS_READ",
  "ERP_PRODUCTION_EXECUTION_READ",
  "ERP_PRODUCTION_QUALITY_READ",
  "ERP_PRODUCTION_SCRAP_READ",
  "ERP_PRODUCTION_REPORTS_READ",
];
for (const code of aiCodes) check(aiContract.includes(code), `AI Manufacturing contract missing ${code}`);
includesAll(aiContract, ['allowedSectorCodes: ["MANUFACTURING"]', 'allowedAssistantCodes: ["ENTERPRISE_GENERAL"]', 'mode: "READ"', 'requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"]'], "Manufacturing AI authorization contract");
excludesAll(aiContract, ['mode: "MUTATE"', 'mode: "SENSITIVE_MUTATE"'], "Manufacturing AI must remain read-only");
includesAll(aiExecutor, ["getManufacturingAccess", "organizationId", "enterpriseProductionOrder", "enterpriseProductionMaterialRequirement", "enterpriseProductionExecution", "enterpriseProductionQualityCheck", "enterpriseProductionScrap"], "Manufacturing AI tenant-scoped executor");
includesAll(aiRegistry, ["MANUFACTURING_AI_TOOL_DEFINITIONS", "...MANUFACTURING_AI_TOOL_DEFINITIONS"], "AI registry wiring");
includesAll(aiSchemas, ["MANUFACTURING_AI_TOOL_INPUT_SCHEMAS", "MANUFACTURING_AI_TOOL_OUTPUT_SCHEMAS"], "AI schema wiring");
includesAll(aiExecutors, ["MANUFACTURING_AI_TOOL_EXECUTORS", "...MANUFACTURING_AI_TOOL_EXECUTORS"], "AI executor wiring");
includesAll(aiAgent, ["MANUFACTURING_AI_TOOL_DESCRIPTIONS", "...MANUFACTURING_AI_TOOL_DESCRIPTIONS"], "AI agent descriptions");

includesAll(docs, ["Catalog", "Inventory", "Procurement", "EnterpriseEmployee", "EnterpriseTimesheetEntry", "EnterpriseAsset", "TAILORING_APPAREL"], "Manufacturing architecture documentation");
check(regression.includes("qa-606-manufacturing-core.mjs"), "Manufacturing QA must remain wired into canonical regression");

if (failures.length) {
  console.error(`qa-606-manufacturing-core: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("qa-606-manufacturing-core: OK");