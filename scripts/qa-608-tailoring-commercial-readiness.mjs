import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const check = (condition, message) => { if (!condition) failures.push(message); };
const has = (file, token, message = `${file} missing ${token}`) => check(read(file).includes(token), message);

const onboarding = "lib/enterprise/tailoring/onboarding.ts";
const onboardingRoute = "app/api/enterprise/[organizationId]/tailoring/onboarding/route.ts";
const readinessUi = "components/enterprise/tailoring/tailoring-commercial-readiness.tsx";
const tailoringPage = "app/enterprise-tailoring/[moduleCode]/page.tsx";
const preview = "lib/enterprise/tailoring/template-preview.ts";
const adminPreviewRoute = "app/api/admin/sector-templates/route.ts";
const aiRegistry = "lib/ai/tool-registry.ts";
const aiSchemas = "lib/ai/tools/schemas.ts";
const aiExecutors = "lib/ai/tools/executors/index.ts";
const agentTools = "lib/ai/agent/tools.ts";
const manufacturingActions = "lib/ai/tools/manufacturing-action-contract.ts";
const tailoringActions = "lib/ai/tools/tailoring-action-contract.ts";
const readinessRegistry = "lib/enterprise/sector-onboarding-readiness.json";
const migration = "prisma/migrations/20260910174000_tailoring_commercial_readiness/migration.sql";

for (const file of [onboarding, onboardingRoute, readinessUi, tailoringPage, preview, manufacturingActions, tailoringActions, migration, "docs/user-guides/TAILORING_APPAREL_FR.md", "docs/user-guides/TAILORING_APPAREL_EN.md"]) {
  check(exists(file), `#608 required file missing: ${file}`);
}

for (const step of ["IDENTITY", "SITES_WAREHOUSES", "TEAM", "CATALOG", "INITIAL_STOCK", "FINANCE", "PRODUCTION", "TAILORING_CONFIGURATION"]) {
  has(onboarding, `\"${step}\"`, `Tailoring onboarding step missing ${step}`);
}
for (const canonicalSource of ["enterpriseSite", "enterpriseWarehouse", "organizationMember", "enterpriseEmployee", "enterpriseCatalogItem", "enterpriseInventoryItem", "enterpriseInventoryBalance", "resolveEnterpriseFinanceReadiness", "enterpriseManufacturingConfiguration", "enterpriseBillOfMaterial", "enterpriseManufacturingRouting", "enterpriseTailoringConfiguration"]) {
  has(onboarding, canonicalSource, `Tailoring readiness must reuse canonical source ${canonicalSource}`);
}
for (const forbiddenCreate of ["enterpriseSite.create", "enterpriseWarehouse.create", "enterpriseCatalogItem.create", "enterpriseInventoryItem.create", "enterpriseInventoryBalance.create", "enterpriseFinancialAccount.create"]) {
  check(!read(onboarding).includes(forbiddenCreate), `Onboarding must not create common ERP data: ${forbiddenCreate}`);
}
for (const businessMode of ["SUR_MESURE", "PRET_A_PORTER", "MIXTE", "MADE_TO_MEASURE", "READY_TO_WEAR", "MIXED"]) has(onboarding, businessMode);
has(onboarding, "revision: { increment: 1 }", "Onboarding must keep optimistic revisions");
has(onboardingRoute, 'action: "manage"', "Onboarding must require manage access");
has(onboardingRoute, "ENTERPRISE_ADMIN_ROLES", "Onboarding must be tenant-admin only");
has(onboardingRoute, "mutate: true", "Onboarding POST must use same-origin/rate-limited mutation authorization");
has(onboardingRoute, "writeAuditLog", "Onboarding mutations must be audited");

for (const marker of ["Mise en service Couture", "Tailoring setup", "/tailoring/onboarding", "8", "SUR_MESURE", "PRET_A_PORTER", "MIXTE"]) has(readinessUi, marker);
has(tailoringPage, "TailoringCommercialReadiness", "Tailoring overview route must render commercial readiness");
has(tailoringPage, 'canonicalModuleCode === "TAILORING_OVERVIEW"', "Tailoring readiness must only mount on the overview module");

for (const layer of ["ERP_COMMON", "MANUFACTURING_CORE", "TAILORING_APPAREL"]) has(preview, layer, `Three-layer DTSC preview missing ${layer}`);
has(adminPreviewRoute, "buildTailoringTemplateLayers", "Admin sector preview must build Tailoring three-layer metadata");
has(adminPreviewRoute, "tailoringLayerSummaryModules", "Admin sector preview must expose Tailoring layer summaries without tenant data");
check(!read(preview).includes("organizationId"), "DTSC template preview must not read tenant organization data");

for (const code of ["ERP_MANUFACTURING_ORDER_SUBMIT", "ERP_TAILORING_FITTING_COMPLETE", "ERP_TAILORING_ALTERATION_UPDATE", "ERP_TAILORING_FINISHING_UPDATE"]) {
  check(read(aiRegistry).includes(code) || read(manufacturingActions).includes(code) || read(tailoringActions).includes(code), `AI action missing ${code}`);
  has(agentTools, code.startsWith("ERP_MANUFACTURING") ? "MANUFACTURING_AI_ACTION_DESCRIPTIONS" : "TAILORING_AI_ACTION_DESCRIPTIONS", `Agent descriptions missing action family for ${code}`);
}
for (const marker of ["MANUFACTURING_AI_ACTION_INPUT_SCHEMAS", "MANUFACTURING_AI_ACTION_OUTPUT_SCHEMAS", "TAILORING_AI_ACTION_INPUT_SCHEMAS", "TAILORING_AI_ACTION_OUTPUT_SCHEMAS"]) {
  has(aiSchemas, marker, `AI schemas must register action schema family ${marker}`);
}
for (const contract of [manufacturingActions, tailoringActions]) {
  has(contract, "requiresConfirmation: true", `${contract} mutations must require structural confirmation`);
  has(contract, "idempotent: true", `${contract} mutations must be idempotent`);
  has(contract, 'auditLevel: "SENSITIVE"', `${contract} actions must be sensitively audited`);
  check(!read(contract).includes('requiresConfirmation: false'), `${contract} must not define unconfirmed mutations`);
}
has(aiExecutors, "MANUFACTURING_AI_ACTION_EXECUTORS", "Manufacturing action executors must be registered");
has(aiExecutors, "TAILORING_AI_ACTION_EXECUTORS", "Tailoring action executors must be registered");

const readiness = JSON.parse(read(readinessRegistry));
const profile = readiness.profiles.find((item) => item.sectorCode === "MANUFACTURING" && item.businessProfileCode === "TAILORING_APPAREL");
check(Boolean(profile), "Commercial readiness registry must include MANUFACTURING -> TAILORING_APPAREL");
check(profile?.commercializationStatus === "COMMERCIAL_READY", "Tailoring must be COMMERCIAL_READY after CI_PROVEN + OWNER_E2E");
check(profile?.releaseCriteria?.includes("OWNER_END_TO_END_ACCEPTANCE"), "Tailoring promotion must require owner E2E");
check(profile?.releaseCriteria?.includes("NO_COMMON_ERP_DUPLICATION"), "Tailoring readiness must enforce canonical ERP reuse");

for (const guide of ["docs/user-guides/TAILORING_APPAREL_FR.md", "docs/user-guides/TAILORING_APPAREL_EN.md"]) {
  has(guide, "COMMERCIAL_READY", `${guide} must explain commercialization states`);
  has(guide, "Tool Gateway", `${guide} must document controlled AI actions`);
}

const migrationSource = read(migration);
for (const marker of ["EnterpriseTailoringOnboardingRun", "organizationId", "revision", "readinessJson"]) check(migrationSource.includes(marker), `#608 migration missing ${marker}`);
for (const destructive of ["DROP TABLE", "DROP COLUMN", "TRUNCATE"]) check(!migrationSource.includes(destructive), `#608 migration must stay additive: ${destructive}`);

if (failures.length) {
  console.error(`FAIL #608 Tailoring commercial readiness QA (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PASS #608 Tailoring commercial readiness QA");
