import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const page = read("app/enterprise-modules/retail-page.tsx");
const dashboard = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
const mobileMoney = read("components/enterprise/professional/mobile-money-agency-dtsc-workspace.tsx");
const mobileMoneyAccounts = read("app/api/enterprise/[organizationId]/retail/mobile-money/accounts/route.ts");
const cashManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
const pos = read("components/enterprise/professional/retail-pos-dtsc-workspace.tsx");
const posCash = read("components/enterprise/professional/retail-pos-cash-session-manager.tsx");
const telco = read("components/enterprise/professional/telco-topups-workspace.tsx");
const telcoService = read("lib/enterprise/retail/telco-multicurrency-service.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");

for (const marker of [
  "MobileMoneyAgencyDtscWorkspace",
  "RetailPosDtscWorkspace",
  "TelcoTopupsWorkspace",
]) {
  check(page.includes(marker), `Retail page is not routed through ${marker}`);
}

for (const marker of [
  'cashSessions: dashboard.cashSessions',
  'moduleCode === "TELCO_TOPUPS" ? getTelcoProviderAccountConfiguration(organizationId)',
  'telcoConfiguration, catalogItems: dashboard.catalogItems',
]) {
  check(dashboard.includes(marker), `Retail dashboard contract missing ${marker}`);
}

for (const marker of [
  "overflow-x-auto",
  "snap-x",
  "snap-start",
  "value={selectedSessionId}",
  "onSelectSession(event.target.value)",
]) {
  check(cashManager.includes(marker), `Shared Mobile Money/Telco cash rail missing ${marker}`);
}

for (const marker of [
  "RetailPosCashSessionManager",
  "cashSessions",
  "openCashAccounts",
  'method === "CASH"',
  "paymentMismatch",
  "overrideNeeded",
  "GuidedField",
  'presentation="editor"',
  'h-[96dvh]',
  "buildReview",
  'notifyToast(message, "error")',
]) {
  check(pos.includes(marker), `POS guided-form contract missing ${marker}`);
}
check(!pos.includes("window.prompt"), "Routed POS workspace must not use window.prompt");
check(posCash.includes("overflow-x-auto") && posCash.includes("snap-x") && posCash.includes("selectedSessionId"), "POS cash sessions must expose a synchronized horizontal rail and combobox");
check(posCash.includes("notifyToast(copy.accountRequired, \"error\")") && posCash.includes("noValidate"), "POS till opening must use explicit inline/toast validation");

for (const marker of [
  "GuidedField",
  "eligibleProviders",
  "wallet",
  "executionMode",
  "manual",
  "referenceRequired",
  "hasFee",
  'presentation="editor"',
  'h-[96dvh]',
  "buildReview",
  'notifyToast(message, "error")',
]) {
  check(mobileMoney.includes(marker), `Mobile Money guided-form contract missing ${marker}`);
}
check(!mobileMoney.includes("window.prompt"), "Routed Mobile Money workspace must not use window.prompt");
check(mobileMoneyAccounts.includes("integrationMode") && mobileMoneyAccounts.includes("executionMode"), "Mobile Money configuration must expose execution mode without exposing credentials");
check(!mobileMoneyAccounts.includes("credentialReference") && !mobileMoneyAccounts.includes("webhookSecretReference"), "Mobile Money configuration must not expose provider secrets");

for (const marker of [
  "GuidedField",
  "telcoConfiguration",
  "eligibleProviders",
  "operatorAccount",
  "executionMode",
  "manual",
  "manualStatus",
  "referenceRequired",
  "failureReasonRequired",
  "selectedCatalog",
  'presentation="editor"',
  'h-[96dvh]',
  "buildReview",
  'notifyToast(message, "error")',
]) {
  check(telco.includes(marker), `Telco guided-form contract missing ${marker}`);
}
check(!telco.includes("window.prompt"), "Routed Telco workspace must not use window.prompt");
for (const marker of [
  "enterpriseRetailProviderIntegration.findMany",
  "integrationModeByProviderId",
  "executionMode",
  "TELCO_FLOAT_ACCOUNT_USE",
]) {
  check(telcoService.includes(marker), `Telco provider/currency configuration contract missing ${marker}`);
}

for (const marker of [
  "resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode)",
  "assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId)",
  "resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)",
]) {
  check(retailService.includes(marker), `Retail server-authority contract missing ${marker}`);
}
check(guardrails.includes('executionMode === "MANUAL" && !requestedExternalReference'), "Manual provider reference guardrail is missing");
check(guardrails.includes('externalReference: executionMode === "CONNECTED" ? null : requestedExternalReference'), "Connected provider reference must remain provider-authoritative");

if (failures.length) {
  console.error("FAIL qa-529-retail-guided-review");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-529-retail-guided-review");
console.log("- Mobile Money, POS and Telco are routed through dedicated DTSC guided workspaces");
console.log("- all three flows use explicit validation and full-screen review before financial mutation");
console.log("- POS and Telco consume multi-cash sessions and currency-scoped enterprise references");
console.log("- Mobile Money and Telco expose provider execution mode without exposing secrets");
console.log("- server authority remains enforced for tenant, till session, wallet/operator account and provider mode");
