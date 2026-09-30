import fs from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => fs.readFileSync(path, "utf8");

const sections = read("lib/enterprise/finance-navigation-sections.ts");
const page = read("app/enterprise-modules/page.tsx");
const financeRegistry = JSON.parse(read("lib/enterprise/module-registry-finance.json"));
const commonRegistry = JSON.parse(read("lib/enterprise/module-registry-data.json"));
const retailRegistry = JSON.parse(read("lib/enterprise/module-registry-retail.json"));

for (const token of [
  '"FINANCE_OVERVIEW", "FINANCE_BUDGETS"',
  '"FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS"',
  '"FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"',
  '"FINANCE_ACCOUNTING"',
  '"FINANCE_TAX"',
  '"FINANCE_CLOSE"',
  '"FINANCE_STATEMENTS"',
  '"FINANCE_ASSETS"',
  '"FINANCE_INVENTORY"',
  '"REPORTS"',
  'return "FINANCE_SECTOR"',
]) {
  if (!sections.includes(token)) fail(`finance navigation sections missing contract token: ${token}`);
}

for (const token of [
  "getEnterpriseNavigationModules(organizationId, user.id, user.locale)",
  'groupModules[0]?.navigationGroup === "FINANCE"',
  "FINANCE_NAVIGATION_SECTIONS.map",
  "getFinanceNavigationSectionCode(enterpriseModule.code)",
  "sectionModules.length",
]) {
  if (!page.includes(token)) fail(`enterprise modules hub missing safe Finance grouping token: ${token}`);
}

const expectedCommon = new Set([
  ...financeRegistry.modules.map((item) => item.code),
  "FINANCE_BUDGETS",
  "REPORTS",
]);
const declared = new Set();
const arrayMatches = [...sections.matchAll(/moduleCodes:\s*\[([^\]]*)\]/gs)];
for (const match of arrayMatches) {
  for (const codeMatch of match[1].matchAll(/"([A-Z0-9_]+)"/g)) declared.add(codeMatch[1]);
}

for (const code of expectedCommon) {
  if (!declared.has(code)) fail(`common Finance module is not explicitly assigned to a Finance section: ${code}`);
}

const duplicates = [...declared].filter((code) => {
  const occurrences = [...sections.matchAll(new RegExp(`"${code}"`, "g"))].length;
  return occurrences > 1;
});
if (duplicates.length) fail(`Finance navigation module duplicated across section declarations: ${duplicates.join(", ")}`);

const reports = commonRegistry.modules.find((item) => item.code === "REPORTS");
if (!reports || reports.domain !== "ANALYTICS") fail("REPORTS domain contract changed unexpectedly");

for (const code of ["MOBILE_MONEY_AGENCY", "RETAIL_DAILY_CLOSE"]) {
  const item = retailRegistry.modules.find((module) => module.code === code);
  if (!item || item.navigationGroup !== "FINANCE") fail(`Retail Finance extension contract missing: ${code}`);
  if (declared.has(code)) fail(`sector extension must use FINANCE_SECTOR fallback instead of a common Finance section: ${code}`);
}

if (failures.length) {
  console.error("FAIL #738 Finance navigation sections:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("PASS #738 Finance navigation sections are ordered, deduplicated and preserve server-side filtering.");
