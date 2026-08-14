import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(path, source, before, after) {
  if (!source.includes(before)) throw new Error(`${path}: expected pattern not found: ${before.slice(0, 140)}`);
  return source.replace(before, after);
}
function replaceRegex(path, source, regex, after) {
  if (!regex.test(source)) throw new Error(`${path}: expected regex not found: ${regex}`);
  regex.lastIndex = 0;
  return source.replace(regex, after);
}

{
  const path = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source, 't("reports.detail.history")', 't("history")');
  write(path, source);
}

{
  const path = "lib/reporting/professional-export.ts";
  let source = read(path);
  source = replaceOnce(path, source,
    '  const chartStart = 9;\n  const chartEnd = Math.max(chartStart, chartStart + model.chart.length - 1);\n  const hasChart = model.chart.length > 0;\n',
    '  const chartStart = 8 + model.kpis.length;\n  const chartEnd = Math.max(chartStart, chartStart + model.chart.length - 1);\n  const hasChart = model.chart.length > 0;\n  const xlsxAccent = `FF${(/^#[0-9a-fA-F]{6}$/.test(model.accentHex || "") ? String(model.accentHex).slice(1) : "087EA4").toUpperCase()}`;\n');
  source = replaceOnce(path, source, '<fgColor rgb="FF087EA4"/>', '<fgColor rgb="${xlsxAccent}"/>');
  source = replaceOnce(path, source,
    '  triggerDownload(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(model.filenameBase)}.xlsx`);',
    '  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;\n  triggerDownload(new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(model.filenameBase)}.xlsx`);');
  write(path, source);
}

{
  const path = "components/enterprise/pharmacy-reports-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    'const date = (value: string) => value ? new Date(value).toLocaleDateString("fr-FR") : "";\n',
    'const date = (value: string) => value ? new Date(value).toLocaleDateString("fr-FR") : "";\nfunction reportTypeBusinessLabel(value: string) { return tabs.find((item) => item[2] === value)?.[1] || "Rapport pharmacie"; }\nfunction visibilityBusinessLabel(value: string) { return ({ PRIVATE: "Privée", PERSONAL: "Personnelle", ORGANIZATION: "Organisation", SHARED: "Partagée" } as Record<string, string>)[value] || "Vue enregistrée"; }\nfunction statusBusinessLabel(value?: string) { if (!value) return ""; return ({ VALIDATED: "Validé", APPROVED: "Approuvé", PENDING: "En attente", PENDING_APPROVAL: "En attente d’approbation", COMPLETED: "Terminé", GENERATED: "Généré", READY: "Disponible", SUCCESS: "Réussi", FAILED: "Échec", CANCELLED: "Annulé", ARCHIVED: "Archivé" } as Record<string, string>)[value] || value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }\nfunction optionLabel(value: string | undefined, options: Option[]) { if (!value) return value; return options.find((item) => item.id === value)?.label || "Sélection active"; }\n');
  source = replaceOnce(path, source,
    '  const current = data?.sections[active]; const reportType = tabs.find((item) => item[0] === active)?.[2] || "PHARMACY_OVERVIEW";\n  const professionalReport = useMemo(() => current ? buildPharmacyProfessionalReport({ organizationName, reportType, section: current, filters }) : null, [current, filters, organizationName, reportType]);\n',
    '  const current = data?.sections[active]; const reportType = tabs.find((item) => item[0] === active)?.[2] || "PHARMACY_OVERVIEW";\n  const professionalFilters = useMemo<Filters>(() => ({ ...filters, productId: optionLabel(filters.productId, data?.options.products || []), batchId: optionLabel(filters.batchId, data?.options.batches || []), supplierId: optionLabel(filters.supplierId, data?.options.suppliers || []), userId: optionLabel(filters.userId, data?.options.members || []), departmentId: optionLabel(filters.departmentId, data?.options.departments || []), status: statusBusinessLabel(filters.status) || undefined }), [data?.options, filters]);\n  const professionalReport = useMemo(() => current ? buildPharmacyProfessionalReport({ organizationName, reportType, section: current, filters: professionalFilters }) : null, [current, organizationName, professionalFilters, reportType]);\n');
  source = replaceOnce(path, source, 'placeholder="Ex. VALIDATED"', 'placeholder="Ex. Validé"');
  source = replaceOnce(path, source,
    '<span className="block text-xs text-dtsc-muted">{view.reportType} · {view.visibility}</span>',
    '<span className="block text-xs text-dtsc-muted">{reportTypeBusinessLabel(view.reportType)} · {visibilityBusinessLabel(view.visibility)}</span>');
  source = replaceOnce(path, source,
    '<History title="Historique des exports" rows={(data?.exports || []).map((item) => [item.reportName, `${item.format} · ${item.status} · ${date(item.exportedAt)}`])} /><History title="Snapshots décisionnels" rows={(data?.snapshots || []).map((item) => [item.snapshotName, `${item.reportType} · ${date(item.generatedAt)}`])} />',
    '<History title="Historique des exports" rows={(data?.exports || []).map((item) => [item.reportName, `${item.format} · ${statusBusinessLabel(item.status)} · ${date(item.exportedAt)}`])} /><History title="Snapshots décisionnels" rows={(data?.snapshots || []).map((item) => [item.snapshotName, `${reportTypeBusinessLabel(item.reportType)} · ${date(item.generatedAt)}`])} />');
  write(path, source);
}

{
  const path = "lib/reporting/payroll-professional-report.ts";
  let source = read(path);
  source = replaceOnce(path, source,
    'function employeeName(item: PayrollItem) {\n',
    'function payrollStatus(value: string | null | undefined, en: boolean) { const labels: Record<string, [string, string]> = { OPEN: ["Ouverte", "Open"], CLOSED: ["Clôturée", "Closed"], PREPARED: ["Préparée", "Prepared"], PENDING_APPROVAL: ["En attente d’approbation", "Pending approval"], APPROVED: ["Approuvée", "Approved"], REJECTED: ["Rejetée", "Rejected"], CANCELLED: ["Annulée", "Cancelled"], GENERATED: ["Disponible", "Available"] }; return labels[String(value || "")]?.[en ? 1 : 0] || (en ? "Available" : "Disponible"); }\nfunction employeeName(item: PayrollItem) {\n');
  source = replaceOnce(path, source,
    '    generatedLabel: en ? `Report prepared from the authorized payroll run · status ${String(run.status || "").replace(/_/g, " ")}` : `Rapport préparé à partir de la paie autorisée · statut ${String(run.status || "").replace(/_/g, " ")}`,',
    '    generatedLabel: en ? `Report prepared from the authorized payroll run · ${payrollStatus(run.status, true)}` : `Rapport préparé à partir de la paie autorisée · ${payrollStatus(run.status, false)}`,');
  write(path, source);
}

{
  const path = "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx";
  let source = read(path);
  source = replaceOnce(path, source,
    '  const activeCollection = tab === "RUNS" ? runs : periods;\n  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: runs.items.find((run) => run.id !== detail.id && run.currency === detail.currency) || null }) : null, [detail, locale, organizationName, runs.items]);\n',
    '  const activeCollection = tab === "RUNS" ? runs : periods;\n  const previousPayrollRun = useMemo(() => { if (!detail) return null; const currentStart = Date.parse(detail.payrollPeriod.periodStart); return runs.items.filter((run) => run.id !== detail.id && run.currency === detail.currency && Date.parse(run.payrollPeriod.periodStart) < currentStart).sort((left, right) => Date.parse(right.payrollPeriod.periodStart) - Date.parse(left.payrollPeriod.periodStart))[0] || null; }, [detail, runs.items]);\n  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: previousPayrollRun }) : null, [detail, locale, organizationName, previousPayrollRun]);\n');
  write(path, source);
}

{
  const path = "app/enterprise-modules/RETAIL_POS/consolidated-report/page.tsx";
  let source = read(path);
  source = replaceOnce(path, source, 'import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";\n', 'import { ProfessionalReportView } from "@/components/reports/professional-report-view";\n');
  source = replaceOnce(path, source,
    'import { getRetailFunctionalCurrencySummary } from "@/lib/enterprise/retail/fx-reporting";\n',
    'import { getRetailFunctionalCurrencySummary } from "@/lib/enterprise/retail/fx-reporting";\nimport { buildRetailProfessionalReport } from "@/lib/reporting/retail-professional-report";\n');
  source = replaceOnce(path, source, 'select: { name: true }', 'select: { name: true, logoUrl: true }');
  source = replaceOnce(path, source,
    '  const locale = user.locale === "en" ? "en" : "fr";\n  const target = consolidated.targetCurrencyCode || "—";\n',
    '  const locale = user.locale === "en" ? "en" : "fr";\n  const target = consolidated.targetCurrencyCode || "—";\n  const periodLabel = period === "TODAY" ? (locale === "fr" ? "Aujourd’hui" : "Today") : period === "7D" ? (locale === "fr" ? "7 jours" : "7 days") : (locale === "fr" ? "30 jours" : "30 days");\n  const professionalReport = buildRetailProfessionalReport({ organizationName: organization.name, locale, periodLabel, from, to, native, consolidated });\n');
  source = replaceOnce(path, source,
    '          </div>\n\n          <ModuleSection title={locale === "fr" ? "État de la consolidation" : "Consolidation status"}',
    '          </div>\n\n          <ProfessionalReportView model={professionalReport} locale={locale} logoUrl={organization.logoUrl} />\n\n          <ModuleSection title={locale === "fr" ? "État de la consolidation" : "Consolidation status"}');
  source = replaceOnce(path, source,
    '<StatusBadge tone={consolidated.complete ? "success" : "warning"}>{consolidated.complete ? "COMPLETE" : "INCOMPLETE"}</StatusBadge>',
    '<StatusBadge tone={consolidated.complete ? "success" : "warning"}>{consolidated.complete ? (locale === "fr" ? "Complète" : "Complete") : (locale === "fr" ? "Suspendue" : "Withheld")}</StatusBadge>');
  source = replaceRegex(path, source,
    /\n          \{consolidated\.complete && consolidated\.metrics && consolidated\.targetCurrencyCode \? <ModuleMetrics[\s\S]*?<\/ModuleMetrics> : null\}\n/,
    '\n');
  source = replaceOnce(path, source,
    '{rate.pair} · {rate.rate} · {rate.direction}',
    '{rate.pair} · {rate.rate} · {rate.direction === "INVERSE" ? (locale === "fr" ? "taux inversé" : "inverse rate") : (locale === "fr" ? "taux direct" : "direct rate")}');
  write(path, source);
}

console.log("Hotfix #317 final report polish applied.");
