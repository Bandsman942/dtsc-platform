import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(path, source, before, after) {
  if (!source.includes(before)) throw new Error(`${path}: expected pattern not found: ${before.slice(0, 140)}`);
  return source.replace(before, after);
}

{
  const path = "lib/reporting/finance-professional-report.ts";
  let source = read(path);
  source = replaceOnce(path, source,
    '  const kpis = scalar.map(([key, value]) => ({ label: fieldLabel(key, locale), value: displayValue(value, key, currency, locale), numericValue: value }));',
    '  const kpis: ProfessionalReportExportModel["kpis"] = scalar.map(([key, value]) => ({ label: fieldLabel(key, locale), value: displayValue(value, key, currency, locale), numericValue: value }));');
  source = replaceOnce(path, source,
    '      const total = Object.values(buckets).reduce((sum, value) => sum + (numberValue(value) || 0), 0);',
    '      const total = Object.values(buckets).reduce<number>((sum, value) => sum + (numberValue(value) || 0), 0);');
  write(path, source);
}

{
  const path = "components/enterprise/enterprise-finance-module-page.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    '          organizationName={organization.name}\n          organizationLogoUrl={organization.logoUrl}\n          definition={definition}\n          locale={user.locale}\n          canManage={canManage}\n        />\n      ) : (\n        <EnterpriseAdvancedFinanceWorkspace\n          organizationId={organizationId}\n          organizationName={organization.name}\n          definition={definition}',
    '          organizationName={organization.name}\n          definition={definition}\n          locale={user.locale}\n          canManage={canManage}\n        />\n      ) : (\n        <EnterpriseAdvancedFinanceWorkspace\n          organizationId={organizationId}\n          organizationName={organization.name}\n          organizationLogoUrl={organization.logoUrl}\n          definition={definition}');
  write(path, source);
}

{
  const path = "components/enterprise/pharmacy-reports-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    'export function PharmacyReportsWorkspace({ organizationId, organizationName, organizationLogoUrl, locale }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null }) {',
    'export function PharmacyReportsWorkspace({ organizationId, organizationName, organizationLogoUrl, locale }: { organizationId: string; organizationName?: string; organizationLogoUrl?: string | null; locale?: string | null }) {');
  source = replaceOnce(path, source,
    'buildPharmacyProfessionalReport({ organizationName, reportType, section: current, filters: professionalFilters })',
    'buildPharmacyProfessionalReport({ organizationName: organizationName || "DTSC Platform", reportType, section: current, filters: professionalFilters })');
  write(path, source);
}

console.log("Hotfix #317 type contracts fixed.");
