import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const has = (content, token, message) => check(content.includes(token), message);
const lacks = (content, token, message) => check(!content.includes(token), message);

const businessContext = read("lib/enterprise/business-context.ts");
has(businessContext, 'select: { timezone: true }', "Business context must resolve the organization timezone.");
has(businessContext, 'select: { functionalCurrencyCode: true }', "Business context must resolve the canonical Finance functional currency.");
has(businessContext, 'formatToParts(at)', "Business date must be formatted in the organization timezone.");
has(businessContext, 'ENTERPRISE_CURRENCY_CONFIGURATION_REQUIRED', "Missing functional currency must fail closed with a stable code.");
has(businessContext, 'ORGANIZATION_TIMEZONE_INVALID', "Invalid organization timezone must fail closed.");

for (const path of [
  "lib/enterprise/procurement/purchase-service.ts",
  "lib/enterprise/finance/budget-service.ts",
  "lib/enterprise/finance/expense-service.ts",
  "lib/enterprise/finance/report-service.ts",
  "lib/enterprise/manufacturing/shared.ts",
  "lib/enterprise/gaming/reports.ts",
  "lib/enterprise/gaming/tournaments.ts",
]) {
  const content = read(path);
  lacks(content, 'new Date().toISOString().slice(0, 10)', `${path} must not derive a business reference date from UTC.`);
}

const financeValidators = read("lib/enterprise/finance/validators.ts");
const procurementValidators = read("lib/enterprise/procurement/validators.ts");
const manufacturingValidators = read("lib/enterprise/manufacturing/validators.ts");
lacks(financeValidators, 'currency: currency.default("USD")', "Finance budget currency must not silently default to USD.");
lacks(procurementValidators, '.regex(/^[A-Z]{3}$/).default("USD")', "Procurement currency must not silently default to USD.");
lacks(manufacturingValidators, '.regex(/^[A-Z]{3}$/).default("USD")', "Manufacturing shortage currency must not silently default to USD.");

const dispatcher = read("lib/enterprise/core-v2/dispatcher.ts");
lacks(dispatcher, 'currency: data.currency || "USD"', "Core dispatcher must not manufacture an USD purchase currency.");
has(dispatcher, "requireEnterpriseFunctionalCurrency", "Core dispatcher must resolve the canonical functional currency when legacy input omits one.");

const expense = read("lib/enterprise/finance/expense-service.ts");
lacks(expense, 'budgetLine?.budget.currency || "USD"', "Expense creation must not silently fall back to USD.");
has(expense, "requireEnterpriseFunctionalCurrency", "Expense creation must use the canonical functional currency only as an explicit fallback.");

const invoiceUi = read("components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix.tsx");
lacks(invoiceUi, 'defaultValue="USD"', "Active invoice UI must not suggest arbitrary USD.");
lacks(invoiceUi, 'form.get("currencyCode") || "USD"', "Active invoice mutation must not inject arbitrary USD.");
has(invoiceUi, "businessContext?.businessDate", "Active invoice UI must use the organization business date.");
has(invoiceUi, "businessContext?.functionalCurrencyCode", "Active invoice UI must use the organization functional currency.");

const paymentUi = read("components/enterprise/professional/enterprise-finance-payments-workspace-hotfix.tsx");
lacks(paymentUi, 'useState("USD")', "Active payment UI must not initialize arbitrary USD.");
lacks(paymentUi, 'setCurrencyCode("USD")', "Active payment UI must not reset to arbitrary USD.");
has(paymentUi, "businessContext?.businessDate", "Active payment UI must use the organization business date.");
has(paymentUi, "businessContext?.functionalCurrencyCode", "Active payment UI must use the organization functional currency.");

for (const path of [
  "components/enterprise/professional/enterprise-human-resources-workspace.tsx",
  "components/enterprise/professional/enterprise-employees-identity-workspace.tsx",
  "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx",
]) {
  lacks(read(path), 'lookups.currencies.length ? lookups.currencies : ["USD"]', `${path} must not fabricate an HR/payroll currency option.`);
}

const purchasesUi = read("components/enterprise/core-v2/enterprise-purchases-workspace.tsx");
lacks(purchasesUi, 'formTarget?.currency || "USD"', "Purchase form must require an explicit currency instead of defaulting USD.");

const projectsUi = read("components/enterprise/professional/enterprise-projects-services-workspace.tsx");
lacks(projectsUi, 'defaultValue="USD"', "Project form must not inject USD.");
has(projectsUi, "businessContext?.functionalCurrencyCode", "Project form must derive its suggested currency from tenant context.");

const manufacturingUi = read("components/enterprise/manufacturing/enterprise-manufacturing-workspace.tsx");
lacks(manufacturingUi, 'form.get("currency") || "USD"', "Manufacturing shortage purchase must not inject USD.");
has(manufacturingUi, "references.functionalCurrencyCode", "Manufacturing shortage purchase must use canonical tenant currency.");

const route = read("app/api/enterprise/[organizationId]/business-context/route.ts");
has(route, 'session.activeOrganizationId !== organizationId', "Business context endpoint must be scoped to the active organization.");
has(route, "organizationMember.findFirst", "Business context endpoint must require active membership.");

if (failures.length) {
  console.error("Hotfix #666 ERP Data Safety QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hotfix #666 ERP Data Safety QA passed.");
