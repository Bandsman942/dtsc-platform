import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
const expect = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const operations = read("components/admin/operations-admin-panel.tsx");
const ceo = read("components/admin/ceo-executive-summary.tsx");
const legal = read("components/admin/legal-dashboard-summary.tsx");
const adminPage = read("app/admin/page.tsx");
const appShell = read("components/layout/app-shell.tsx");
const localeProvider = read("components/i18n/locale-provider.tsx");
const i18n = read("lib/i18n.ts");
const enterprisePage = read("app/enterprise-modules/[moduleCode]/page.tsx");
const enterpriseModule = read("components/enterprise/enterprise-module-workspace.tsx");
const enterpriseCore = read("components/enterprise/enterprise-core-workspace.tsx");
const enterpriseAdmin = read("components/enterprise/enterprise-administration-module.tsx");
const enterpriseSummary = read("components/enterprise/enterprise-administration-summary.tsx");
const healthPatients = read("components/enterprise/health-patients-workspace.tsx");
const pharmacy = read("components/enterprise/pharmacy-admin-workspace.tsx");
const actionMenu = read("components/ui/action-menu.tsx");

expect("internal operations use workspace primitives", operations.includes("ModuleWorkspace") && operations.includes("ModuleHeader") && operations.includes("ModuleToolbar") && operations.includes("ModuleMetrics") && operations.includes("BusinessList") && operations.includes("ContextActions"));
expect("internal operations preserve smart list controls", operations.includes("ListControls") && operations.includes("useSmartList"));
expect("internal operations removed decorative accordion/card shell", !operations.includes("<Accordion") && !operations.includes("dtsc-card") && !operations.includes("dtsc-glass-list-item"));
expect("internal operations preserve real CRUD endpoints", operations.includes("fetch(dataset.endpoint") && operations.includes("method: \"PATCH\"") && operations.includes("method: \"DELETE\"") && operations.includes("/api/admin/operation-files"));
expect("CEO summary uses workspace architecture", ceo.includes("ModuleWorkspace") && ceo.includes("ModuleHeader") && ceo.includes("ModuleToolbar") && ceo.includes("ModuleMetrics") && !ceo.includes("dtsc-card"));
expect("Legal summary uses workspace architecture", legal.includes("ModuleWorkspace") && legal.includes("ModuleHeader") && legal.includes("ModuleMetrics") && !legal.includes("dtsc-card"));
expect("admin server still guards DTSC internal access", adminPage.includes("isDtscInternalSession") && adminPage.includes("canAccessAdminSection") && adminPage.includes("OperationsAdminPanel"));
expect("private app shell propagates user locale", appShell.includes("LocaleProvider") && appShell.includes("locale={user.locale}") && localeProvider.includes("LocaleContext") && localeProvider.includes("useAppLocale"));
expect("workspace generalization exposes FR and EN shell dictionary", i18n.includes("workspaceGeneralizationDictionaries") && i18n.includes("translateWorkspaceGeneralization") && i18n.includes("pharmacyTitle") && i18n.includes("enterpriseAdministration"));
expect("enterprise page preserves tenant and module permission checks", enterprisePage.includes("requireEnterpriseMembership") && enterprisePage.includes("canAccessEnterpriseModule") && enterprisePage.includes("organizationId"));
expect("enterprise module shell uses workspace primitives", enterpriseModule.includes("ModuleWorkspace") && enterpriseModule.includes("ModuleHeader") && enterpriseModule.includes("ModuleMetrics") && enterpriseModule.includes("BusinessList"));
expect("enterprise core uses row-based workspace lists", enterpriseCore.includes("ModuleSection") && enterpriseCore.includes("BusinessList") && enterpriseCore.includes("ContextActions") && enterpriseCore.includes("ListControls") && enterpriseCore.includes("useSmartList"));
expect("enterprise core preserves real APIs", enterpriseCore.includes(`/api/enterprise/${"${organizationId}"}/core`) && enterpriseCore.includes("REQUEST_VALIDATION") && enterpriseCore.includes("APPROVE") && enterpriseCore.includes("REJECT"));
expect("enterprise administration uses flat summary and workspace", enterpriseAdmin.includes("ModuleWorkspace") && enterpriseAdmin.includes("EnterpriseAdministrationSummary") && enterpriseSummary.includes("ModuleHeader") && enterpriseSummary.includes("ModuleMetrics") && enterpriseSummary.includes("translateWorkspaceGeneralization"));
expect(
  "health uses dedicated workspaces outside the retired generic sector CRUD",
  !enterpriseAdmin.includes("HealthcareAdminWorkspace") &&
    enterpriseAdmin.includes("Les domaines Health et Pharmacy utilisent exclusivement leurs workspaces dédiés") &&
    enterpriseAdmin.includes('href="/enterprise-modules"') &&
    healthPatients.includes("HealthPatientsWorkspace") &&
    healthPatients.includes(`/api/enterprise/${"${organizationId}"}/healthcare/patients`) &&
    !healthPatients.includes("EnterpriseSectorRecordItem"),
);
expect("pharmacy uses reusable workspace shell", pharmacy.includes("ModuleWorkspace") && pharmacy.includes("ModuleHeader") && pharmacy.includes("ModuleSection") && pharmacy.includes("ModuleMetrics") && pharmacy.includes("BusinessList") && pharmacy.includes("ContextActions"));
expect("pharmacy preserves real sector APIs", pharmacy.includes(`/api/enterprise/${"${organizationId}"}/pharmacy`) && pharmacy.includes("method: \"DELETE\"") && pharmacy.includes("method: editing ? \"PATCH\" : \"POST\""));
expect("Sprint 1 action menu hardening remains intact", actionMenu.includes("window.visualViewport") && actionMenu.includes("zIndex: 1200") && actionMenu.includes('className="fixed z-[1000]'));

let failed = 0;
for (const check of checks) {
  if (check.ok) console.log(`PASS ${check.name}`);
  else {
    failed += 1;
    console.error(`FAIL ${check.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} workspace generalization check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} workspace generalization checks passed.`);
