import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(path, source, before, after) {
  if (!source.includes(before)) throw new Error(`${path}: expected pattern not found: ${before.slice(0, 120)}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${path}: replacement produced no change`);
  return next;
}
function replaceRegex(path, source, regex, after) {
  if (!regex.test(source)) throw new Error(`${path}: expected regex not found: ${regex}`);
  regex.lastIndex = 0;
  return source.replace(regex, after);
}

{
  const path = "app/enterprise-modules/[moduleCode]/page.tsx";
  let source = read(path);
  source = replaceOnce(path, source, 'select: { name: true, sectorCode: true },', 'select: { name: true, sectorCode: true, logoUrl: true },');
  source = replaceOnce(path, source,
    '<EnterpriseSectorModuleWorkspace\n          organizationId={organizationId}\n          definition={definition}',
    '<EnterpriseSectorModuleWorkspace\n          organizationId={organizationId}\n          organizationName={organization.name}\n          organizationLogoUrl={organization.logoUrl}\n          locale={user.locale}\n          definition={definition}');
  source = replaceOnce(path, source,
    '<EnterprisePayrollOperationsWorkspace organizationId={organizationId} organizationName={organization.name} definition={definition} />',
    '<EnterprisePayrollOperationsWorkspace organizationId={organizationId} organizationName={organization.name} organizationLogoUrl={organization.logoUrl} locale={user.locale} definition={definition} />');
  source = replaceOnce(path, source,
    'organizationName={organization.name}\n        enterpriseModule=',
    'organizationName={organization.name}\n        organizationLogoUrl={organization.logoUrl}\n        enterpriseModule=');
  write(path, source);
}

{
  const path = "components/enterprise/enterprise-module-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    '  organizationName,\n  enterpriseModule,',
    '  organizationName,\n  organizationLogoUrl,\n  enterpriseModule,');
  source = replaceOnce(path, source,
    '  organizationName: string;\n  enterpriseModule:',
    '  organizationName: string;\n  organizationLogoUrl?: string | null;\n  enterpriseModule:');
  source = replaceOnce(path, source,
    '<EnterpriseReportsWorkspace organizationId={organizationId} canCreate={canCreate} canManage={canManage} locale={locale}',
    '<EnterpriseReportsWorkspace organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} canCreate={canCreate} canManage={canManage} locale={locale}');
  write(path, source);
}

{
  const path = "components/enterprise/enterprise-sector-module-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    '  organizationId: string;\n  definition: EnterpriseModuleDefinition;',
    '  organizationId: string;\n  organizationName: string;\n  organizationLogoUrl?: string | null;\n  locale?: string | null;\n  definition: EnterpriseModuleDefinition;');
  source = replaceOnce(path, source,
    '  const { organizationId, definition, enabledModuleCodes } = props;',
    '  const { organizationId, organizationName, organizationLogoUrl, locale, definition, enabledModuleCodes } = props;');
  source = replaceOnce(path, source,
    'if (definition.code === "PHARMACY_REPORTS") return withHelp(<PharmacyReportsWorkspace organizationId={organizationId} />);',
    'if (definition.code === "PHARMACY_REPORTS") return withHelp(<PharmacyReportsWorkspace organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} locale={locale} />);');
  write(path, source);
}

{
  const path = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    'import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";\n',
    'import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";\nimport { ProfessionalReportView } from "@/components/reports/professional-report-view";\n');
  source = replaceOnce(path, source,
    'import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";\n',
    'import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";\nimport { buildEnterpriseProfessionalReport } from "@/lib/reporting/enterprise-professional-report";\n');
  source = replaceOnce(path, source,
    'export function EnterpriseReportsWorkspace({ organizationId, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {',
    'export function EnterpriseReportsWorkspace({ organizationId, organizationName, organizationLogoUrl, canCreate, canManage, locale, legacyRecords = [] }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; canCreate: boolean; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {');
  source = replaceOnce(path, source,
    '  const reports = useEnterpriseV2Collection<ReportItem>({ endpoint: `/api/enterprise/${organizationId}/reports`, params, refreshKey });\n',
    '  const reports = useEnterpriseV2Collection<ReportItem>({ endpoint: `/api/enterprise/${organizationId}/reports`, params, refreshKey });\n  const detailModel = useMemo(() => detail ? buildEnterpriseProfessionalReport({ locale, organizationName, reference: detail.report.reference, title: detail.report.title, reportType: detail.report.reportType, reportTypeLabel: reportTypeLabel(locale, detail.report.reportType), generatedAt: detail.report.generatedAt, periodStart: detail.report.periodStart, periodEnd: detail.report.periodEnd, currency: detail.report.currency, snapshot: detail.report.snapshotJson, filters: detail.report.filtersJson }) : null, [detail, locale, organizationName]);\n');
  source = replaceRegex(path, source,
    /    <Dialog open=\{Boolean\(detail\)\} onClose=\{\(\) => setDetail\(null\)\} title=\{detail \? `\$\{detail\.report\.reference\} · \$\{detail\.report\.title\}` : ""\} className="h-\[96dvh\] max-w-5xl">[\s\S]*?<\/Dialog>\n  <\/div>;\n}\n\nfunction SnapshotView\([\s\S]*$/,
    '    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.report.reference} · ${detail.report.title}` : ""} className="h-[96dvh] max-w-6xl">{detail && detailModel ? <div className="grid gap-5"><ProfessionalReportView model={detailModel} locale={locale} logoUrl={organizationLogoUrl} />{detail.events.length ? <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">{t("reports.detail.history")}</h3><div className="mt-3 grid gap-2 text-sm text-dtsc-muted">{detail.events.slice(0, 10).map((event) => <p key={event.id}>{formatEnterpriseDate(event.createdAt, locale)} · {event.summary}</p>)}</div></section> : null}</div> : null}</Dialog>\n  </div>;\n}\n');
  write(path, source);
}

{
  const path = "lib/reporting/payroll-professional-report.ts";
  let source = read(path);
  source = replaceOnce(path, source,
    'employee?: { id?: string; firstName?: string | null; lastName?: string | null; employeeNumber?: string | null; position?: { title?: string | null } | null; department?: { name?: string | null } | null } | null;',
    'employee?: { id?: string; displayName?: string | null; firstName?: string | null; lastName?: string | null; employeeNumber?: string | null; position?: { title?: string | null } | null; department?: { name?: string | null } | null } | null;');
  source = replaceOnce(path, source,
    '  periodEnd?: string | null;\n  status?: string | null;',
    '  periodEnd?: string | null;\n  payrollPeriod?: { periodStart?: string | null; periodEnd?: string | null } | null;\n  status?: string | null;');
  source = replaceOnce(path, source,
    '  const name = [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim();\n  return name || employee?.employeeNumber || "Collaborateur";',
    '  const name = employee?.displayName?.trim() || [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim();\n  return name || employee?.employeeNumber || "Collaborateur";');
  source = replaceOnce(path, source,
    '  const previous = input.previousRun && input.previousRun.currency === currency ? input.previousRun : null;\n',
    '  const previous = input.previousRun && input.previousRun.currency === currency ? input.previousRun : null;\n  const periodStart = run.periodStart || run.payrollPeriod?.periodStart || null;\n  const periodEnd = run.periodEnd || run.payrollPeriod?.periodEnd || null;\n');
  source = source.replaceAll('date(run.periodStart, input.locale)', 'date(periodStart, input.locale)').replaceAll('date(run.periodEnd, input.locale)', 'date(periodEnd, input.locale)');
  write(path, source);
}

{
  const path = "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    'import { StatusBadge } from "@/components/workspace/status-badge";\n',
    'import { StatusBadge } from "@/components/workspace/status-badge";\nimport { ProfessionalReportView } from "@/components/reports/professional-report-view";\n');
  source = replaceOnce(path, source,
    'import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";\n',
    'import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";\nimport { buildPayrollProfessionalReport } from "@/lib/reporting/payroll-professional-report";\n');
  source = replaceOnce(path, source,
    'export function EnterprisePayrollOperationsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {',
    'export function EnterprisePayrollOperationsWorkspace({ organizationId, organizationName, organizationLogoUrl, locale, definition }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null; definition: EnterpriseModuleDefinition }) {');
  source = replaceOnce(path, source,
    '  const activeCollection = tab === "RUNS" ? runs : periods;\n',
    '  const activeCollection = tab === "RUNS" ? runs : periods;\n  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: runs.items.find((run) => run.id !== detail.id && run.currency === detail.currency) || null }) : null, [detail, locale, organizationName, runs.items]);\n');
  source = replaceRegex(path, source,
    /    <Dialog open=\{Boolean\(detail\)\} onClose=\{\(\) => setDetail\(null\)\} title=\{detail \? `\$\{detail\.reference\} · \$\{detail\.payrollPeriod\.name\}` : "Détail de la paie"\} className="h-\[94dvh\] max-w-5xl">[\s\S]*?<\/Dialog>\n  <\/ModuleWorkspace>;/,
    '    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.payrollPeriod.name}` : "Détail de la paie"} className="h-[96dvh] max-w-6xl">{detail && payrollReportModel ? <div className="grid gap-5"><ProfessionalReportView model={payrollReportModel} locale={locale} logoUrl={organizationLogoUrl} /><section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">Bulletins et contrôles individuels</h3><div className="mt-3"><BusinessList ariaLabel="Collaborateurs de la paie">{detail.items.map((item) => <BusinessListItem key={item.id} title={`${item.employee.employeeNumber} · ${item.employee.displayName}`} status={<StatusBadge tone={item.payslip ? "success" : "neutral"}>{item.payslip ? `${item.payslip.payslipNumber} · ${STATUS_LABELS[item.payslip.status] || item.payslip.status}` : "Bulletin non généré"}</StatusBadge>} meta={`${money(item.netAmount, detail.currency)} net · ${minutesLabel(item.approvedTimeMinutes)}`} description={`Base ${money(item.baseGrossAmount, detail.currency)} · Prime ${money(item.bonusAmount, detail.currency)} · Retenue ${money(item.deductionAmount, detail.currency)}`} />)}</BusinessList></div></section><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}</Dialog>\n  </ModuleWorkspace>;');
  write(path, source);
}

{
  const path = "components/enterprise/pharmacy-reports-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source, 'import { ListControls } from "@/components/ui/list-controls";\n', '');
  source = replaceOnce(path, source, 'import { useSmartList } from "@/lib/hooks/use-smart-list";\n', '');
  source = replaceOnce(path, source,
    'import { useToastMessage } from "@/components/ui/use-toast-message";\n',
    'import { useToastMessage } from "@/components/ui/use-toast-message";\nimport { ProfessionalReportView } from "@/components/reports/professional-report-view";\nimport { buildPharmacyProfessionalReport } from "@/lib/reporting/pharmacy-professional-report";\n');
  source = replaceOnce(path, source,
    'export function PharmacyReportsWorkspace({ organizationId }: { organizationId: string }) {',
    'export function PharmacyReportsWorkspace({ organizationId, organizationName, organizationLogoUrl, locale }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null }) {');
  source = replaceOnce(path, source,
    '  const current = data?.sections[active]; const reportType = tabs.find((item) => item[0] === active)?.[2] || "PHARMACY_OVERVIEW";\n',
    '  const current = data?.sections[active]; const reportType = tabs.find((item) => item[0] === active)?.[2] || "PHARMACY_OVERVIEW";\n  const professionalReport = useMemo(() => current ? buildPharmacyProfessionalReport({ organizationName, reportType, section: current, filters }) : null, [current, filters, organizationName, reportType]);\n');
  source = replaceOnce(path, source, '>Exporter CSV</Button>', '>CSV audité</Button>');
  source = replaceOnce(path, source,
    '{busy ? <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm font-bold text-dtsc-muted">Calcul des indicateurs réels en cours...</p> : current && <ReportSection section={current} />}',
    '{busy ? <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5 text-sm font-bold text-dtsc-muted">Calcul des indicateurs réels en cours...</p> : professionalReport ? <ProfessionalReportView model={professionalReport} locale={locale} logoUrl={organizationLogoUrl} /> : null}');
  source = replaceRegex(path, source,
    /\nfunction ReportSection\([\s\S]*?\nfunction Filter\(/,
    '\nfunction Filter(');
  write(path, source);
}

{
  const path = "components/enterprise/enterprise-finance-module-page.tsx";
  let source = read(path);
  source = replaceOnce(path, source, 'select: { name: true },', 'select: { name: true, logoUrl: true },');
  source = replaceOnce(path, source,
    '          organizationName={organization.name}\n          definition={definition}',
    '          organizationName={organization.name}\n          organizationLogoUrl={organization.logoUrl}\n          definition={definition}');
  write(path, source);
}

{
  const path = "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    'import { Button } from "@/components/ui/button";\n',
    'import { Button } from "@/components/ui/button";\nimport { FinancialStatementReportDialog } from "@/components/reports/financial-statement-report-dialog";\n');
  source = replaceOnce(path, source,
    'type Props = { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean };',
    'type Props = { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean };');
  source = replaceOnce(path, source,
    'export function EnterpriseAdvancedFinanceWorkspace({ organizationId, organizationName, definition, locale: rawLocale, canManage }: Props) {',
    'export function EnterpriseAdvancedFinanceWorkspace({ organizationId, organizationName, organizationLogoUrl, definition, locale: rawLocale, canManage }: Props) {');
  source = replaceOnce(path, source,
    '              {activeKey === "years" && item.status === "DRAFT" ?',
    '              {activeKey === "statements" && item.id ? <FinancialStatementReportDialog organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} statementId={item.id} locale={rawLocale} /> : null}\n              {activeKey === "years" && item.status === "DRAFT" ?');
  write(path, source);
}

console.log("Hotfix #317 report integrations applied.");
