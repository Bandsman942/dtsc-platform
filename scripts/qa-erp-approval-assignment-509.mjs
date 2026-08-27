import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, label) => checks.push({ ok: Boolean(condition), label });
const has = (source, pattern) => typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);

const assignment = read("lib/enterprise/approval-assignment.ts");
const approvalTargets = read("lib/enterprise/approval-targets.ts");
const candidateRoute = read("app/api/enterprise/[organizationId]/approval-candidates/route.ts");
const treasury = read("lib/enterprise/accounting/treasury-transfer-service.ts");
const treasuryDecision = read("lib/enterprise/accounting/treasury-approval-service.ts");
const treasuryTransitionRoute = read("app/api/enterprise/[organizationId]/account-transfers/[transferId]/transition/route.ts");
const approvalsRoute = read("app/api/enterprise/[organizationId]/approvals/route.ts");
const approvalActions = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
const coordinationRoute = read("app/api/enterprise/[organizationId]/approvals/[id]/coordination/route.ts");
const approvalCoordination = read("lib/standard-work-coordination/approval-coordination.ts");
const bridge = read("lib/enterprise/core-v2/approval-assignment-service.ts");
const purchase = read("lib/enterprise/procurement/purchase-service.ts");
const budget = read("lib/enterprise/finance/budget-service.ts");
const expense = read("lib/enterprise/finance/expense-service.ts");
const financeUi = read("components/enterprise/core-v2/enterprise-finance-workspace.tsx");
const hrHelpers = read("lib/enterprise/hr-payroll/helpers.ts");
const hrRegression = read("scripts/qa-enterprise-hr-payroll-checks.mjs");
const rolesRoute = read("app/api/enterprise/[organizationId]/administration/roles/route.ts");
const positionsRoute = read("app/api/enterprise/[organizationId]/administration/positions-guided/route.ts");
const permissionCatalog = read("lib/enterprise/governance/permission-catalog.ts");
const governanceUi = read("components/enterprise/enterprise-governance-panels.tsx");
const adminUi = read("components/enterprise/enterprise-administration-module.tsx");
const approverSelect = read("components/enterprise/enterprise-approver-select.tsx");
const presentation = read("lib/enterprise/approval-presentation.ts");
const accountingBoundary = read("docs/HOTFIX_509_ACCOUNTING_APPROVAL_BOUNDARIES.md");
const journal = read("lib/enterprise/accounting/journal-service.ts");
const payments = read("lib/enterprise/accounting/payments-service.ts");
const close = read("lib/enterprise/accounting/close-service.ts");
const reversal = read("lib/enterprise/accounting/reversal-service.ts");
const opening = read("lib/enterprise/accounting/opening-balance-service.ts");
const payables = read("lib/enterprise/accounting/payables-service.ts");
const receivables = read("lib/enterprise/accounting/receivables-service.ts");
const supplierCredits = read("lib/enterprise/accounting/supplier-credit-notes-service.ts");
const treasuryControls = read("lib/enterprise/accounting/treasury-service.ts");

expect(has(assignment, 'status: "ACTIVE", removedAt: null'), "candidats limités aux memberships actifs");
expect(has(assignment, 'action: "approve"'), "permission approve résolue côté serveur");
expect(has(assignment, "getEnterpriseApprovalPolicy"), "politique tenant d’auto-validation lue côté serveur");
expect(has(assignment, "if (otherCandidates.length) return"), "auto-validation indisponible lorsqu’un autre validateur existe");
expect(has(assignment, "policy.selfApprovalModuleCodes.includes(canonicalModuleCode)"), "override borné par module");
expect(has(assignment, "assertEnterpriseApprovalDecision"), "décision revalidée au moment de l’approbation");

for (const [targetType, moduleCode] of [
  ["EnterpriseAccountTransfer", "FINANCE_TREASURY"],
  ["EnterprisePurchase", "SUPPLIERS_PURCHASES"],
  ["EnterpriseBudget", "FINANCE_BUDGETS"],
  ["EnterpriseExpense", "FINANCE_BUDGETS"],
  ["EnterpriseLeaveRequest", "TIME_ATTENDANCE"],
  ["EnterpriseEmploymentContract", "HUMAN_RESOURCES"],
  ["EnterpriseTimesheet", "TIME_ATTENDANCE"],
  ["EnterprisePayrollRun", "PAYROLL_OPERATIONS"],
]) {
  expect(has(approvalTargets, `${targetType}: "${moduleCode}"`), `module canonique centralisé pour ${targetType}`);
}
expect(has(approvalTargets, "enterpriseApprovalTargetDeepLink"), "deep-links de validation centralisés par type métier");

expect(has(candidateRoute, "resolveEnterpriseModuleAccess"), "endpoint candidats vérifie l’accès module");
expect(has(candidateRoute, "listEnterpriseApprovalCandidates"), "endpoint candidats utilise la primitive canonique");
expect(has(candidateRoute, "session.userId"), "demandeur dérivé de la session");

expect(has(treasury, 'targetEntityType: "EnterpriseAccountTransfer"'), "transfert crée immédiatement une EnterpriseApproval");
expect(has(treasury, "assertEnterpriseApprovalCandidate"), "transfert revalide le validateur côté backend");
expect(has(treasuryDecision, "assertEnterpriseApprovalDecision"), "décision transfert revalide le validateur");
expect(has(treasuryDecision, 'status: "APPROVED"'), "approbation transfert clôt la validation");
expect(has(treasuryDecision, "rejectAssignedAccountTransfer"), "rejet du transfert clôt aussi la validation sans désynchroniser le brouillon");
expect(has(treasuryTransitionRoute, "approveAssignedAccountTransfer"), "route transfert utilise le service d’affectation sécurisé");
expect(!has(treasuryTransitionRoute, "approveAccountTransfer"), "route transfert n’utilise plus l’ancien approbateur indépendant non affecté");

expect(has(approvalsRoute, "createAssignedEnterpriseApproval"), "route générique utilise le contrat d’affectation");
expect(has(approvalActions, "decideAssignedEnterpriseApproval"), "route générique utilise le contrat de décision");
expect(!has(approvalActions, "Vous ne pouvez pas décider sur votre propre soumission"), "route générique ne court-circuite pas l’override gouverné");
expect(has(approvalActions, "approveAssignedAccountTransfer"), "Centre des actions délègue les transferts au service Trésorerie");
expect(has(approvalActions, "decideEnterpriseLeaveRequest"), "Centre des actions délègue les congés au service RH");
expect(has(approvalActions, "decideEnterpriseEmploymentContract"), "Centre des actions délègue les contrats au service RH");
expect(has(approvalActions, "decideEnterpriseTimesheet"), "Centre des actions délègue les feuilles de temps au service RH");
expect(has(approvalActions, "decideEnterprisePayrollRun"), "Centre des actions délègue les paies au service RH");
expect(has(approvalActions, "validateDelegationCandidate"), "délégation revalidée côté serveur avant persistance");
expect(has(approvalActions, "assertEnterpriseApprovalCandidate"), "délégation utilise le même contrat RBAC que l’affectation initiale");
expect(has(approvalActions, "enterpriseApprovalModuleForTarget"), "délégation résout le module à partir du type métier canonique");
expect(has(bridge, "MODULE_BY_TARGET"), "bridge générique mappe explicitement les familles métier");

expect(has(coordinationRoute, "listEnterpriseApprovalCandidates"), "coordination ne propose que des délégués éligibles côté backend");
expect(has(coordinationRoute, "candidate.userId !== approval.requestedByUserId"), "coordination ne transforme pas la délégation en auto-validation implicite");
expect(has(coordinationRoute, "enterpriseApprovalTargetDeepLink"), "coordination ouvre le vrai module métier au lieu d’un fallback pharmacie");
expect(!has(coordinationRoute, "organizationMember.findMany"), "coordination ne liste plus tous les membres actifs comme validateurs potentiels");

expect(has(purchase, "assertEnterpriseApprovalCandidate"), "achats valident l’affectation via le contrat partagé");
expect(has(purchase, "assertEnterpriseApprovalDecision"), "achats valident la décision via le contrat partagé");
expect(has(budget, "assertEnterpriseApprovalCandidate"), "budgets valident l’affectation via le contrat partagé");
expect(has(budget, "assertEnterpriseApprovalDecision"), "budgets valident la décision via le contrat partagé");
expect(has(expense, "assertEnterpriseApprovalCandidate"), "dépenses valident l’affectation via le contrat partagé");
expect(has(expense, "assertEnterpriseApprovalDecision"), "dépenses valident la décision via le contrat partagé");
expect(has(financeUi, "EnterpriseApproverSelect"), "budgets et dépenses utilisent le sélecteur de validateurs éligibles");
expect(has(financeUi, 'moduleCode="FINANCE_BUDGETS"'), "UI finance demande les validateurs dans le bon contexte module");
expect(has(hrHelpers, "assertEnterpriseApprovalCandidate"), "RH/paie utilisent le contrat partagé à l’affectation");
expect(has(hrHelpers, "assertEnterpriseApprovalDecision"), "RH/paie utilisent le contrat partagé à la décision");
expect(has(hrRegression, "assertOrganizationApprovalDecision"), "régression RH mesure le nouveau contrat partagé au lieu d’exiger l’ancien garde local dans paie");

for (const targetType of [
  "EnterpriseAccountTransfer",
  "EnterpriseLeaveRequest",
  "EnterpriseEmploymentContract",
  "EnterpriseTimesheet",
  "EnterprisePayrollRun",
]) {
  expect(has(approvalCoordination, targetType), `snapshot versionné disponible pour ${targetType}`);
}
expect(has(approvalCoordination, "TARGET_NOT_SUPPORTED"), "un type inconnu échoue explicitement au lieu d’être traité comme incident pharmacie");

expect(has(permissionCatalog, "deriveTenantPermissionsFromCapabilities"), "permissions dérivées de capacités guidées côté serveur");
expect(has(permissionCatalog, "isEnabled: true"), "catalogue de capacités borné aux modules activés du tenant");
expect(has(rolesRoute, "deriveTenantPermissionsFromCapabilities"), "création de rôle refuse les permissions brutes");
expect(has(positionsRoute, "deriveTenantPermissionsFromCapabilities"), "création de poste réutilise le même catalogue guidé");
expect(!has(rolesRoute, /permissions\s*:\s*parsed\.data\.permissions/), "route rôles ne persiste pas des permissions fournies librement");
expect(has(adminUi, "EnterprisePositionsGuidedPanel"), "administration utilise les postes guidés");
expect(has(governanceUi, "DTSC dérive les permissions techniques côté serveur"), "UI explique le modèle guidé sans demander de codes techniques");

expect(has(approverSelect, "/approval-candidates?moduleCode="), "sélecteur partagé charge ses options depuis le backend");
expect(has(approverSelect, "Aucun autre validateur autorisé n’est disponible"), "absence de validateur expliquée clairement");

for (const targetType of [
  "EnterpriseAccountTransfer",
  "EnterpriseRequest",
  "EnterprisePurchase",
  "EnterpriseBudget",
  "EnterpriseExpense",
  "EnterpriseLeaveRequest",
  "EnterpriseEmploymentContract",
  "EnterpriseTimesheet",
  "EnterprisePayrollRun",
]) {
  expect(has(presentation, targetType), `centre des actions présente ${targetType}`);
}
expect(has(presentation, "/enterprise-modules/FINANCE_TREASURY?transfer="), "deep-link transfert vers Trésorerie");
expect(has(presentation, "/enterprise-modules/VALIDATIONS?approval="), "fallback de validation reste actionnable");

// Les contrôles comptables restants sont explicitement classés : une validation humaine
// non encore affectée est reprise par #511, tandis qu'une exécution/posting/réversibilité
// conserve sa séparation stricte et ne reçoit jamais l'override de #509.
expect(has(accountingBoundary, "#511"), "dette comptable structurelle liée explicitement à l’Issue #511");
for (const label of [
  "Écriture comptable — APPROVE/REJECT",
  "Paiement — APPROVE",
  "Facture client — APPROVE",
  "Facture fournisseur — REVIEW puis APPROVE",
  "Clôture financière — APPROVE",
  "Session de caisse — VALIDATE/REJECT",
  "Rapprochement — COMPLETE",
]) {
  expect(has(accountingBoundary, label), `inventaire comptable documente ${label}`);
}
for (const label of [
  "Écriture comptable — POST",
  "Paiement — CONFIRM",
  "Paiement — REVERSE",
  "Clôture financière — CLOSE",
  "Clôture financière — REOPEN",
  "Contrepassation d’écriture",
]) {
  expect(has(accountingBoundary, label), `frontière stricte documentée pour ${label}`);
}
expect(has(journal, "JOURNAL_ENTRY_SELF_POST_FORBIDDEN"), "posting d’écriture conserve une séparation d’exécution stricte");
expect(has(payments, "PAYMENT_SELF_CONFIRMATION_FORBIDDEN"), "confirmation de paiement conserve une séparation stricte");
expect(has(payments, "PAYMENT_SELF_REVERSAL_FORBIDDEN"), "réversion de paiement conserve une séparation stricte");
expect(has(reversal, "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN"), "contrepassation comptable conserve une séparation stricte");
expect(has(close, "FINANCIAL_CLOSE_SELF_CLOSE_FORBIDDEN"), "clôture finale conserve une séparation stricte");
expect(has(close, "FINANCIAL_CLOSE_SELF_REOPEN_FORBIDDEN"), "réouverture conserve une séparation stricte");
expect(has(opening, "approveAndPostOpeningBalance"), "solde d’ouverture combiné reste inventorié avant découpage #511");
expect(has(receivables, "approveAndPostSalesCreditNote"), "avoir client combiné reste inventorié avant découpage #511");
expect(has(supplierCredits, "approveAndPostSupplierCreditNote"), "avoir fournisseur combiné reste inventorié avant découpage #511");
expect(has(payables, "SUPPLIER_INVOICE_SELF_REVIEW_FORBIDDEN") && has(payables, "SUPPLIER_INVOICE_SELF_APPROVAL_FORBIDDEN"), "facture fournisseur conserve ses deux barrières jusqu’au workflow multi-étapes #511");
expect(has(treasuryControls, "CASH_SESSION_SELF_VALIDATION_FORBIDDEN"), "validation de caisse reste fail-closed avant affectation explicite #511");
expect(has(treasuryControls, "RECONCILIATION_SELF_APPROVAL_FORBIDDEN"), "rapprochement reste fail-closed avant affectation explicite #511");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) {
  console.error(`\n${failed.length} contrat(s) #509 en échec.`);
  process.exit(1);
}
console.log(`\nQA #509 réussie: ${checks.length} contrats vérifiés.`);
