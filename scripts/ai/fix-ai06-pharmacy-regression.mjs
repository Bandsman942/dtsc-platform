import fs from "node:fs";

const path = "scripts/qa-regression-checks.mjs";
let source = fs.readFileSync(path, "utf8");

const variableAnchor = 'const enterpriseAiPharmacyTools = read("lib/enterprise-ai/pharmacy-tools.ts");\n';
const variableReplacement = `${variableAnchor}const enterpriseAiPharmacyToolData = read("lib/enterprise-ai/pharmacy-tool-data.ts");\n`;
if (!source.includes(variableAnchor)) throw new Error("PHARMACY_TOOL_VARIABLE_ANCHOR_NOT_FOUND");
if (!source.includes('const enterpriseAiPharmacyToolData = read("lib/enterprise-ai/pharmacy-tool-data.ts");')) {
  source = source.replace(variableAnchor, variableReplacement);
}

const oldCheck = `check(\n  "Enterprise AI PHARMACY: CAG, outils lecture et absence de mutation métier directe",\n  containsAll(enterpriseAiContext, ["Contexte secteur PHARMACY", "Respecter FEFO", "ne prétends jamais avoir exécuté une action métier"])\n    && containsAll(enterpriseAiPharmacyTools, [\n      "pharmacy.dashboard.summary",\n      "pharmacy.stock.low",\n      "pharmacy.batches.expiring",\n      "pharmacy.alerts.open",\n      "pharmacy.sales.today",\n      "pharmacy.cash.sessions",\n      "pharmacy.purchases.open",\n      "pharmacy.quality.open",\n      "pharmacy.documents.summary",\n    ])\n    && !enterpriseAiPharmacyTools.includes(".create({")\n    && !enterpriseAiPharmacyTools.includes(".update({")\n    && !enterpriseAiPharmacyTools.includes(".delete({")\n);`;

const newCheck = `check(\n  "Enterprise AI PHARMACY: CAG, Tool Gateway lecture et absence de mutation métier directe",\n  containsAll(enterpriseAiContext, ["Contexte secteur PHARMACY", "Respecter FEFO", "ne prétends jamais avoir exécuté une action métier"])\n    && containsAll(enterpriseAiPharmacyTools, [\n      "executeAiTool",\n      "selectPharmacyReadToolCodes",\n      'session.activeContext !== "ORGANIZATION"',\n      "session.activeOrganizationId !== organizationId",\n    ])\n    && containsAll(enterpriseAiPharmacyToolData, [\n      "pharmacy.dashboard.summary",\n      "pharmacy.stock.low",\n      "pharmacy.batches.expiring",\n      "pharmacy.alerts.open",\n      "pharmacy.sales.today",\n      "pharmacy.cash.sessions",\n      "pharmacy.purchases.open",\n      "pharmacy.quality.open",\n      "pharmacy.documents.summary",\n      "organizationId",\n    ])\n    && !enterpriseAiPharmacyTools.includes(".create({")\n    && !enterpriseAiPharmacyTools.includes(".update({")\n    && !enterpriseAiPharmacyTools.includes(".delete({")\n    && !enterpriseAiPharmacyTools.includes(".upsert({")\n    && !enterpriseAiPharmacyToolData.includes(".create({")\n    && !enterpriseAiPharmacyToolData.includes(".update({")\n    && !enterpriseAiPharmacyToolData.includes(".delete({")\n    && !enterpriseAiPharmacyToolData.includes(".upsert({")\n);`;

if (!source.includes(oldCheck)) throw new Error("PHARMACY_REGRESSION_CHECK_ANCHOR_NOT_FOUND");
source = source.replace(oldCheck, newCheck);
fs.writeFileSync(path, source);
console.log("AI06 Pharmacy regression contract aligned with Tool Gateway");
