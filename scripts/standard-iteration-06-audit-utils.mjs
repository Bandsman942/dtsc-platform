import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) throw new Error(`Fichier absent: ${file}`);
  return fs.readFileSync(absolute, "utf8");
}

function has(file, needle) {
  const content = read(file);
  if (!content.includes(needle)) throw new Error(`${file}: contrat absent: ${needle}`);
}

function lacks(file, needle) {
  const content = read(file);
  if (content.includes(needle)) throw new Error(`${file}: contrat obsolète encore présent: ${needle}`);
}

function json(file) {
  return JSON.parse(read(file));
}

const profiles = {
  budgets: () => {
    has("prisma/enterprise-finance-reporting.prisma", "model EnterpriseBudgetAlert");
    has("lib/enterprise/finance/budget-service.ts", "CREATE_REVISION");
    has("lib/enterprise/finance/budget-service.ts", "BUDGET_FROZEN");
  },
  budgetSources: () => {
    has("lib/enterprise/finance/budget-service.ts", "actualFreshnessAt");
    has("lib/enterprise/reporting/metric-registry.ts", "sourceCode");
    if (/model\s+(JournalEntry|AccountingEntry|Invoice)\b/.test(read("prisma/enterprise-finance-reporting.prisma"))) throw new Error("Le domaine budgétaire recrée une source ERP interdite.");
  },
  budgetFormulas: () => {
    has("lib/enterprise/reporting/metric-registry.ts", "calculateBudgetMetrics");
    has("lib/enterprise/reporting/metric-registry.ts", "available");
    has("lib/enterprise/reporting/metric-registry.ts", "consumptionRate");
  },
  budgetWorkflows: () => {
    has("lib/enterprise/finance/budget-service.ts", "createEnterpriseBudgetApproval");
    has("lib/enterprise/finance/constants.ts", "CORRECTION_REQUESTED");
    has("app/api/enterprise/[organizationId]/budgets/[id]/alerts/route.ts", "evaluateEnterpriseBudgetAlerts");
  },
  reportsCatalog: () => {
    has("lib/enterprise/reporting/metric-registry.ts", "ENTERPRISE_REPORT_CATALOG");
    has("app/api/enterprise/[organizationId]/reports/catalog/route.ts", "ENTERPRISE_REPORT_CATALOG");
  },
  reportMetrics: () => {
    has("lib/enterprise/reporting/metric-registry.ts", "METRIC_DEFINITIONS");
    has("lib/enterprise/finance/report-service.ts", "metricDefinitionCodes");
  },
  reportSources: () => {
    has("lib/enterprise/finance/report-service.ts", "freshnessAt");
    has("lib/enterprise/finance/report-service.ts", "sourcePolicyCode");
  },
  reportExports: () => {
    has("app/api/enterprise/[organizationId]/reports/[id]/export/route.ts", "ENTERPRISE_REPORT_EXPORTED");
    has("app/api/enterprise/[organizationId]/reports/[id]/export/route.ts", "freshness");
  },
  administration: () => {
    has("components/enterprise/enterprise-administration-module.tsx", "EnterpriseConfigurationChecklistPanel");
    has("components/enterprise/enterprise-administration-module.tsx", "EnterprisePendingActionsPanel");
    lacks("components/enterprise/enterprise-administration-module.tsx", "Modules sectoriels");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "BRAND_COLORS");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "type=\"file\"");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "Bloquer temporairement un accès");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "fullScreen");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "useFormSubmissionGuard");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "aria-busy");
    has("components/enterprise/enterprise-admin-hotfix-panels.tsx", "disabled:cursor-wait");
    has("lib/enterprise/enterprise-admin-loader.ts", "configurationChecklist");
    has("lib/enterprise/enterprise-admin-loader.ts", "pendingActions");
    has("lib/enterprise/enterprise-admin-loader.ts", "FINANCE_ACCOUNTS");
    has("lib/enterprise/enterprise-admin-loader.ts", "FINANCE_BUDGETS");
    has("lib/enterprise/enterprise-admin-loader.ts", "manageAccessPromiseByModule");
    has("lib/enterprise/enterprise-admin-loader.ts", "!moduleReadable || (!involved && !moduleManageable)");
    has("lib/enterprise/module-access.ts", "getActiveEnterpriseModuleRestriction");
    has("app/api/enterprise/[organizationId]/administration/modules/[moduleCode]/access/route.ts", "isSameOriginRequest");
    has("app/api/enterprise/[organizationId]/administration/departments/route.ts", "enterpriseDepartment.create");
    has("app/api/enterprise/[organizationId]/administration/departments/[departmentId]/route.ts", "isActive: false");
    has("app/api/enterprise/[organizationId]/administration/departments/[departmentId]/route.ts", "createsDepartmentCycle");
    has("app/api/enterprise/[organizationId]/administration/departments/[departmentId]/route.ts", "DEPARTMENT_CYCLE");
    has("app/api/enterprise/invitations/[id]/route.ts", "updatedAt: true");
    has("app/api/enterprise/invitations/[id]/route.ts", "const invitationIssuedAt = invitation.updatedAt");
    lacks("app/api/enterprise/invitations/[id]/route.ts", "invitation.createdAt.getTime() + expiryHours");
    has("tests/e2e/erp-identity-professional.spec.mjs", "administration entreprise #475");
    has("tests/e2e/erp-identity-professional.spec.mjs", "viewport: { width: 390, height: 844 }");
    has("tests/e2e/erp-identity-professional.spec.mjs", "/administration/security");
    has("tests/e2e/erp-identity-professional.spec.mjs", "son historique et ses anciens rattachements resteront conservés");
    has("docs/CHANGELOG_ENTERPRISE_ADMIN_475.md", "Recette E2E propriétaire requise avant merge");
  },
  rbac: () => {
    has("prisma/schema.prisma", "model EnterpriseOrganizationRole");
    has("lib/enterprise/module-access.ts", "organizationRoleAssignments");
    has("app/api/enterprise/[organizationId]/members/[memberId]/route.ts", "LAST_ADMIN_PROTECTED");
  },
  modules: () => {
    const registry = json("lib/modules/standard-module-registry-data.json");
    const codes = new Set(registry.modules.map((item) => item.code));
    for (const code of ["BUDGETS_EXPENSES_STANDARD", "STANDARD_REPORTS", "ENTERPRISE_ADMINISTRATION", "ENTERPRISE_SECURITY", "ENTERPRISE_AUDIT"]) if (!codes.has(code)) throw new Error(`Module absent du registre: ${code}`);
  },
  security: () => {
    has("prisma/schema.prisma", "model EnterpriseOrganizationSecurityPolicy");
    has("app/api/enterprise/[organizationId]/administration/security/route.ts", "isSameOriginRequest");
    has("app/api/enterprise/[organizationId]/administration/audit/export/route.ts", "sensitiveExportApproval");
  },
  auditLogs: () => {
    has("lib/audit.ts", "reasonCode");
    has("lib/audit.ts", "beforeJson");
    has("app/api/enterprise/[organizationId]/administration/audit/route.ts", "organizationId");
  },
  i18n: () => {
    for (const file of ["locales/fr.json", "locales/en.json"]) {
      const dictionary = json(file);
      for (const key of ["budgets", "reports", "metrics", "enterpriseAdmin"]) if (!dictionary[key]) throw new Error(`${file}: namespace absent ${key}`);
    }
    has("docs/STANDARD_ENTERPRISE_GOVERNANCE_I18N_CONTRACT.md", "reason codes");
  },
  guides: () => {
    has("lib/user-guides/iteration06-guides.ts", "FINANCE_BUDGETS");
    has("lib/user-guides/iteration06-guides.ts", "ENTERPRISE_AUDIT_LOGS");
    has("components/enterprise/enterprise-module-workspace.tsx", "getIteration06UserGuide");
  },
  maturity: () => {
    const registry = json("lib/modules/standard-module-registry-data.json");
    const relevant = registry.modules.filter((item) => item.qaContract === "scripts/qa-standard-modules-iteration-06.mjs");
    if (relevant.length < 10) throw new Error(`Couverture maturité itération 06 insuffisante: ${relevant.length}`);
    for (const item of relevant) {
      if (!item.userGuidePath) throw new Error(`${item.code}: guide absent`);
      if (item.maturity === "COMMERCIAL_READY") throw new Error(`${item.code}: promotion commerciale automatique interdite`);
    }
    has("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_06.md", "NON_EXÉCUTÉ");
  },
};

export function runAudit(profile, label) {
  try {
    const fn = profiles[profile];
    if (!fn) throw new Error(`Profil QA inconnu: ${profile}`);
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const iteration06Profiles = Object.keys(profiles);
