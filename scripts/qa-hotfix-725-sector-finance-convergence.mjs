import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`FAIL #725: ${message}`);
  process.exitCode = 1;
};
const check = (condition, message) => {
  if (!condition) fail(message);
};
const hasAll = (source, tokens) => tokens.every((token) => source.includes(token));

const tailoring = JSON.parse(read("lib/enterprise/module-registry-tailoring.json"));
const gaming = JSON.parse(read("lib/enterprise/module-registry-gaming.json"));
const convergence = JSON.parse(read("lib/enterprise/module-registry-sector-convergence.json"));
const health = read("lib/enterprise/sector-convergence/health-billing-service.ts");
const pharmacy = read("lib/enterprise/sector-convergence/pharmacy-finance-service.ts");
const confidentiality = read("scripts/qa-sector-data-confidentiality-checks.mjs");
const retail = read("lib/enterprise/retail/service.ts");
const mobileMoney = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
const mapping = read("docs/ERP_SECTOR_FINANCIAL_MAPPING.md");
const gamingPrisma = read("prisma/enterprise-gaming.prisma");

const tailoringByCode = new Map(tailoring.modules.map((item) => [item.code, item]));
for (const [code, integrations] of [
  ["TAILORING_OVERVIEW", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
  ["TAILORING_MATERIAL_PROFILES", ["FINANCE_INVENTORY"]],
  ["TAILORING_FINISHING", ["SALES_QUOTES_ORDERS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"]],
]) {
  const module = tailoringByCode.get(code);
  check(Boolean(module), `Tailoring registry missing ${code}`);
  for (const integration of integrations) {
    check(module?.recommendedIntegrations?.includes(integration), `${code} must recommend ${integration}`);
  }
}

const gamingByCode = new Map(gaming.modules.map((item) => [item.code, item]));
for (const dependency of ["GAMING_SESSIONS", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS", "FINANCE_TREASURY", "CATALOG"]) {
  check(gamingByCode.get("GAMING_CHECKOUT")?.dependencies?.includes(dependency), `Gaming checkout missing common dependency ${dependency}`);
}
for (const dependency of ["GAMING_CHECKOUT", "FINANCE_TREASURY", "FINANCE_CASH"]) {
  check(gamingByCode.get("GAMING_DAILY_CLOSE")?.dependencies?.includes(dependency), `Gaming daily close missing common dependency ${dependency}`);
}
for (const forbidden of ["model GamingPayment", "model GamingCashAccount", "model GamingInvoice"]) {
  check(!gamingPrisma.includes(forbidden), `Gaming must not recreate common Finance source: ${forbidden}`);
}

const convergenceByCode = new Map(convergence.overrides.map((item) => [item.code, item]));
for (const dependency of ["SALES_DISPENSATION", "FINANCE_RECEIVABLES", "FINANCE_PAYMENTS", "FINANCE_CASH"]) {
  check(convergenceByCode.get("CASH_INVOICES_PAYMENTS")?.dependencies?.includes(dependency), `Pharmacy cash/payment convergence missing ${dependency}`);
}
check(convergenceByCode.get("MEDICAL_BILLING")?.dependencies?.includes("FINANCE_RECEIVABLES"), "Health billing must depend on common receivables");

check(health.includes("catalogNameById") && health.includes("enterpriseCatalogItem.findMany"), "Health Finance projection must resolve controlled common Catalog labels");
check(!health.includes("description: item.description"), "Health Finance projection must never copy free-text medical invoice-line description");
for (const forbidden of ["diagnosis:", "symptoms:", "historyOfPresentIllness:", "allergies:", "prescriptionText:", "resultValue:", "resultInterpretation:"]) {
  check(confidentiality.includes(forbidden), `Health confidentiality QA must forbid ${forbidden}`);
}

check(pharmacy.includes("catalogNameById") && pharmacy.includes("enterpriseCatalogItem.findMany"), "Pharmacy Finance projection must resolve common Catalog labels");
check(!pharmacy.includes("description: `Pharmacy item ${line.productId}`"), "Pharmacy Finance invoice must not expose product UUIDs as business labels");

check(hasAll(retail, ["finalizeRetailSaleAccountingTx", "finalizeRetailSaleReversalAccountingTx"]), "Retail sale and reversal must use common accounting inverse functions");
check(hasAll(mobileMoney, ["MOBILE_MONEY_FX_REVERSAL", "operationalBalance: { increment:", "operationalBalance: { decrement:"]), "Mobile Money FX reversal must keep opposite common balance effects");

for (const marker of [
  "### Gaming checkout and close",
  "### Tailoring / Manufacturing delivery-to-finance boundary",
  "### Retail / Shop",
  "## Health confidentiality boundary",
  "## Inverse symmetry",
  "competing balance",
]) {
  check(mapping.includes(marker), `Sector financial mapping missing ${marker}`);
}

if (!process.exitCode) console.log("PASS #725 cross-sector Finance convergence, confidentiality and inverse contracts.");
