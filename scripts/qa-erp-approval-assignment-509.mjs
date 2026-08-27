import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, label) => checks.push({ ok: Boolean(condition), label });
const has = (source, pattern) => typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);

const assignment = read("lib/enterprise/approval-assignment.ts");
const candidateRoute = read("app/api/enterprise/[organizationId]/approval-candidates/route.ts");
const treasury = read("lib/enterprise/accounting/treasury-transfer-service.ts");
const treasuryDecision = read("lib/enterprise/accounting/treasury-approval-service.ts");
const approvalsRoute = read("app/api/enterprise/[organizationId]/approvals/route.ts");
const approvalActions = read("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts");
const bridge = read("lib/enterprise/core-v2/approval-assignment-service.ts");
const purchase = read("lib/enterprise/procurement/purchase-service.ts");
const hrHelpers = read("lib/enterprise/hr-payroll/helpers.ts");
const rolesRoute = read("app/api/enterprise/[organizationId]/administration/roles/route.ts");
const positionsRoute = read("app/api/enterprise/[organizationId]/administration/positions-guided/route.ts");
const permissionCatalog = read("lib/enterprise/governance/permission-catalog.ts");
const governanceUi = read("components/enterprise/enterprise-governance-panels.tsx");
const adminUi = read("components/enterprise/enterprise-administration-module.tsx");
const approverSelect = read("components/enterprise/enterprise-approver-select.tsx");
const presentation = read("lib/enterprise/approval-presentation.ts");

expect(has(assignment, 'status: "ACTIVE", removedAt: null'), "candidats limités aux memberships actifs");
expect(has(assignment, 'action: "approve"'), "permission approve résolue côté serveur");
expect(has(assignment, "getEnterpriseApprovalPolicy"), "politique tenant d’auto-validation lue côté serveur");
expect(has(assignment, "if (otherCandidates.length) return"), "auto-validation indisponible lorsqu’un autre validateur existe");
expect(has(assignment, "policy.selfApprovalModuleCodes.includes(canonicalModuleCode)"), "override borné par module");
expect(has(assignment, "assertEnterpriseApprovalDecision"), "décision revalidée au moment de l’approbation");

expect(has(candidateRoute, "resolveEnterpriseModuleAccess"), "endpoint candidats vérifie l’accès module");
expect(has(candidateRoute, "listEnterpriseApprovalCandidates"), "endpoint candidats utilise la primitive canonique");
expect(has(candidateRoute, "session.userId"), "demandeur dérivé de la session");

expect(has(treasury, 'targetEntityType: "EnterpriseAccountTransfer"'), "transfert crée immédiatement une EnterpriseApproval");
expect(has(treasury, "assertEnterpriseApprovalCandidate"), "transfert revalide le validateur côté backend");
expect(has(treasuryDecision, "assertEnterpriseApprovalDecision"), "décision transfert revalide le validateur");
expect(has(treasuryDecision, 'status: "APPROVED"'), "approbation transfert clôt la validation");

expect(has(approvalsRoute, "createAssignedEnterpriseApproval"), "route générique utilise le contrat d’affectation");
expect(has(approvalActions, "decideAssignedEnterpriseApproval"), "route générique utilise le contrat de décision");
expect(!has(approvalActions, "Vous ne pouvez pas décider sur votre propre soumission"), "route générique ne court-circuite pas l’override gouverné");
expect(has(bridge, "MODULE_BY_TARGET"), "bridge générique mappe explicitement les familles métier");

expect(has(purchase, "assertEnterpriseApprovalCandidate"), "achats valident l’affectation via le contrat partagé");
expect(has(purchase, "assertEnterpriseApprovalDecision"), "achats valident la décision via le contrat partagé");
expect(has(hrHelpers, "assertEnterpriseApprovalCandidate"), "RH/paie utilisent le contrat partagé à l’affectation");
expect(has(hrHelpers, "assertEnterpriseApprovalDecision"), "RH/paie utilisent le contrat partagé à la décision");

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

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) {
  console.error(`\n${failed.length} contrat(s) #509 en échec.`);
  process.exit(1);
}
console.log(`\nQA #509 réussie: ${checks.length} contrats vérifiés.`);
