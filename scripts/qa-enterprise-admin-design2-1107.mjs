import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checks = [
  ["annuaire tenant-scoped paginé", () => {
    const code = source("app/api/enterprise/[organizationId]/members/route.ts");
    assert.match(code, /export async function GET/);
    assert.match(code, /resolveEnterpriseModuleAccess/);
    assert.match(code, /organizationId,\s*removedAt: null/);
    assert.match(code, /skip:\s*\(page - 1\) \* pageSize/);
    assert.match(code, /organizationMember\.groupBy/);
  }],
  ["indicateurs non bornés aux premières lignes", () => {
    const code = source("lib/enterprise/enterprise-admin-loader.ts");
    assert.match(code, /enterpriseTask\.groupBy/);
    assert.match(code, /enterpriseRequest\.groupBy/);
    assert.match(code, /organizationMember\.groupBy/);
    assert.match(code, /overdueTasksExactCount/);
    assert.match(code, /todayKey/);
  }],
  ["11 sections et deeplink pending", () => {
    const view = source("components/enterprise/enterprise-administration-module.tsx");
    for (const code of ["overview", "members", "positions", "departments", "permissions", "modules", "subscription", "settings", "security", "audit", "pending"]) {
      assert.ok(view.includes(`code: "${code}"`), `${code} missing`);
    }
    assert.match(source("components/enterprise/enterprise-admin-section-activator.tsx"), /"pending"/);
  }],
  ["formulaires conservés après refus", () => {
    const module = source("components/enterprise/enterprise-administration-module.tsx");
    const panel = source("components/enterprise/enterprise-admin-panels.tsx");
    assert.match(module, /return response\.ok/);
    assert.match(panel, /if \(saved\)\s*\{\s*setEditingMember\(null\)/);
    assert.match(panel, /setMemberError/);
    assert.match(panel, /SUSPENDED/);
  }],
  ["filtres et exports premiums cohérents", () => {
    const toolbar = source("components/enterprise/enterprise-admin-list-toolbar.tsx");
    for (const name of ["downloadProfessionalCsv", "downloadProfessionalXlsx", "downloadProfessionalPdfV2"]) assert.ok(toolbar.includes(name));
    const panel = source("components/enterprise/enterprise-administration-panels-base.tsx");
    assert.match(panel, /TimeZoneCombobox/);
    for (const name of ["filteredModules", "filteredDepartments", "pageItems"]) assert.ok(panel.includes(name));
    assert.match(source("components/enterprise/enterprise-positions-guided-panel.tsx"), /reloadOnSave = true/);
  }],
  ["export d’audit: validation ERP, identité et contrôle à chaque étape", () => {
    const gate = source("lib/enterprise/audit-export-approval.ts");
    assert.match(gate, /targetEntityType: "EnterpriseRequest"/);
    assert.match(gate, /requestType: "AUDIT_EXPORT"/);
    assert.match(gate, /requestedByUserId: actorUserId/);
    assert.match(source("app/api/enterprise/[organizationId]/administration/audit/export/route.ts"), /hasApprovedEnterpriseAuditExport/);
    assert.match(source("lib/enterprise/bulk-jobs/worker.ts"), /hasApprovedEnterpriseAuditExport/);
    const download = source("app/api/enterprise/[organizationId]/administration/audit/exports/[jobId]/download/route.ts");
    assert.match(download, /hasApprovedEnterpriseAuditExport/);
    assert.match(download, /payload\?\.actorUserId !== session\.userId/);
    const request = source("app/api/enterprise/[organizationId]/administration/audit/export-approval/route.ts");
    assert.match(request, /createEnterpriseRequest/);
    assert.match(request, /createAssignedEnterpriseApproval/);
    assert.match(request, /assertEnterpriseApprovalCandidate/);
    assert.match(request, /isSameOriginRequest/);
  }],
  ["audit consultable par période et pagination", () => {
    const api = source("app/api/enterprise/[organizationId]/administration/audit/route.ts");
    assert.match(api, /INVALID_DATE_RANGE/);
    assert.match(api, /tenantScope/);
    const panel = source("components/enterprise/enterprise-admin-audit-history.tsx");
    assert.match(panel, /EnterpriseAdminPagination/);
    assert.match(panel, /type="date"/);
    assert.match(panel, /current page/);
  }],
  ["rapport d’administration lié au registre ERP Rapports", () => {
    const endpoint = source("app/api/enterprise/[organizationId]/administration/report/route.ts");
    assert.match(endpoint, /moduleCode: "REPORTS", action: "submit"/);
    assert.match(endpoint, /getEnterpriseAdministrationDataset/);
    assert.match(endpoint, /reportType: "ENTERPRISE_ADMIN_OVERVIEW"/);
    assert.match(endpoint, /ENTERPRISE_REPORT_GENERATED/);
    assert.match(source("lib/reporting/enterprise-professional-report.ts"), /enterprise-admin-overview\/v1/);
    assert.match(source("components/enterprise/enterprise-administration-summary.tsx"), /Save to Reports/);
  }],
];

for (const [name, check] of checks) {
  check();
  console.log(`✓ Administration Design 2.0 #1107 — ${name}`);
}
