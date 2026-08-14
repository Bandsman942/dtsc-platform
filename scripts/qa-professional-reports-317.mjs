import fs from "node:fs";
import process from "node:process";

const failures = [];

function read(path) {
  if (!fs.existsSync(path)) {
    failures.push(`Fichier introuvable: ${path}`);
    return "";
  }
  return fs.readFileSync(path, "utf8");
}
function expect(path, source, pattern, label) {
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) failures.push(`${path}: contrat absent — ${label}`);
}
function forbid(path, source, pattern, label) {
  const hit = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (hit) failures.push(`${path}: interdit — ${label}`);
}

const viewPath = "components/reports/professional-report-view.tsx";
const view = read(viewPath);
expect(viewPath, view, "data-professional-report", "primitive de rapport partagée");
expect(viewPath, view, "data-report-kpis", "cartes KPI");
expect(viewPath, view, "data-report-chart", "graphique accessible");
expect(viewPath, view, "data-report-insights", "interprétations déterministes");
expect(viewPath, view, "data-report-filters", "périmètre/filtres");
expect(viewPath, view, "data-report-table", "tableau de métriques détaillées");
expect(viewPath, view, "Search report detail", "recherche interactive dans le détail");
expect(viewPath, view, "downloadProfessionalCsv", "export CSV");
expect(viewPath, view, "downloadProfessionalXlsx", "export Excel");
expect(viewPath, view, "downloadProfessionalPdf", "export PDF");
expect(viewPath, view, "logoUrl", "branding logo client");
expect(viewPath, view, "accentHex", "branding accent/fallback DTSC");
forbid(viewPath, view, /JSON\.stringify\s*\(/, "aucun dump JSON dans la primitive visuelle");

const exportPath = "lib/reporting/professional-export.ts";
const exporter = read(exportPath);
expect(exportPath, exporter, 'name="Synthèse"', "feuille Excel de synthèse");
expect(exportPath, exporter, 'name="Données"', "feuille Excel de données");
expect(exportPath, exporter, 'name="Interprétation"', "feuille Excel d’interprétation");
expect(exportPath, exporter, "xl/charts/chart1.xml", "graphique Excel natif");
expect(exportPath, exporter, "const chartStart = 8 + model.kpis.length", "référence dynamique du graphique Excel après les KPI");
expect(exportPath, exporter, "xlsxAccent", "accent de marque dans Excel");
expect(exportPath, exporter, "model.kpis", "KPI dans les exports");
expect(exportPath, exporter, "model.insights", "interprétation dans les exports");
expect(exportPath, exporter, "PDF-1.4", "génération PDF");
expect(exportPath, exporter, "ArrayBuffer", "Blob XLSX binaire stable");

const enterprisePath = "components/enterprise/core-v2/enterprise-reports-workspace.tsx";
const enterprise = read(enterprisePath);
expect(enterprisePath, enterprise, "ProfessionalReportView", "Enterprise Reports utilise la primitive professionnelle");
expect(enterprisePath, enterprise, "buildEnterpriseProfessionalReport", "projection métier Enterprise Reports");
expect(enterprisePath, enterprise, "organizationLogoUrl", "branding client propagé");
forbid(enterprisePath, enterprise, "SnapshotView", "ancienne vue snapshot brute supprimée");
forbid(enterprisePath, enterprise, /<pre[\s>]/, "aucun bloc pre pour dump de rapport");
forbid(enterprisePath, enterprise, /JSON\.stringify\s*\([^)]*snapshot/i, "aucun JSON snapshot rendu");
forbid(enterprisePath, enterprise, "HALF_UP_2", "politique d’arrondi technique invisible");
forbid(enterprisePath, enterprise, "CANONICAL_BUDGET_AND_APPROVED_EXPENSES", "code source technique invisible");

const enterpriseProjectionPath = "lib/reporting/enterprise-professional-report.ts";
const enterpriseProjection = read(enterpriseProjectionPath);
expect(enterpriseProjectionPath, enterpriseProjection, "ProfessionalReportExportModel", "projection vers le contrat partagé");
forbid(enterpriseProjectionPath, enterpriseProjection, "HALF_UP_2", "arrondi interne non projeté");
forbid(enterpriseProjectionPath, enterpriseProjection, "CANONICAL_BUDGET_AND_APPROVED_EXPENSES", "source interne non projetée");

const enterpriseExportPath = "app/api/enterprise/[organizationId]/reports/[id]/export/route.ts";
const enterpriseExport = read(enterpriseExportPath);
expect(enterpriseExportPath, enterpriseExport, "getEnterpriseFinanceAccess", "RBAC Enterprise conservé");
expect(enterpriseExportPath, enterpriseExport, "enterpriseReportVisibilityWhere", "visibilité utilisateur conservée");
expect(enterpriseExportPath, enterpriseExport, "buildEnterpriseProfessionalReport", "CSV serveur utilise la projection métier");
expect(enterpriseExportPath, enterpriseExport, "writeAuditLog", "audit export conservé");
forbid(enterpriseExportPath, enterpriseExport, "sourcePolicyCode", "code source non exposé dans CSV");
forbid(enterpriseExportPath, enterpriseExport, "roundingPolicyCode", "code d’arrondi non exposé dans CSV");
forbid(enterpriseExportPath, enterpriseExport, /JSON\.stringify\s*\(/, "aucun JSON brut dans CSV");

const financeApiPath = "app/api/enterprise/[organizationId]/financial-statements/[id]/route.ts";
const financeApi = read(financeApiPath);
expect(financeApiPath, financeApi, 'authorizeFinanceRequest(req, organizationId, "FINANCE_STATEMENTS", "view")', "autorisation Finance sur le détail");
expect(financeApiPath, financeApi, "where: { id, organizationId }", "isolation tenant du snapshot financier");
expect(financeApiPath, financeApi, "snapshotJson: true", "snapshot chargé uniquement par la route protégée de détail");
expect(financeApiPath, financeApi, "writeApiLog", "journalisation API Finance");

const financeDialogPath = "components/reports/financial-statement-report-dialog.tsx";
const financeDialog = read(financeDialogPath);
expect(financeDialogPath, financeDialog, "ProfessionalReportView", "état financier rendu professionnellement");
expect(financeDialogPath, financeDialog, "buildFinancialStatementProfessionalReport", "projection financière");
expect(financeDialogPath, financeDialog, 'cache: "no-store"', "détail financier non mis en cache navigateur");

const financeProjectionPath = "lib/reporting/finance-professional-report.ts";
const financeProjection = read(financeProjectionPath);
for (const code of ["TRIAL_BALANCE", "GENERAL_LEDGER", "JOURNALS", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "AR_AGING", "AP_AGING", "TREASURY", "BUDGET_VS_ACTUAL", "TAX", "ASSET_REGISTER", "INVENTORY_VALUATION"]) {
  expect(financeProjectionPath, financeProjection, code, `projection état financier ${code}`);
}
expect(financeProjectionPath, financeProjection, "safeKeys", "champs techniques exclus des tableaux");
expect(financeProjectionPath, financeProjection, "insights", "interprétation financière");

const advancedFinancePath = "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx";
const advancedFinance = read(advancedFinancePath);
expect(advancedFinancePath, advancedFinance, "FinancialStatementReportDialog", "états financiers raccordés au rapport professionnel");
expect(advancedFinancePath, advancedFinance, "organizationLogoUrl", "logo client transmis aux états financiers");

const payrollPath = "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx";
const payroll = read(payrollPath);
expect(payrollPath, payroll, "ProfessionalReportView", "paie rendue via la primitive professionnelle");
expect(payrollPath, payroll, "buildPayrollProfessionalReport", "projection professionnelle de paie");
expect(payrollPath, payroll, "previousPayrollRun", "comparaison avec une période antérieure");
expect(payrollPath, payroll, "Date.parse(run.payrollPeriod.periodStart) < currentStart", "comparaison strictement antérieure");
expect(payrollPath, payroll, "organizationLogoUrl", "branding client en paie");

const payrollProjectionPath = "lib/reporting/payroll-professional-report.ts";
const payrollProjection = read(payrollProjectionPath);
expect(payrollProjectionPath, payrollProjection, "Gross payroll", "KPI paie EN");
expect(payrollProjectionPath, payrollProjection, "Masse salariale brute", "KPI paie FR");
expect(payrollProjectionPath, payrollProjection, "payrollStatus", "statuts de paie projetés en libellés métier");
forbid(payrollProjectionPath, payrollProjection, /status \$\{String\(run\.status/, "statut technique de paie non affiché brut");

const pharmacyPath = "components/enterprise/pharmacy-reports-workspace.tsx";
const pharmacy = read(pharmacyPath);
expect(pharmacyPath, pharmacy, "ProfessionalReportView", "Pharmacie utilise la primitive professionnelle");
expect(pharmacyPath, pharmacy, "buildPharmacyProfessionalReport", "projection Pharmacie");
expect(pharmacyPath, pharmacy, "optionLabel", "UUID de filtres projetés vers des libellés");
expect(pharmacyPath, pharmacy, "reportTypeBusinessLabel", "types de rapports Pharmacie projetés");
expect(pharmacyPath, pharmacy, "statusBusinessLabel", "statuts Pharmacie projetés");
forbid(pharmacyPath, pharmacy, 'placeholder="Ex. VALIDATED"', "enum technique Pharmacie dans l’UI");

const retailPagePath = "app/enterprise-modules/RETAIL_POS/consolidated-report/page.tsx";
const retailPage = read(retailPagePath);
expect(retailPagePath, retailPage, "ProfessionalReportView", "Retail utilise la primitive professionnelle");
expect(retailPagePath, retailPage, "buildRetailProfessionalReport", "projection Retail");
expect(retailPagePath, retailPage, "organization.logoUrl", "branding Retail");
forbid(retailPagePath, retailPage, '>COMPLETE<', "statut technique COMPLETE invisible");
forbid(retailPagePath, retailPage, '>INCOMPLETE<', "statut technique INCOMPLETE invisible");

const retailProjectionPath = "lib/reporting/retail-professional-report.ts";
const retailProjection = read(retailProjectionPath);
expect(retailProjectionPath, retailProjection, "missingRates", "absence de taux traitée explicitement");
expect(retailProjectionPath, retailProjection, "does not present a partial monetary consolidation", "pas de consolidation multi-devise partielle en EN");
expect(retailProjectionPath, retailProjection, "ne présente pas de consolidation monétaire partielle", "pas de consolidation multi-devise partielle en FR");

const modulePagePath = "app/enterprise-modules/[moduleCode]/page.tsx";
const modulePage = read(modulePagePath);
expect(modulePagePath, modulePage, "logoUrl: true", "logo organisation récupéré pour branding rapports");
expect(modulePagePath, modulePage, "organizationLogoUrl={organization.logoUrl}", "logo propagé aux workspaces");

const financePagePath = "components/enterprise/enterprise-finance-module-page.tsx";
const financePage = read(financePagePath);
expect(financePagePath, financePage, "logoUrl: true", "branding Finance récupéré");
expect(financePagePath, financePage, "organizationLogoUrl={organization.logoUrl}", "branding Finance propagé");

for (const path of [
  "scripts/tmp-hotfix-317-integrate-reports.mjs",
  ".github/workflows/tmp-hotfix-317-integrate.yml",
  "scripts/tmp-hotfix-317-polish-reports.mjs",
  ".github/workflows/tmp-hotfix-317-polish.yml",
]) {
  if (fs.existsSync(path)) failures.push(`${path}: interdit — outil temporaire présent dans le diff livrable`);
}

if (failures.length) {
  console.error("FAIL QA Professional Reports #317");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QA Professional Reports #317 réussie.");
console.log("- UI: KPI, graphiques, filtres, recherche, interprétation, tableaux.");
console.log("- Exports: CSV, Excel multi-feuilles + graphique, PDF professionnel.");
console.log("- Couverture: Enterprise Reports, Finance, Paie, Pharmacie, Retail.");
console.log("- Sécurité: RBAC/visibilité/tenant Finance et Enterprise conservés.");
console.log("- Présentation: aucun JSON brut ni code de politique du rapport initial dans les surfaces gardées.");