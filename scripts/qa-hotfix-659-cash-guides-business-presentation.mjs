import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const checks = [];
function expect(condition, label) { checks.push({ ok: Boolean(condition), label }); }
function hasAll(source, markers) { return markers.every((marker) => source.includes(marker)); }

const mobileCloseRoute = read("app/api/enterprise/[organizationId]/retail/cash-sessions/[sessionId]/close/route.ts");
const telcoCloseRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts");
const financeCloseRoute = read("app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/close/route.ts");
const cashCollectionRoute = read("app/api/enterprise/[organizationId]/cash-sessions/route.ts");
const physicalCount = read("components/enterprise/professional/cash-physical-count-fields.tsx");
const mobileManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
const financeCash = read("components/enterprise/professional/enterprise-finance-cash-workspace.tsx");
const financeRouter = read("components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx");
const operationalFinanceRouter = read("components/enterprise/professional/enterprise-operational-finance-workspace.tsx");
const accountingApproval = read("lib/enterprise/accounting/accounting-approval-service.ts");
const approvalActions = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
const approvalCoordination = read("lib/standard-work-coordination/approval-coordination.ts");
const approvalTargets = read("lib/enterprise/approval-targets.ts");
const approvalsWorkspace = read("components/enterprise/core-v2/enterprise-approvals-workspace.tsx");
const approvalPresentation = read("lib/enterprise/approval-presentation.ts");
const calendar = read("lib/standard-work-coordination/calendar.ts");
const guideContract = read("lib/user-guides/canonical-guide.ts");
const guideRegistry = read("lib/user-guides/enterprise-guide-registry.ts");
const guideRenderer = read("components/user-guides/contextual-user-guide.tsx");
const helpPage = read("app/help/enterprise/page.tsx");
const packageJson = read("package.json");
const browserAcceptance = read("tests/e2e/issue-659-cash-guides-business-presentation.spec.mjs");
const acceptanceWorkflow = read(".github/workflows/hotfix-659-cash-guides-business-presentation.yml");
const ownerE2E = read("docs/OWNER_E2E_659_CASH_GUIDES_BUSINESS_PRESENTATION.md");


for (const [label, source, moduleCode] of [
  ["Mobile Money", mobileCloseRoute, "MOBILE_MONEY_AGENCY"],
  ["Télécom", telcoCloseRoute, "TELCO_TOPUPS"],
]) {
  expect(hasAll(source, [
    `"${moduleCode}", "submit"`,
    "assignedCashCloseSchema",
    "submitCashSessionCloseForAssignedValidation",
    "ENTERPRISE_RETAIL_CASH_SESSION_SUBMITTED",
  ]), `${label}: clôture Retail réutilise l'orchestration affectée canonique`);
  expect(!source.includes("cashCloseSchema"), `${label}: ancien schéma de clôture sans validateur retiré`);
  expect(!source.includes("submitCashSessionClose("), `${label}: ancien service sans EnterpriseApproval retiré`);
}
expect(hasAll(financeCloseRoute, ["assignedCashCloseSchema", "submitCashSessionCloseForAssignedValidation"]), "Finance Caisse conserve la même orchestration affectée");

expect(hasAll(physicalCount, [
  "CashPhysicalCountFields",
  "cashCountsFromForm",
  "CDF: [20000, 10000, 5000, 1000, 500, 200, 100, 50]",
  "USD: [100, 50, 20, 10, 5, 1]",
  "countedClosingAmount",
  'moduleCode="FINANCE_CASH"',
  "EnterpriseApproverSelect",
]), "comptage physique canonique couvre coupures, total, écart et validateur FINANCE_CASH");
expect(hasAll(mobileManager, ["CashPhysicalCountFields", "cashCountsFromForm", "approverUserId", "closeError", "notifyToast"]), "Mobile Money/Télécom réutilisent le comptage canonique et exigent le validateur");
expect(hasAll(financeCash, ["CashPhysicalCountFields", "cashCountsFromForm", "approverUserId", 'moduleCode="FINANCE_CASH"']), "Finance Caisse réutilise exactement le même comptage canonique");
expect(hasAll(financeRouter, ['definition.code === "FINANCE_CASH"', "EnterpriseFinanceCashWorkspace", "EnterpriseFinanceBankReconciliationWorkspace"]), "routeur Finance isole Caisse sans casser Banque/Rapprochement");
expect(hasAll(operationalFinanceRouter, [
  'props.definition.code === "FINANCE_CASH"',
  "<EnterpriseFinanceCashWorkspace {...props} />",
  "EnterpriseFinanceCashBankReconciliationWorkspaceHotfix",
  '["FINANCE_BANK", "FINANCE_RECONCILIATION"]',
]), "dispatcher Finance opérationnelle branche réellement Caisse sur le workspace spécialisé tout en conservant le hotfix Banque/Rapprochement");
expect(hasAll(cashCollectionRoute, ["movements: { select: { direction: true, amount: true } }", "expectedCurrentAmount", "theoreticalClosingAmount: item.expectedClosingAmount ?? expectedCurrentAmount"]), "la caisse ouverte expose un théorique courant calculé depuis les mouvements serveur");

expect(hasAll(accountingApproval, [
  "createAccountingApprovalNotification",
  "tx.notification.create",
  'type: "ENTERPRISE_APPROVAL"',
  "enqueueWebPushNotification",
  'initialStatus === "PENDING"',
  "activateQueuedAccountingApproval",
  "approverUserId: queued.approverUserId",
]), "les validations comptables affectées créent une notification persistée et Web Push au bon moment");
expect(hasAll(approvalActions, ["EnterpriseCashSession", "validateCashSessionAssignedApproval", 'approve: data.action === "APPROVE"']), "File des validations délègue réellement la décision de caisse au moteur Finance");
expect(hasAll(approvalCoordination, ["EnterpriseCashSession", "expectedClosingAmount", "countedClosingAmount", "discrepancyAmount", "closingReason", "counts:"]), "la revue versionnée de la File des validations sait présenter une clôture de caisse");

expect(hasAll(approvalTargets, [
  "ENTERPRISE_APPROVAL_TARGET_LABELS",
  "EnterpriseSalesCreditNoteApproval",
  'fr: "Avoir client"',
  'fr: "Clôture de caisse"',
  'return locale === "en" ? "Business approval" : "Validation métier"',
]), "registre central fournit des libellés commerciaux et un fallback sûr");
expect(hasAll(approvalsWorkspace, ["canonicalApprovalTargetLabel", "approvalTargetLabel(locale, approval.targetEntityType)"]), "File des validations consomme le libellé commercial canonique");
expect(!approvalsWorkspace.includes("return entityType"), "File des validations ne retombe jamais sur le code backend brut");
expect(hasAll(approvalPresentation, ["enterpriseApprovalTargetLabel", "enterpriseApprovalModuleForTarget", "enterpriseApprovalTargetDeepLink"]), "Centre des actions réutilise présentation, module et deep-link canoniques");
expect(hasAll(calendar, ["enterpriseApprovalTargetLabel", "Validation · ${targetLabel}"]), "calendrier transforme les validations en langage métier");
expect(!calendar.includes("${approval.targetEntityType}"), "calendrier n'affiche plus targetEntityType au client");
expect(!calendar.includes("${run.sourceEntityType}"), "calendrier n'affiche plus sourceEntityType au client");

expect(hasAll(guideContract, ["CanonicalUserGuide", "LegacyEnterpriseUserGuide", "toCanonicalEnterpriseUserGuide"]), "contrat canonique des guides est explicite et adaptable");
expect(hasAll(guideRegistry, ["COMMON_ENTERPRISE_USER_GUIDES", "FINANCE_USER_GUIDES", "SECTOR_USER_GUIDES", "getCanonicalEnterpriseUserGuide"]), "un registre public unique agrège les sources historiques sans renderer parallèle");
expect(hasAll(guideRenderer, ["CanonicalUserGuide", 'presentation?: "dialog" | "inline"', 'data-canonical-user-guide={guide.code}']), "renderer ContextualUserGuide sert le mode contextuel et le centre d'aide");
expect(hasAll(helpPage, ["getCanonicalEnterpriseUserGuide", "ContextualUserGuide", 'presentation="inline"']), "centre d'aide ERP utilise le renderer canonique");
expect(!helpPage.includes("FINANCE_USER_GUIDES") && !helpPage.includes("SECTOR_USER_GUIDES") && !helpPage.includes("const GUIDES"), "page d'aide ne maintient plus ses registres/renderers concurrents");


expect(hasAll(packageJson, [
  '"qa:hotfix-659": "node scripts/qa-hotfix-659-cash-guides-business-presentation.mjs"',
  "qa-hotfix-659-cash-guides-business-presentation.mjs",
]), "QA #659 est exposée directement et injectée dans qa:regression");
expect(hasAll(browserAcceptance, [
  "FINANCE_CASH",
  "approval-candidates?moduleCode=FINANCE_CASH",
  'targetEntityType: "EnterpriseCashSession"',
  "EnterpriseCashSession",
  "Cash close",
  "320, 360, 375, 390, 414, 768, 1024",
]), "E2E #659 couvre clôture assignée, file des validations, anti-jargon et matrice responsive");
expect(hasAll(acceptanceWorkflow, [
  "Hotfix #659 browser acceptance",
  "pnpm qa:hotfix-659",
  "pnpm qa:regression",
  "pnpm type-check",
  "pnpm lint",
  "pnpm build",
  "seed-shop2-behavioral-e2e.mjs",
]), "workflow #659 prouve QA, build et E2E sur base propre");
expect(hasAll(ownerE2E, [
  "E2E #659 bon",
  "NOT_EXECUTED",
  "320, 360, 375, 390, 414, 768 et 1024",
]), "OWNER_E2E #659 reste explicitement manuel et non exécuté avant validation propriétaire");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} #659 ${check.label}`);
if (failed.length) {
  console.error(`Hotfix #659 QA: ${failed.length} échec(s).`);
  process.exit(1);
}
console.log(`Hotfix #659 QA: PASS (${checks.length} contrôles).`);
