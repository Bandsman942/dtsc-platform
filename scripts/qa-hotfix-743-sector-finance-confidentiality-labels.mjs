import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => failures.push(message);

const health = read("lib/enterprise/sector-convergence/health-billing-service.ts");
const pharmacy = read("lib/enterprise/sector-convergence/pharmacy-finance-service.ts");
const tailoring = JSON.parse(read("lib/enterprise/module-registry-tailoring.json"));
const confidentiality = read("scripts/qa-sector-data-confidentiality-checks.mjs");
const mapping = read("docs/ERP_SECTOR_FINANCIAL_MAPPING.md");
const gaming = JSON.parse(read("lib/enterprise/module-registry-gaming.json"));
const convergence = JSON.parse(read("lib/enterprise/module-registry-sector-convergence.json"));
const gamingPrisma = read("prisma/enterprise-gaming.prisma");

const requireTokens = (source, tokens, label) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label}: missing ${token}`);
};

requireTokens(health, [
  "enterpriseCatalogItem.findMany",
  "catalogNameById",
  "archivedAt: null",
  "description: catalogNameById.get",
], "Health Finance projection");
if (health.includes("description: item.description")) {
  fail("Health Finance projection must never copy free-text medical invoice descriptions");
}

requireTokens(pharmacy, [
  "enterpriseCatalogItem.findMany",
  "catalogNameById",
  "archivedAt: null",
  "description: catalogNameById.get",
], "Pharmacy Finance projection");
if (pharmacy.includes("Pharmacy item ${line.productId}")) {
  fail("Pharmacy Finance invoice must not expose product UUIDs as labels");
}

for (const token of [
  "diagnosis:",
  "symptoms:",
  "historyOfPresentIllness:",
  "allergies:",
  "prescriptionText:",
  "resultValue:",
  "resultInterpretation:",
  "medicalDocumentContent:",
  "description: item.description",
]) {
  if (!confidentiality.includes(token)) fail(`Health confidentiality QA missing forbidden token ${token}`);
}

const tailoringByCode = new Map(tailoring.modules.map((item) => [item.code, item]));
for (const [code, integrations] of [
  ["TAILORING_OVERVIEW", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
  ["TAILORING_MATERIAL_PROFILES", ["FINANCE_INVENTORY"]],
  ["TAILORING_FINISHING", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
]) {
  const module = tailoringByCode.get(code);
  if (!module) {
    fail(`Tailoring registry missing ${code}`);
    continue;
  }
  for (const integration of integrations) {
    if (!module.recommendedIntegrations?.includes(integration)) {
      fail(`${code} must recommend canonical integration ${integration}`);
    }
  }
}

const gamingByCode = new Map(gaming.modules.map((item) => [item.code, item]));
for (const dependency of ["GAMING_SESSIONS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS", "FINANCE_TREASURY", "CATALOG"]) {
  if (!gamingByCode.get("GAMING_CHECKOUT")?.dependencies?.includes(dependency)) {
    fail(`Gaming checkout missing common dependency ${dependency}`);
  }
}
for (const forbidden of ["model GamingPayment", "model GamingCashAccount", "model GamingInvoice"]) {
  if (gamingPrisma.includes(forbidden)) fail(`Gaming must not recreate common Finance source: ${forbidden}`);
}

const convergenceByCode = new Map(convergence.overrides.map((item) => [item.code, item]));
for (const dependency of ["SALES_DISPENSATION", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS", "FINANCE_CASH"]) {
  if (!convergenceByCode.get("CASH_INVOICES_PAYMENTS")?.dependencies?.includes(dependency)) {
    fail(`Pharmacy cash/payment convergence missing ${dependency}`);
  }
}
if (!convergenceByCode.get("MEDICAL_BILLING")?.dependencies?.includes("FINANCE_RECEIVABLES")) {
  fail("Health billing must depend on common receivables");
}

for (const marker of [
  "### Gaming checkout and close",
  "### Tailoring / Manufacturing delivery-to-finance boundary",
  "### Retail / Shop",
  "## Health confidentiality boundary",
  "## Inverse symmetry",
  "runtime legacy incomplet, voir #728",
]) {
  if (!mapping.includes(marker)) fail(`Sector financial mapping missing ${marker}`);
}

if (failures.length) {
  console.error("FAIL #743 sector Finance confidentiality and canonical labels:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("PASS #743 Health/Pharmacy Finance labels, confidentiality and sector convergence contracts.");
