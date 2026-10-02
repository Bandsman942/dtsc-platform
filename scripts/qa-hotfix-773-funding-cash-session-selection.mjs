import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const lookup = read("app/api/enterprise/[organizationId]/treasury-lookups/route.ts");
for (const token of [
  'kind === "cash-session"',
  "organizationId,",
  "financialAccountId: parentId",
  'status: "OPEN"',
  'number: { contains: search, mode: "insensitive" }',
]) check(lookup.includes(token), `cash-session lookup contract missing: ${token}`);

const selector = read("components/enterprise/core-v2/finance-reference-select.tsx");
for (const token of [
  "emptyStateLabel",
  "autoSelectSingle",
  "!search.trim() && mappedItems.length === 1",
  "onOptionChangeRef",
  "items.length === 0",
]) check(selector.includes(token), `reference selector contract missing: ${token}`);

const fundingPanel = read("components/enterprise/professional/enterprise-finance-funding-panel.tsx");
for (const token of [
  'kind="cash-session"',
  'emptyLabel={t("cashSessionSelect")}',
  'emptyStateLabel={t("cashSessionEmpty")}',
  "autoSelectSingle",
]) check(fundingPanel.includes(token), `funding cash-session UX missing: ${token}`);

const i18n = read("lib/i18n/enterprise-treasury.ts");
for (const token of [
  "cashSessionSelect",
  "Sélectionner une session de caisse ouverte…",
  "Select an open cash session…",
  "Aucune session de caisse ouverte sur ce compte.",
  "No open cash session is available for this account.",
]) check(i18n.includes(token), `cash-session i18n missing: ${token}`);

const service = read("lib/enterprise/accounting/funding-service.ts");
for (const token of [
  "requestedCashSessionId",
  "financialAccountId,",
  'status: "OPEN"',
  "FUNDING_CASH_SESSION_INVALID",
  "FUNDING_CASH_SESSION_AMBIGUOUS",
]) check(service.includes(token), `funding backend revalidation missing: ${token}`);

const packageJson = JSON.parse(read("package.json"));
check(
  String(packageJson.scripts?.["qa:regression"] || "").includes("qa-hotfix-773-funding-cash-session-selection.mjs"),
  "qa:regression must include hotfix #773",
);

if (failures.length) {
  console.error("Hotfix #773 funding cash-session QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("PASS #773 funding cash-session selection keeps exact-account tenant scoping and truthful selector states.");
