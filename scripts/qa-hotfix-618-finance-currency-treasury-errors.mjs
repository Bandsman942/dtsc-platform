import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (condition, message) => { if (condition) { console.error(`FAIL #618: ${message}`); process.exitCode = 1; } };
const hasAll = (source, tokens, label) => {
  for (const token of tokens) fail(!source.includes(token), `${label} doit contenir ${token}`);
};

const currencyService = read("lib/enterprise/accounting/currency-service.ts");
hasAll(currencyService, [
  "listEnterpriseCurrencies",
  'scope: "GLOBAL"',
  'scope: "ORGANIZATION"',
  "assertEnterpriseCurrencyActiveTx",
  "FINANCE_CURRENCY_INACTIVE",
  "FINANCE_CURRENCY_NOT_CONFIGURED",
  "FINANCE_CURRENCY_IN_USE",
  "enterpriseFinancialAccount.count",
  "enterpriseExchangeRate.count",
  "organizationId",
  'currencyChoices("fr")',
  "BUILT_IN_CURRENCY_CODES.has(code)",
  "builtin:${currency.code}",
], "service devise canonique");

const currencyRoute = read("app/api/enterprise/[organizationId]/currencies/route.ts");
hasAll(currencyRoute, [
  '"FINANCE_OVERVIEW", "view"',
  '"FINANCE_OVERVIEW", "manage"',
  "enterpriseCurrencyCreateSchema",
  "writeAuditLog",
  "listEnterpriseCurrencies",
], "API référentiel devise");

const currencyDetailRoute = read("app/api/enterprise/[organizationId]/currencies/[currencyId]/route.ts");
hasAll(currencyDetailRoute, ['"FINANCE_OVERVIEW", "manage"', "enterpriseCurrencyUpdateSchema", "updateEnterpriseCurrency", "writeAuditLog"], "API cycle de vie devise");

const treasuryLookups = read("app/api/enterprise/[organizationId]/treasury-lookups/route.ts");
hasAll(treasuryLookups, ["listEnterpriseCurrencies", 'kind === "currency"'], "lookup Trésorerie");
fail(treasuryLookups.includes("prisma.enterpriseCurrency.findMany"), "Trésorerie ne doit plus lire EnterpriseCurrency en parallèle du service canonique");

const accountingLookups = read("app/api/enterprise/[organizationId]/accounting-reference-options/route.ts");
hasAll(accountingLookups, ["listEnterpriseCurrencies", 'kind === "currency"'], "lookup Comptabilité");
fail(accountingLookups.includes("prisma.enterpriseCurrency.findMany"), "Comptabilité ne doit plus lire EnterpriseCurrency en parallèle du service canonique");

const configurationService = read("lib/enterprise/accounting/configuration-service.ts");
hasAll(configurationService, ["listEnterpriseCurrencies", "assertEnterpriseCurrencyActiveTx", "currencies: currencyOptions"], "configuration Finance");

const accountService = read("lib/enterprise/accounting/financial-account-service.ts");
hasAll(accountService, [
  "assertEnterpriseCurrencyActiveTx",
  "TREASURY_ACCOUNT_BALANCE_NOT_ZERO",
  "TREASURY_ACCOUNT_ACTIVE_CASH_SESSION",
  "TREASURY_ACCOUNT_PENDING_TRANSFER",
  "operationalBalance: existing.operationalBalance.toFixed()",
], "comptes Trésorerie");

const sharedMutation = read("components/enterprise/professional/finance-professional-workspace-shared.tsx");
hasAll(sharedMutation, ["FinanceApiError", "clientMessage", "details", "response.status", "body?.queued"], "contrat erreur mutation Finance");
fail(sharedMutation.includes("legacyFinanceMutation(endpoint, payload, method)"), "le bridge mutation ne doit plus jeter message/details backend");

const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
for (const code of [
  "TREASURY_ACCOUNT_BALANCE_NOT_ZERO",
  "TREASURY_ACCOUNT_ACTIVE_CASH_SESSION",
  "TREASURY_ACCOUNT_PENDING_TRANSFER",
  "TREASURY_ACCOUNT_CONFLICT",
  "FINANCE_CURRENCY_IN_USE",
  "FINANCE_CURRENCY_NOT_CONFIGURED",
]) {
  const occurrences = financeUi.split(code).length - 1;
  fail(occurrences < 2, `le message ${code} doit exister en FR et EN`);
}

const overview = read("components/enterprise/professional/enterprise-finance-overview-workspace.tsx");
hasAll(overview, [
  "/enterprise-modules/FINANCE_OVERVIEW/currencies",
  'name="functionalCurrencyCode"',
  'name="presentationCurrencyCode"',
  "currencyChoices",
  "NativeSelect",
], "Vue d’ensemble Finance");
fail(overview.includes('<Input name="functionalCurrencyCode"'), "la devise fonctionnelle ne doit plus être un texte libre");
fail(overview.includes('<Input name="presentationCurrencyCode"'), "la devise de présentation ne doit plus être un texte libre");

const registryWorkspace = read("components/enterprise/professional/enterprise-currencies-workspace.tsx");
hasAll(registryWorkspace, ["includeInactive=true", "currency.canManage", "currency.isInUse", "FinanceApiError".replace("FinanceApiError", "financeMutation"), "translateEnterpriseCurrency"], "workspace référentiel devises");

const exchangeRateService = read("lib/enterprise/accounting/exchange-rate-service.ts");
hasAll(exchangeRateService, ["listEnterpriseCurrencies", "assertEnterpriseCurrencyActiveTx"], "taux de change");
fail(exchangeRateService.includes("prisma.enterpriseCurrency.findMany"), "les taux de change doivent réutiliser la source canonique des devises");

if (!process.exitCode) console.log("PASS #618 — référentiel devises canonique et erreurs Trésorerie actionnables protégés.");
