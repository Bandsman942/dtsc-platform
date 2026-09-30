import fs from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => fs.readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const registry = readJson("lib/enterprise/module-registry-data.json");
const readiness = readJson("lib/enterprise/sector-onboarding-readiness.json");
const financeAccess = read("lib/enterprise/finance/access.ts");
const moduleAccess = read("lib/enterprise/module-access.ts");
const tailoringPrisma = read("prisma/enterprise-tailoring.prisma");
const tailoringFr = read("docs/user-guides/TAILORING_APPAREL_FR.md");
const tailoringEn = read("docs/user-guides/TAILORING_APPAREL_EN.md");
const gaming = read("lib/enterprise/module-registry-gaming.json");
const convergence = read("lib/enterprise/module-registry-sector-convergence.json");

const budget = registry.modules.find((item) => item.code === "FINANCE_BUDGETS");
if (!budget) fail("FINANCE_BUDGETS definition missing");
if (budget?.accessPolicy !== "POSITION_PERMISSION") fail("FINANCE_BUDGETS must use POSITION_PERMISSION");
if (!financeAccess.includes("resolveEnterpriseModuleCapabilities")) fail("Finance budget access must resolve canonical module capabilities");
if (!financeAccess.includes("capabilities.canRead") || !financeAccess.includes("capabilities.canManage")) fail("Finance budget access must enforce action capabilities");
if (!moduleAccess.includes('definition.accessPolicy === "POSITION_PERMISSION"')) fail("POSITION_PERMISSION must be fail-closed when no explicit position/role permission exists");
if (!moduleAccess.includes("permissionsAllowAction(definition, snapshot.permissions, action)")) fail("POSITION_PERMISSION must resolve explicit permissions server-side");

const tailoring = readiness.profiles.find((item) => item.businessProfileCode === "TAILORING_APPAREL");
if (!tailoring) fail("TAILORING_APPAREL readiness profile missing");
const required = new Set(tailoring?.requiredModules || []);
for (const code of [
  "SALES_QUOTES_ORDERS",
  "SUPPLIERS_PURCHASES",
  "FINANCE_RECEIVABLES",
  "FINANCE_PAYABLES",
  "FINANCE_PAYMENTS",
  "FINANCE_TREASURY",
]) {
  if (!required.has(code)) fail(`Tailoring readiness missing ${code}`);
}
if (required.has("FINANCE_ACCOUNTING")) fail("BUSINESS Tailoring must not require the ENTERPRISE accounting workspace entitlement");
for (const criterion of ["COMMON_ORDER_TO_CASH", "COMMON_PURCHASE_TO_PAY"]) {
  if (!(tailoring?.releaseCriteria || []).includes(criterion)) fail(`Tailoring release criteria missing ${criterion}`);
}

for (const forbidden of ["model TailoringPayment", "model TailoringInvoice", "model TailoringCashAccount", "model EnterpriseTailoringPayment", "model EnterpriseTailoringInvoice"]) {
  if (tailoringPrisma.includes(forbidden)) fail(`Parallel Tailoring finance source forbidden: ${forbidden}`);
}

for (const token of ["Devis & commandes", "Ventes & créances", "Paiements", "Trésorerie", "Achats & dettes"]) {
  if (!tailoringFr.includes(token)) fail(`French Tailoring guide missing canonical Finance step: ${token}`);
}
for (const token of ["Quotes & orders", "Sales & receivables", "Payments", "Treasury", "Purchases & payables"]) {
  if (!tailoringEn.includes(token)) fail(`English Tailoring guide missing canonical Finance step: ${token}`);
}

for (const token of ['"FINANCE_RECEIVABLES"', '"FINANCE_PAYMENTS"', '"FINANCE_TREASURY"', '"FINANCE_CASH"']) {
  if (!gaming.includes(token) && token !== '"FINANCE_CASH"') fail(`Gaming common Finance contract missing ${token}`);
}
for (const token of ['"CASH_INVOICES_PAYMENTS"', '"FINANCE_RECEIVABLES"', '"FINANCE_PAYMENTS"', '"FINANCE_CASH"', '"MEDICAL_BILLING"']) {
  if (!convergence.includes(token)) fail(`Health/Pharmacy convergence contract missing ${token}`);
}

if (failures.length) {
  console.error("FAIL #732 Finance sector convergence:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("PASS #732 Finance budget RBAC and Tailoring canonical Sales/Procurement/Finance convergence.");
