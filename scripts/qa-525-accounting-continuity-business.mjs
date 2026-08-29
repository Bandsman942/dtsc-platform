import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const readiness = read("lib/enterprise/accounting/finance-readiness-service.ts");
for (const marker of [
  "requiredMappingKeys?: readonly string[]",
  "requiredJournalTypes?: readonly string[]",
  "options.requiredMappingKeys ?? listRequiredPostingSemanticKeys()",
  "options.requiredJournalTypes ?? requiredJournalTypes()",
]) {
  check(readiness.includes(marker), `Event-scoped Finance readiness contract missing ${marker}`);
}

const configuration = read("lib/enterprise/accounting/configuration-service.ts");
for (const marker of [
  "ensureDefaultSystemAccountingBaselineTx",
  "requiredMappingKeys",
  "requiredJournalTypes",
  "missingMappings",
  "missingJournalTypes",
]) {
  check(configuration.includes(marker), `Finance configuration continuity contract missing ${marker}`);
}

const templateApplication = read("lib/enterprise/accounting/chart-template-application-service.ts");
for (const marker of [
  "ensureDefaultSystemAccountingBaselineTx",
  "getDefaultChartTemplate",
  'code: "DTSC-SYSTEM-OHADA"',
  'populateDraftChartTemplate(tx, organizationId, actorUserId, chart.id, template, "ACTIVE")',
  "postedEntries > 0",
]) {
  check(templateApplication.includes(marker), `System accounting baseline contract missing ${marker}`);
}

const posting = read("lib/enterprise/accounting/posting-service.ts");
for (const marker of [
  "postingSemanticRequirements",
  'line.accountMappingKey.startsWith("ACCOUNT_ID:")',
  "requiredMappingKeys: postingSemanticRequirements(document)",
  "requiredJournalTypes: [document.journalType]",
  "functionalBalanceMappings",
  "debitShortfall",
  "creditShortfall",
]) {
  check(posting.includes(marker), `Posting continuity contract missing ${marker}`);
}
check(!posting.includes("canUseModule("), "Internal accounting posting must not depend on Accounting module visibility entitlement");

const mobileMoneyAdapter = read("lib/enterprise/accounting/sector-adapters/retail-mobile-money.ts");
for (const marker of [
  'accountMappingKey: `ACCOUNT_ID:${source.target.ledgerAccountId}`',
  'accountMappingKey: `ACCOUNT_ID:${source.source.ledgerAccountId}`',
  'debitShortfall: "FX_LOSS"',
  'creditShortfall: "FX_GAIN"',
  "functionalBalanceMappings: FX_FUNCTIONAL_BALANCE_MAPPINGS",
]) {
  check(mobileMoneyAdapter.includes(marker), `Mobile Money FX posting contract missing ${marker}`);
}

const walletLedger = read("lib/enterprise/accounting/mobile-money-ledger-provisioning.ts");
for (const marker of [
  'mappingKey: "MOBILE_MONEY"',
  "resolveSemanticPostingAccount",
  "parentId: semanticParent.id",
  'accountSubtype: "MOBILE_MONEY"',
  "enterpriseFinancialAccount.update",
  "postedUsage > 0",
]) {
  check(walletLedger.includes(marker), `Mobile Money subledger provisioning contract missing ${marker}`);
}
check(!walletLedger.includes('"552"'), "Retail wallet subledger provisioning must not hardcode the OHADA 552 account number");

const mobileMoneyAccounting = read("lib/enterprise/retail/mobile-money-accounting.ts");
check(mobileMoneyAccounting.includes("ensureMobileMoneyFxLedgerMappings"), "FX accounting must prepare wallet subledgers before posting");

const financeModules = json("lib/enterprise/module-registry-finance.json").modules;
const retailModules = json("lib/enterprise/module-registry-retail.json").modules;
const accountingModule = financeModules.find((module) => module.code === "FINANCE_ACCOUNTING");
const treasuryModule = financeModules.find((module) => module.code === "FINANCE_TREASURY");
const mobileMoneyModule = retailModules.find((module) => module.code === "MOBILE_MONEY_AGENCY");
check(accountingModule?.minimumPlan === "ENTERPRISE", "FINANCE_ACCOUNTING must remain commercially gated to ENTERPRISE");
check(treasuryModule?.minimumPlan === "BUSINESS", "FINANCE_TREASURY must remain available to BUSINESS");
check(mobileMoneyModule?.minimumPlan === "BUSINESS", "MOBILE_MONEY_AGENCY must remain available to BUSINESS");

const syscohada = json("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json");
const semanticMappings = new Map(syscohada.semanticMappings.map((mapping) => [mapping.mappingKey, mapping.accountCode]));
check(semanticMappings.get("MOBILE_MONEY") === "552", "Default SYSCOHADA template must map MOBILE_MONEY to account 552");
check(semanticMappings.get("FX_LOSS") === "675", "Default SYSCOHADA template must map FX_LOSS to account 675");
check(semanticMappings.get("FX_GAIN") === "776", "Default SYSCOHADA template must map FX_GAIN to account 776");

if (failures.length) {
  console.error("Hotfix #525 accounting continuity QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Hotfix #525 QA passed: BUSINESS operational modules keep continuous internal accounting, event posting requires only consumed mappings/journals, SYSCOHADA stays canonical, and FINANCE_ACCOUNTING remains ENTERPRISE-only.");
