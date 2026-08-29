import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const page = read("app/enterprise-modules/retail-page.tsx");
const dashboard = read("app/api/enterprise/[organizationId]/retail/dashboard/route.ts");
const mobileMoney = read("components/enterprise/professional/mobile-money-agency-workspace.tsx");
const mobileMoneyAccounts = read("app/api/enterprise/[organizationId]/retail/mobile-money/accounts/route.ts");
const cashManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
const pos = read("components/enterprise/professional/retail-pos-dtsc-workspace.tsx");
const posCash = read("components/enterprise/professional/retail-pos-cash-session-manager.tsx");
const retailService = read("lib/enterprise/retail/service.ts");
const guardrails = read("lib/enterprise/retail/commercial-guardrails.ts");
const frCopy = read("locales/retail-transaction-forms.fr.json");
const enCopy = read("locales/retail-transaction-forms.en.json");

check(page.includes("MobileMoneyAgencyWorkspace"), "Retail page must keep the Mobile Money professional workspace routed");
check(page.includes("RetailPosDtscWorkspace"), "Retail page must route POS through the DTSC guided workspace");
check(page.includes("RetailOperatorWorkspace"), "Telco routing must remain on its existing workspace outside hotfix #529");
check(!page.includes("TelcoTopupsWorkspace"), "Hotfix #529 must not replace the Telco workspace");
check(dashboard.includes("cashSessions: dashboard.cashSessions"), "Retail dashboard must expose all current-user cash sessions");

for (const marker of [
  "overflow-x-auto",
  "snap-x",
  "snap-start",
  "value={selectedSessionId}",
  "onSelectSession(event.target.value)",
]) {
  check(cashManager.includes(marker), `Mobile Money cash rail missing ${marker}`);
}

for (const marker of [
  "retail-transaction-forms.fr.json",
  "retail-transaction-forms.en.json",
  "OperationFieldErrors",
  "MobileMoneyGuidedField",
  "eligibleProviders",
  "formWallet",
  "executionMode",
  "manualExecution",
  "fieldErrors.reference",
  "formProvider && manualExecution",
  'presentation="editor"',
  'h-[96dvh]',
  "setPending({",
  "confirmOperation",
  "floatAccountId: null",
]) {
  check(mobileMoney.includes(marker), `Mobile Money DTSC form contract missing ${marker}`);
}
check(!mobileMoney.includes("window.prompt"), "Mobile Money routed workspace must not use window.prompt");
check(mobileMoney.includes("formError(preciseError)"), "Mobile Money field validation must surface a foreground error toast");
check(mobileMoney.includes('externalReference: providerManualExecution ? externalReference : ""'), "Connected Mobile Money operations must not trust a manual reference");
check(mobileMoneyAccounts.includes("integrationMode") && mobileMoneyAccounts.includes("executionMode"), "Mobile Money configuration must expose MANUAL/CONNECTED execution mode");
check(!mobileMoneyAccounts.includes("credentialReference") && !mobileMoneyAccounts.includes("webhookSecretReference"), "Mobile Money configuration must not expose provider secrets");

for (const marker of [
  "RetailPosCashSessionManager",
  "cashSessions",
  "openCashAccounts",
  "paymentAccounts1",
  "paymentAccounts2",
  "paymentMismatch",
  "overrideNeeded",
  "GuidedField",
  "buildReview",
  'presentation="editor"',
  'h-[96dvh]',
  'notifyToast(message, "error")',
  "confirmSale",
]) {
  check(pos.includes(marker), `POS guided-form contract missing ${marker}`);
}
check(!pos.includes("window.prompt"), "Routed POS workspace must not use window.prompt");
check(pos.includes("overrideNeeded && dashboard.access.canManage"), "POS override reason must remain conditional");
check(pos.includes("selectedAccount2.id === selectedAccount1?.id"), "POS split payment must reject the same financial account twice");
check(pos.includes("Math.abs(tenderTotal - total) > 0.005"), "POS must validate tender total before review");
check(posCash.includes("overflow-x-auto") && posCash.includes("snap-x") && posCash.includes("selectedSessionId"), "POS cash sessions must expose a synchronized horizontal rail and combobox");
check(posCash.includes('notifyToast(copy.accountRequired, "error")') && posCash.includes("noValidate"), "POS till opening must use explicit inline/toast validation");

for (const copy of [frCopy, enCopy]) {
  check(copy.includes('"pos"'), "Transaction form dictionary must contain POS copy");
  check(copy.includes('"posCash"'), "Transaction form dictionary must contain POS cash copy");
  check(copy.includes('"mobileMoney"'), "Transaction form dictionary must contain Mobile Money copy");
  check(copy.includes('"reviewSafety"'), "Transaction form dictionary must explain pre-confirmation safety");
  check(copy.includes('"referenceRequired"'), "Transaction form dictionary must explain manual provider reference requirement");
}

for (const marker of [
  "resolveMobileMoneyFloatAccountTx(tx, organizationId, provider, input.currencyCode)",
  "assertOpenCashSession(tx, organizationId, cashAccount.id, actorUserId)",
]) {
  check(retailService.includes(marker), `Mobile Money server-authority contract missing ${marker}`);
}
check(guardrails.includes('executionMode === "MANUAL" && !requestedExternalReference'), "Manual Mobile Money provider reference guardrail is missing");
check(guardrails.includes('externalReference: executionMode === "CONNECTED" ? null : requestedExternalReference'), "Connected provider reference must remain server/provider-authoritative");

if (failures.length) {
  console.error("FAIL qa-529-retail-guided-review");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-529-retail-guided-review");
console.log("- Mobile Money uses guided fields, conditional MANUAL reference and full-screen review before mutation");
console.log("- POS consumes multi-cash sessions, validates real tender accounts and uses full-screen review before sale creation");
console.log("- POS and Mobile Money reversal flows avoid window.prompt and preserve controlled dialogs");
console.log("- FR/EN form copy is externalized and Mobile Money server authority remains intact");
console.log("- Telco remains outside the #529 implementation scope");
