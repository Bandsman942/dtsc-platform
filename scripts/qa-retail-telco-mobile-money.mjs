import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const registry = JSON.parse(read("lib/enterprise/module-registry-retail.json"));
const expectedCodes = ["RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"];
const definitions = new Map(registry.modules.map((module) => [module.code, module]));

for (const code of expectedCodes) {
  const definition = definitions.get(code);
  check(Boolean(definition), `Missing retail registry definition: ${code}`);
  if (!definition) continue;
  check(definition.implementationStatus === "ACTIVE", `${code} must be ACTIVE`);
  check(definition.routeKind === "DEDICATED_CORE", `${code} must use DEDICATED_CORE`);
  check(definition.minimumPlan === "BUSINESS", `${code} must require BUSINESS`);
  check(Array.isArray(definition.applicableSectors) && definition.applicableSectors.includes("COMMERCE_RETAIL"), `${code} must be restricted to COMMERCE_RETAIL`);
  check(definition.accessPolicy === "POSITION_PERMISSION", `${code} must use POSITION_PERMISSION`);
  check(definition.qaContract === "enterprise-retail-telco-mobile-money", `${code} must expose the Retail QA contract`);
}
check(!definitions.get("RETAIL_POS")?.legacyCodes?.includes("SALES"), "Legacy SALES must not become an alias of RETAIL_POS");

const moduleRegistry = read("lib/enterprise/module-registry.ts");
check(moduleRegistry.includes("module-registry-retail.json"), "Canonical registry must merge the Retail registry");
check(moduleRegistry.includes("...retailRegistryData.modules"), "Retail definitions must be appended to the canonical registry");

const prismaSchema = read("prisma/enterprise-retail.prisma");
for (const model of [
  "EnterpriseRetailConfiguration",
  "EnterpriseRetailProvider",
  "EnterpriseRetailSale",
  "EnterpriseRetailSaleLine",
  "EnterpriseRetailTender",
  "EnterpriseMobileMoneyTransaction",
  "EnterpriseTelcoTopup",
  "EnterpriseRetailDailyClose",
  "EnterpriseRetailDailyCloseLine",
]) check(prismaSchema.includes(`model ${model}`), `Missing Prisma model ${model}`);
check(prismaSchema.includes("idempotencyKey"), "Retail write models must be idempotent");

const service = read("lib/enterprise/retail/service.ts");
check(service.includes('movementType: "SALE_FULFILLMENT"'), "POS must use SALE_FULFILLMENT inventory movement");
check(service.includes('movementType: "RETURN_IN"'), "POS reversal must use RETURN_IN inventory movement");
check(service.includes("enterpriseTreasuryTransaction.create"), "Retail settlement must feed the common treasury journal");
check(service.includes("enterpriseCashMovement.create"), "Cash settlement must feed the common cash movement journal");
check(service.includes("EnterpriseCashSession"), "Daily close must lock/use the common cash session");
check(service.includes("PENDING_VALIDATION"), "Daily close must require validation");
check(service.includes("RETAIL_CLOSE_SELF_VALIDATION_FORBIDDEN"), "Daily close must forbid self validation");
check(service.includes("Prisma.TransactionIsolationLevel.Serializable"), "Sensitive Retail operations must use serializable transactions");
check(!service.includes("EnterpriseCoreRecord"), "Retail must never write EnterpriseCoreRecord");

const schemas = read("lib/enterprise/retail/schemas.ts");
check(schemas.includes("RETAIL_TENDER_METHODS"), "POS tender methods must be schema validated");
check(schemas.includes("MOBILE_MONEY_TRANSACTION_TYPES"), "Mobile Money operation type must be schema validated");
check(schemas.includes("RETAIL_CLOSE_ACCOUNT_TYPES"), "Close account types must be schema validated");

const http = read("lib/enterprise/retail/http.ts");
for (const contract of ["getSession", "rateLimit", "isSameOriginRequest", "getEnterpriseCommonDomainAccess"]) check(http.includes(contract), `Retail API security contract missing ${contract}`);

for (const route of [
  "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  "app/api/enterprise/[organizationId]/retail/providers/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/[saleId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/route.ts",
  "app/api/enterprise/[organizationId]/retail/mobile-money/[transactionId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",
  "app/api/enterprise/[organizationId]/retail/telco-topups/[topupId]/reverse/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/route.ts",
  "app/api/enterprise/[organizationId]/retail/daily-close/[closeId]/decision/route.ts",
  "app/api/enterprise/[organizationId]/retail/cash-sessions/route.ts",
]) check(exists(route), `Missing Retail route ${route}`);

const workspace = read("components/enterprise/professional/enterprise-retail-operations-workspace.tsx");
for (const marker of ["ContextualUserGuide", "ModuleWorkspace", "RETAIL_POS", "MOBILE_MONEY_AGENCY", "TELCO_TOPUPS", "RETAIL_DAILY_CLOSE"]) check(workspace.includes(marker), `Retail workspace missing ${marker}`);

const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
for (const code of expectedCodes) check(guides.includes(`${code}:`), `Native user guide missing ${code}`);
check(guides.includes("2026-08-07"), "Retail guides must carry an explicit update date");

const migration = read("prisma/migrations/20260807050000_retail_telco_mobile_money/migration.sql");
for (const marker of [
  "RETAIL_TELCO_MOBILE_MONEY",
  "Commerce Retail — Télécom & Mobile Money",
  "MOBILE_MONEY_AGENT",
  "RETAIL_CONTROLLER",
  "MPESA",
  "ORANGE_MONEY",
  "AIRTEL_MONEY",
  "AFRIMONEY",
  "'PRODUCTS','SALES','CASH_REGISTER','STOCK','CUSTOMERS','SUPPLIERS','PURCHASE_ORDERS','INVENTORY','PROMOTIONS','SALES_REPORTS'",
]) check(migration.includes(marker), `Retail migration missing ${marker}`);
check(migration.includes('"permissionsJson" = EXCLUDED."permissionsJson"'), "Migration must backfill position RBAC");
check(migration.includes('"version" = 2'), "Commerce template v2 must be active");

const architecture = read("docs/ERP_RETAIL_TELCO_MOBILE_MONEY.md");
check(architecture.includes("PROMOTIONS"), "Architecture doc must explicitly state the legacy promotions decision");
check(architecture.includes("L’E2E métier réel"), "Architecture doc must not claim owner production E2E is already validated");

if (failures.length) {
  console.error("Retail Telco/Mobile Money QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Retail Telco/Mobile Money QA passed (${expectedCodes.length} canonical modules, ${registry.modules.length} registry definitions).`);
