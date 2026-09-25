import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const check = (condition, message) => checks.push({ condition: Boolean(condition), message });
const includesAll = (source, tokens) => tokens.every((token) => source.includes(token));

const clientOrganizations = read("components/admin/client-organizations-panel.tsx");
const moduleHub = read("app/modules/page.tsx");
const standardRegistry = read("lib/modules/standard-module-registry.ts");
const standardRegistryData = read("lib/modules/standard-module-registry-data.json");
const navigation = read("lib/enterprise/enterprise-navigation.ts");
const archetypes = read("lib/enterprise/workspace-archetypes.ts");
const subtypeRegistry = read("lib/enterprise/business-subtype-registry.ts");
const workspacePrimitives = read("components/workspace/module-workspace.tsx");
const professionalUi = read("components/enterprise/professional/professional-erp-ui.tsx");
const manufacturing = read("components/enterprise/manufacturing/enterprise-manufacturing-workspace.tsx");
const tailoring = read("components/enterprise/tailoring/enterprise-tailoring-workspace.tsx");
const retail = read("components/enterprise/professional/retail-workspace-shared.tsx");
const gamingStations = read("components/enterprise/gaming/enterprise-gaming-stations-workspace.tsx");
const sectorRouter = read("components/enterprise/enterprise-sector-module-workspace.tsx");
const aiRouter = read("app/enterprise-modules/[moduleCode]/page.tsx");
const aiBridge = read("components/enterprise/enterprise-ai-workspace-v2.tsx");

check(clientOrganizations.includes("filteredSectors.map((sector)"), "Administration DTSC renders every filtered active sector");
check(!clientOrganizations.includes("filteredSectors.slice("), "Administration DTSC has no arbitrary sector result cap");
check(includesAll(clientOrganizations, ["max-h-56", "overflow-y-auto", "/api/admin/sector-templates", "businessSubtypeOptions", 'name="businessSubtypeCode"', "ReferenceCombobox"]), "Sector picker remains bounded, scrollable and subtype-aware");
check(includesAll(subtypeRegistry, ['sectorCode: "MANUFACTURING"', 'code: "TAILORING_APPAREL"', 'sectorCode: "HOSPITALITY_EVENTS"', 'code: "GAMING_LOUNGE"', 'implementationStatus: "ACTIVE"']), "Manufacturing/Tailoring and Hospitality/Gaming subtype classifications remain active");

check(!moduleHub.includes("enterpriseSubgroups"), "Grouped module hub no longer builds a second ERP catalog");
check(!moduleHub.includes("ERP_${code}"), "Grouped module hub no longer injects ERP navigation groups");
check(includesAll(moduleHub, ["ENTERPRISE_MODULES_SUBSCRIPTION", "getEnterpriseNavigationModules", "enterpriseDestination", "redirect(enterpriseDestination.href)"]), "Grouped module hub keeps the canonical ERP catalog entry and authorized deep-link resolution");
check(includesAll(standardRegistry, ['definition.code === "ENTERPRISE_MODULES_SUBSCRIPTION"', '"Modules ERP"', '"ERP modules"']) && includesAll(standardRegistryData, ['"code": "ENTERPRISE_MODULES_SUBSCRIPTION"', '"routePath": "/enterprise-modules"']), "The ERP catalog entry has a single clear public label and canonical destination");

const archetypeNames = [
  "STANDARD_PROFESSIONAL_ERP",
  "INTEGRATED_BUSINESS_SUITE",
  "TRANSACTIONAL_WORKSPACE",
  "ADMINISTRATION_GOVERNANCE",
  "AI_IMMERSIVE",
];
check(archetypeNames.every((name) => archetypes.includes(`"${name}"`)), "All five canonical ERP workspace archetypes are declared");
check(includesAll(archetypes, ['definition.routeKind === "AI_SERVICE"', 'definition.routeKind === "ADMIN_SECTION"', 'definition.domain === "ADMINISTRATION"', "INTEGRATED_SUITE_CODES", "TRANSACTIONAL_CODES", 'return "STANDARD_PROFESSIONAL_ERP"']), "Workspace resolver is exhaustive with a professional default");
check(includesAll(archetypes, ["MANUFACTURING_OVERVIEW", "TAILORING_OVERVIEW", "RETAIL_POS", "MOBILE_MONEY_AGENCY", "GAMING_DASHBOARD", "GAMING_CHECKOUT"]), "Representative integrated and transactional modules are explicitly classified");
check(includesAll(navigation, ["EnterpriseWorkspaceArchetype", "getEnterpriseWorkspaceArchetype", "workspaceArchetype: getEnterpriseWorkspaceArchetype(definition)"]), "Authorized enterprise navigation exposes the canonical workspace archetype");

check(includesAll(workspacePrimitives, ["ModuleWorkspace", "ModuleHeader", "ModuleToolbar", "ModuleContent", "ModuleSection", "data-module-workspace", "data-responsive-scope"]), "Shared DTSC workspace primitives remain the shell contract");
check(includesAll(professionalUi, ["ProfessionalTabs", "ProfessionalSearch", "ProfessionalFormSection", "ProfessionalHelp", "useProfessionalCollection", "professionalMutation"]), "Professional ERP interaction primitives remain reusable across business modules");
check(includesAll(manufacturing, ["ModuleWorkspace", "ModuleMetrics", "ProfessionalTabs"]), "Manufacturing remains an integrated suite on shared workspace primitives");
check(includesAll(tailoring, ["ModuleWorkspace", "ModuleMetrics", "ProfessionalTabs"]), "Tailoring remains an integrated suite on shared workspace primitives");
check(includesAll(retail, ["ModuleWorkspace", "ModuleHeader", "ModuleToolbar", "ProfessionalTabs"]), "Retail remains a transactional workspace on shared primitives");
check(includesAll(gamingStations, ["ModuleWorkspace", "ModuleHeader", "ModuleToolbar", "ProfessionalTabs"]), "Gaming remains a transactional workspace on shared primitives");
check(includesAll(sectorRouter, ["EnterpriseSectorModuleWorkspace", "SECTOR_HEALTH", "SECTOR_PHARMACY", "ProfessionalHelp"]), "Health and Pharmacy keep dedicated business renderers inside the canonical sector router");
check(includesAll(aiRouter, ["AssistantImmersiveWorkspaceShell", "EnterpriseAiWorkspace", 'definition.routeKind === "AI_SERVICE"']) && includesAll(aiBridge, ["EnterpriseAiWorkspace", "enterprise-ai-workspace"]), "Enterprise AI remains the dedicated immersive archetype through its canonical workspace and compatibility bridge");

const failed = checks.filter((item) => !item.condition);
for (const item of checks) console.log(`${item.condition ? "PASS" : "FAIL"} ${item.message}`);
if (failed.length) {
  console.error(`\n${failed.length} hotfix #657 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} hotfix #657 checks passed.`);