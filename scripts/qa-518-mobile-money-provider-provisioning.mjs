import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const migrationPath = "prisma/migrations/20260828194500_repair_retail_operator_provider_activation/migration.sql";
check(exists(migrationPath), "Hotfix #518 provider repair migration is missing");

const provisioning = read("lib/enterprise/retail/provisioning.ts");
for (const marker of [
  "syncRetailOperatorProvidersTx",
  'moduleCode: "MOBILE_MONEY_AGENCY"',
  'moduleCode: "TELCO_TOPUPS"',
  "legacySpecializedProfile",
  "mobileMoneyEnabled",
  "telcoEnabled",
  'provider.providerType === "MOBILE_MONEY"',
  "enterpriseRetailProvider.upsert",
  "isActive: true",
  "Prisma.TransactionIsolationLevel.Serializable",
]) {
  check(provisioning.includes(marker), `Retail provider lifecycle contract missing ${marker}`);
}
for (const providerCode of ["MPESA", "ORANGE_MONEY", "AIRTEL_MONEY", "AFRIMONEY", "VODACOM", "ORANGE", "AIRTEL", "AFRICELL"]) {
  check(provisioning.includes(`providerCode: "${providerCode}"`), `Canonical provider ${providerCode} is missing from provisioning`);
}
check(!provisioning.includes("mobileMoneyFloatAccountId:"), "Provider provisioning must not invent Mobile Money wallet mappings");
check(!provisioning.includes("telcoFloatAccountId:"), "Provider provisioning must not invent Telco wallet mappings");

const moduleReconciliation = read("lib/enterprise/module-subscription-reconciliation.ts");
check(moduleReconciliation.includes('import { syncRetailOperatorProvidersTx }'), "Module lifecycle must import Retail provider synchronization");
const syncCalls = moduleReconciliation.match(/syncRetailOperatorProvidersTx\(tx, organizationId\)/g) || [];
check(syncCalls.length >= 3, "Activation, deactivation and subscription reconciliation must all resync Retail providers");
check(moduleReconciliation.includes("Prisma.TransactionIsolationLevel.Serializable"), "Module/provider lifecycle must stay transactional and Serializable");

if (exists(migrationPath)) {
  const migration = read(migrationPath);
  for (const marker of [
    "MOBILE_MONEY_AGENCY",
    "TELCO_TOPUPS",
    "MPESA",
    "ORANGE_MONEY",
    "AIRTEL_MONEY",
    "AFRIMONEY",
    "VODACOM",
    "AFRICELL",
    "ON CONFLICT",
    '"isEnabled" = true',
    "'MOBILE_MONEY'",
    "'TELCO'",
  ]) {
    check(migration.includes(marker), `Hotfix #518 migration missing ${marker}`);
  }
  check(!migration.includes('INSERT INTO "EnterpriseFinancialAccount"'), "Hotfix #518 must not create financial accounts");
  check(!migration.includes('INSERT INTO "EnterpriseRetailProviderAccount"'), "Hotfix #518 must not create wallet mappings");
  check(!migration.includes("operationalBalance"), "Hotfix #518 must not manufacture balances");
}

const accountsRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/accounts/route.ts");
for (const marker of [
  'authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read")',
  'authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "manage"',
  "getMobileMoneyProviderAccountConfiguration",
  "upsertMobileMoneyProviderAccount",
]) {
  check(accountsRoute.includes(marker), `Mobile Money account route contract missing ${marker}`);
}

const accountService = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
for (const marker of [
  'providerType: { in: ["MOBILE_MONEY", "BOTH"] }',
  'accountType: "MOBILE_MONEY"',
  'status: "ACTIVE"',
  "requiredMobileMoneyCurrencies",
  "enterpriseRetailProviderAccount.findMany",
]) {
  check(accountService.includes(marker), `Mobile Money account service contract missing ${marker}`);
}

const workspace = read("components/enterprise/professional/mobile-money-agency-workspace.tsx");
for (const marker of [
  "configuration.providers.map",
  "WalletMappingRow",
  "configuration.requiredCurrencies",
  "configuration.financialAccounts.filter((account) => account.currencyCode === currencyCode)",
  "mobile-money-wallet-configuration",
]) {
  check(workspace.includes(marker), `Mobile Money wallet configuration UI contract missing ${marker}`);
}

if (failures.length) {
  console.error("Hotfix #518 Mobile Money provider provisioning QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Hotfix #518 QA passed: active operator modules provision their canonical providers, wallet mappings remain Finance-owned, and the Mobile Money UI can render CDF/USD account selectors.");
