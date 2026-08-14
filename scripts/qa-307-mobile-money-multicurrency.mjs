import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const schema = read("prisma/enterprise-retail-mobile-money-multicurrency.prisma");
check(hasAll(schema, [
  "model EnterpriseRetailProviderAccount",
  "model EnterpriseMobileMoneyFxTransfer",
  "@@unique([organizationId, providerId, accountUse, currencyCode])",
  "sourceCurrencyCode",
  "targetCurrencyCode",
  "exchangeRateId",
  "idempotencyKey",
]), "Prisma must model one canonical Mobile Money wallet per operator/currency plus auditable FX transfers");

const migration = read("prisma/migrations/20260814101500_mobile_money_multicurrency_accounts/migration.sql");
check(hasAll(migration, [
  'CREATE TABLE "EnterpriseRetailProviderAccount"',
  'CREATE TABLE "EnterpriseMobileMoneyFxTransfer"',
  'p."mobileMoneyFloatAccountId"',
  'a."currencyCode"',
  "ON CONFLICT",
]), "The additive migration must backfill the legacy single wallet into the currency mapping without destroying it");
check(!migration.includes("DROP COLUMN") && !migration.includes("DROP TABLE"), "Issue #307 migration must remain additive");

const providerSchema = read("prisma/enterprise-retail.prisma");
check(providerSchema.includes("mobileMoneyFloatAccountId String?"), "Legacy mobileMoneyFloatAccountId must remain during the compatibility window");

const service = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
check(hasAll(service, [
  'const MOBILE_MONEY_FLOAT = "MOBILE_MONEY_FLOAT"',
  'return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : []',
  "resolveMobileMoneyFloatAccountTx",
  "organizationId_providerId_accountUse_currencyCode",
  'accountType: "MOBILE_MONEY"',
  "mappedCurrencies.size >= 2",
  "resolveExchangeRateDetails",
  "snapshotExchangeRate",
  "enterpriseMobileMoneyFxTransfer",
  "FOR UPDATE",
  "sourceResolved.account.operationalBalance",
  "operationalBalance: { decrement: resolved.sourceAmount }",
  "operationalBalance: { increment: resolved.targetAmount }",
  'transactionType: "MOBILE_MONEY_FX_TRANSFER"',
  'transactionType: "MOBILE_MONEY_FX_REVERSAL"',
]), "Canonical service must enforce DRC CDF/USD readiness, generic two-currency readiness, current Finance FX, locking, source-balance validation, atomic wallet effects, Treasury movements and reversal");
check(!service.includes("providerCode: input.targetProviderCode"), "FX transfers must never permit a second target operator");

const retailService = read("lib/enterprise/retail/service.ts");
check(retailService.includes("resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode)"), "Deposits/withdrawals must resolve float by operator + transaction currency on the server");
check(!retailService.includes("input.floatAccountId || provider.mobileMoneyFloatAccountId"), "Deposits/withdrawals must not trust a client-selected or legacy single float account");
check(hasAll(retailService, ["cashEffect", "floatEffect", "transaction.floatAccountId"]), "Existing cash/float effects and historical reversal account IDs must remain explicit");
check(hasAll(retailService, [
  "assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId)",
  "cashSessionId: cashSession.id",
]), "Each Mobile Money operation must be bound to the selected OPEN cash session for the matching cash account");

const treasuryService = read("lib/enterprise/accounting/treasury-service.ts");
check(hasAll(treasuryService, [
  "organizationId, financialAccountId: account.id, cashierUserId",
  'status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] }',
  "CASH_SESSION_ALREADY_ACTIVE",
]), "Cash opening must prevent duplicates only on the same cash account while allowing the same cashier to hold other account sessions concurrently");
check(hasAll(treasuryService, [
  "submitCashSessionClose",
  'status: "PENDING_VALIDATION"',
  "CASH_COUNT_TOTAL_MISMATCH",
  "CASH_DISCREPANCY_REASON_REQUIRED",
]), "End-of-day till closes must reuse the canonical counted close and independent validation workflow");
check(hasAll(treasuryService, [
  "validateCashSession",
  "assertIndependentActor",
  "CASH_SESSION_SELF_VALIDATION_FORBIDDEN",
  'const status = input.approve ? "CLOSED" : "REJECTED"',
]), "Cash approval must remain independent and preserve the canonical close/reject workflow");

const accounting = read("lib/enterprise/accounting/sector-adapters/retail-mobile-money.ts");
check(hasAll(accounting, [
  "buildRetailMobileMoneyPosting",
  "buildRetailMobileMoneyReversalPosting",
  "buildRetailMobileMoneyFxPosting",
  "buildRetailMobileMoneyFxReversalPosting",
  "ACCOUNT_ID:",
  'accountMappingKey: "SERVICE_REVENUE"',
  'journalType: "MOBILE_MONEY"',
]), "Mobile Money deposit/withdrawal, fee, FX and reversals must use the common accounting posting engine");

const constants = read("lib/enterprise/accounting/constants.ts");
const registry = read("lib/enterprise/accounting/posting-registry-final.ts");
const journals = read("lib/enterprise/accounting/journal-template-registry.ts");
for (const event of ["RETAIL_MOBILE_MONEY_POSTED", "RETAIL_MOBILE_MONEY_REVERSED", "RETAIL_MOBILE_MONEY_FX_POSTED", "RETAIL_MOBILE_MONEY_FX_REVERSED"]) {
  check(constants.includes(`"${event}"`), `Posting event ${event} must be part of the canonical posting contract`);
  check(registry.includes(`${event}:`), `Posting event ${event} must have a registered builder`);
  check(journals.includes(`"${event}"`), `Posting event ${event} must be routed to the recommended Mobile Money journal`);
}

const manualRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/route.ts");
const reverseRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/[transactionId]/reverse/route.ts");
const orchestration = read("lib/enterprise/retail/operator-orchestration.ts");
check(manualRoute.includes("finalizeMobileMoneyAccounting"), "Manual Mobile Money operations must finalize accounting");
check(reverseRoute.includes("finalizeMobileMoneyReversalAccounting"), "Mobile Money reversals must finalize accounting reversal");
check(orchestration.includes("finalizeMobileMoneyAccounting"), "Connected provider confirmation/reconciliation must converge on the same accounting finalizer");

const accountsRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/accounts/route.ts");
const fxRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/fx/route.ts");
const fxReverseRoute = read("app/api/enterprise/[organizationId]/retail/mobile-money/fx/[transferId]/reverse/route.ts");
const retailCashCloseRoute = read("app/api/enterprise/[organizationId]/retail/cash-sessions/[sessionId]/close/route.ts");
check(hasAll(accountsRoute, ['"MOBILE_MONEY_AGENCY", "read"', '"MOBILE_MONEY_AGENCY", "manage"', "mobileMoneyProviderAccountUpsertSchema"]), "Wallet mapping API must enforce read/manage access and schema validation");
check(hasAll(fxRoute, ['"MOBILE_MONEY_AGENCY", "read"', '"MOBILE_MONEY_AGENCY", "manage"', "mobileMoneyFxPreviewSchema", "mobileMoneyFxTransferSchema", "finalizeMobileMoneyFxAccounting"]), "FX preview/transfer API must enforce RBAC, validation and accounting");
check(hasAll(fxReverseRoute, ['"MOBILE_MONEY_AGENCY", "manage"', "mobileMoneyFxReverseSchema", "finalizeMobileMoneyFxReversalAccounting"]), "FX reversal API must enforce manage RBAC, validation and accounting reversal");
check(hasAll(retailCashCloseRoute, [
  '"MOBILE_MONEY_AGENCY", "submit"',
  "cashCloseSchema",
  "submitCashSessionClose",
  "ENTERPRISE_RETAIL_CASH_SESSION_SUBMITTED",
]), "Mobile Money agents must be able to submit each owned till close through Retail RBAC while reusing the Finance close engine");

const retailHttp = read("lib/enterprise/retail/http.ts");
check(hasAll(retailHttp, [
  "CASH_SESSION_ALREADY_ACTIVE",
  "CASH_SESSION_NOT_OWNED",
  "CASH_SESSION_CONFLICT",
  "CASH_COUNT_TOTAL_MISMATCH",
  "CASH_DISCREPANCY_REASON_REQUIRED",
  "ERROR_MESSAGES[error.code]",
]), "Retail cash-session errors must remain actionable instead of falling back to a generic accounting failure message");

const workspace = read("components/enterprise/professional/mobile-money-agency-workspace.tsx");
check(hasAll(workspace, [
  "Comptes Mobile Money par devise",
  "Mobile Money accounts by currency",
  "CDF et USD",
  "CDF and USD",
  "Operator wallet",
  "Transfert entre devises",
  "Currency transfer",
  "Calculer avec le taux courant",
  "Calculate with current rate",
  "mobile-money-wallet-configuration",
  "MobileMoneyCashSessionManager",
  "selectedCashSessionId",
  "cashSessions",
  "cashAccountId: activeCash.financialAccount.id",
  "transactionTill",
  "sm:grid-cols",
  "md:grid-cols",
  "lg:grid-cols",
  "bg-dtsc-surface",
  "border-dtsc-border",
]), "Mobile Money UX must expose one operator card with per-currency wallets, concurrent till switching, FX preview and responsive DTSC styling in FR/EN");
check(workspace.toLocaleLowerCase("fr").includes("wallet opérateur"), "French Mobile Money UX must describe the operator wallet in customer-facing language");
check(!workspace.includes("window.confirm"), "The #306 confirmation contract must not regress in the new Mobile Money workspace");
check(!workspace.includes("() => providers.filter"), "Eligible Mobile Money providers must not reintroduce an unstable providers useMemo dependency");

const cashManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
check(hasAll(cashManager, [
  "Mes caisses Mobile Money",
  "My Mobile Money tills",
  "CDF + USD",
  'aria-pressed={selected}',
  "openSessions",
  "pendingSessions",
  "availableAccounts",
  "DENOMINATIONS",
  "20000",
  "100",
  "expectedCurrentAmount",
  "countedTotal",
  "reasonRequired",
  `/retail/cash-sessions/${"${session.id}"}/close`,
  "Clôture soumise à l’approbation indépendante.",
  "Till close submitted for independent approval.",
  "focus-visible:ring-2",
  "active:scale-[0.99]",
]), "Mobile Money cash UX must support concurrent CDF/USD tills, one-tap selection, accessible responsive states and separate counted end-of-day submission");

const sharedWorkspace = read("components/enterprise/professional/retail-workspace-shared.tsx");
check(sharedWorkspace.includes('moduleCode !== "MOBILE_MONEY_AGENCY" ? <CashSessionBar'), "Mobile Money must hide the legacy single-till banner so the concurrent till selector remains the only operational cash context");

const page = read("app/enterprise-modules/retail-page.tsx");
check(page.includes("<MobileMoneyAgencyWorkspace"), "MOBILE_MONEY_AGENCY must use the specialized multi-currency workspace");

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
check(hasAll(dashboard, [
  "getMobileMoneyProviderAccountConfiguration",
  "providers.every((provider) => provider.ready)",
  "enterpriseCashSession.findMany",
  "cashSessionsRaw.map",
  "expectedCurrentAmount",
  "cashSessions,",
]), "Mobile Money readiness and dashboard must expose every active cashier till with an expected live balance without regressing provider readiness");

const domainDoc = read("docs/ERP_RETAIL_TELCO_MOBILE_MONEY.md");
check(hasAll(domainDoc, [
  "## Sessions de caisse",
  "plusieurs sessions `OPEN` en parallèle",
  "une caisse CDF et une caisse USD en RDC",
  "basculer en un toucher entre ses caisses",
  "Changer de caisse invalide tout brouillon de confirmation non confirmé",
  "chaque caisse `OPEN` est comptée et soumise séparément",
  "chaque caisse Mobile Money est comptée et soumise séparément en fin de journée",
  "cashier ne peut pas auto-valider sa clôture",
]), "Retail domain documentation must describe the concurrent Mobile Money till, switching and independent close workflow");

check(!fs.existsSync(path.join(root, ".github/workflows/tmp-307-codemod.yml")), "Temporary #307 codemod workflow must not remain in the branch");
check(!fs.existsSync(path.join(root, ".github/workflows/tmp-307-lint-polish.yml")), "Temporary #307 lint workflow must not remain in the branch");
check(!fs.existsSync(path.join(root, ".github/workflows/tmp-307-doc-sync.yml")), "Temporary #307 documentation workflow must not remain in the branch");
check(!fs.existsSync(path.join(root, "scripts/tmp-307-codemod.mjs")), "Temporary #307 codemod script must not remain in the branch");

if (failures.length) {
  console.error("Issue #307 Mobile Money multi-currency QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Issue #307 Mobile Money multi-currency QA passed: operator/currency wallets, concurrent CDF/USD tills, frictionless switching, separate end-of-day closes, DRC readiness, deposits/withdrawals, same-operator FX, Treasury/accounting, reversal, RBAC, documentation and professional FR/EN UX are guarded.");
