import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const page = read("app/enterprise-modules/retail-page.tsx");
const workspace = read("components/enterprise/professional/telco-topups-workspace.tsx");
const dashboardRoute = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
const accountsRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts");
const telcoService = read("lib/enterprise/retail/telco-multicurrency-service.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
const orchestration = read("lib/enterprise/retail/operator-orchestration.ts");
const frCopy = read("locales/retail-transaction-forms.fr.json");
const enCopy = read("locales/retail-transaction-forms.en.json");
const contributing = read("docs/CONTRIBUTING.md");

check(page.includes("TelcoTopupsWorkspace"), "TELCO_TOPUPS must route through the dedicated TelcoTopupsWorkspace");
check(!page.includes("RetailOperatorWorkspace"), "Routed Retail page must no longer fall back to the generic operator workspace for Telco");

check(hasAll(dashboardRoute, [
  'moduleCode === "TELCO_TOPUPS"',
  "telcoConfiguration: dashboard.telcoConfiguration",
  'item.providerType === "TELCO" || item.providerType === "BOTH"',
]), "Scoped TELCO_TOPUPS dashboard must preserve canonical configuration and TELCO/BOTH providers");

check(hasAll(accountsRoute, [
  '"TELCO_TOPUPS", "read"',
  '"TELCO_TOPUPS", "manage"',
  "telcoProviderAccountUpsertSchema",
  "upsertTelcoProviderAccount",
  "writeAuditLog",
]), "Telco Configuration API must keep read/manage RBAC, validation and audit");

check(hasAll(telcoService, [
  "enterpriseRetailProviderIntegration.findMany",
  "integrationMode",
  'executionMode: integrationModeByProviderId.get(provider.id) === "CONNECTED"',
  "organizationId_providerId_accountUse_currencyCode",
  'accountType: { in: ["MOBILE_MONEY", "CLEARING"] }',
]), "Canonical Telco configuration must expose safe execution mode and retain provider/currency account authority");
check(!telcoService.includes("credentialReference") && !telcoService.includes("webhookSecretReference"), "Telco configuration service must never expose provider credentials or webhook secrets");

for (const marker of [
  "RetailWorkspaceFrame",
  'moduleCode="TELCO_TOPUPS"',
  "includeConfigurationTab",
  "/retail/telco-topups/accounts",
  "TelcoConfigurationPanel",
  "MobileMoneyCashSessionManager",
  "selectedCashSessionId",
  "nonCashAccountId",
  "eligibleProviders",
  "selectedOperatorMapping",
  "executionMode",
  "manualExecution",
  "TelcoFieldErrors",
  "GuidedField",
  "formError(preciseError)",
  'presentation="editor"',
  'h-[96dvh]',
  "operatorFloatAccountId: null",
  "providerManual && status === \"SUCCESS\"",
  "providerManual && status === \"FAILED\"",
  "TelcoHistory",
  "reverseReason",
]) {
  check(workspace.includes(marker), `Dedicated Telco guided contract missing ${marker}`);
}
check(!workspace.includes("window.prompt"), "Routed Telco workspace must not use window.prompt");
check(workspace.includes("provider.executionMode === \"CONNECTED\"") || workspace.includes("selectedProvider?.executionMode === \"CONNECTED\""), "Connected Telco mode must be visible and conditional in the guided UI");
check(workspace.includes("mapping.financialAccountId !== tenderAccount?.id"), "Telco provider eligibility must avoid resolving the payment account as its own provider float");
check(workspace.includes("eligibleCatalog.find") && workspace.includes("indicativeSalePrice") && workspace.includes("indicativeCost"), "Selecting a real catalog offer must prefill its business label and indicative amounts without inventing data");

for (const copy of [frCopy, enCopy]) {
  check(copy.includes('"telco"'), "Transaction form dictionary must contain guided Telco copy");
  for (const key of [
    "paymentMethodHelp",
    "providerHelp",
    "operatorAccountHelp",
    "connectedModeHelp",
    "reviewSafety",
    "referenceRequired",
    "failureRequired",
    "configurationAccountHelp",
  ]) {
    check(copy.includes(`"${key}"`), `Telco FR/EN copy missing ${key}`);
  }
}

const createStart = retailService.indexOf("export async function createTelcoTopup");
const reverseStart = retailService.indexOf("export async function reverseTelcoTopup", createStart);
const createBlock = createStart >= 0 && reverseStart > createStart ? retailService.slice(createStart, reverseStart) : "";
const reverseEnd = retailService.indexOf("export async function createRetailDailyClose", reverseStart);
const reverseBlock = reverseStart >= 0 && reverseEnd > reverseStart ? retailService.slice(reverseStart, reverseEnd) : "";
check(hasAll(createBlock, [
  "organizationId",
  "input.catalogItemId",
  "input.tenderFinancialAccountId",
  "resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)",
  "assertOpenCashSession",
  "operatorFloatAccountId: operatorFloatAccount.id",
]), "Telco mutation must retain server revalidation for catalog, payment account, cash session and provider account");
check(hasAll(reverseBlock, ["topup.tenderFinancialAccountId", "topup.operatorFloatAccountId", "topup.currencyCode"]), "Telco reversal must use historical accounts persisted on the original operation");
check(!createBlock.includes("input.operatorFloatAccountId ||"), "Browser operatorFloatAccountId must not become authoritative");

check(hasAll(guardrails, [
  "prepareCommercialTelcoTopup",
  'executionMode === "MANUAL" && input.status === "SUCCESS" && !requestedExternalReference',
  'externalReference: executionMode === "CONNECTED" ? null : requestedExternalReference',
  "normalizeRetailPhone",
]), "Telco guardrails must preserve manual reference rules, connected provider authority and server phone normalization");
check(hasAll(orchestration, [
  "createConnectedTelcoTopupOperation",
  'status: "SUCCESS"',
  "failureReason: null",
  "finalizeConfirmedRetailOperatorOperation",
]), "Connected Telco operations must remain provider-orchestrated and converge on the canonical finalizer");

check(contributing.includes("FORM_UX_CONTRACT.md") && contributing.includes("OWNER_E2E"), "Hotfix QA assumes the current CONTRIBUTING form and E2E governance contracts remain present");
check(!fs.existsSync(path.join(root, "prisma/migrations/20260829_telco_guided_configuration")), "Hotfix #531 must not invent a Prisma migration when canonical Telco models already exist");

if (failures.length) {
  console.error("FAIL qa-531-telco-guided-configuration");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-531-telco-guided-configuration");
console.log("- TELCO_TOPUPS is routed through a dedicated professional workspace with a real Configuration block");
console.log("- Payment-derived currency, provider account resolution and concurrent tills remain server-authoritative");
console.log("- MANUAL/CONNECTED fields are conditional, errors are actionable and review/reversal use controlled dialogs");
console.log("- Canonical FR/EN form copy, RBAC, audit, tenant isolation and historical reversal contracts are guarded");
