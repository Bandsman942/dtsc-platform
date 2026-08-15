import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const domain = (process.argv[2] || "all").toLowerCase();
const failures = [];
const read = (file) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`Absent: ${file}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
};
const need = (contentValue, marker, scope) => {
  if (!contentValue.includes(marker)) failures.push(`${scope}: marqueur manquant « ${marker} »`);
};
const reject = (contentValue, marker, scope) => {
  if (contentValue.includes(marker)) failures.push(`${scope}: marqueur interdit « ${marker} »`);
};
const needLocalized = ({ component, key, fr, en, scope, renderMarker = `t("${key}")` }) => {
  need(component, renderMarker, scope);
  need(content.financeFr, `"${key}": "${fr}"`, `${scope} · catalogue FR`);
  need(content.financeEn, `"${key}": "${en}"`, `${scope} · catalogue EN`);
};

const files = {
  page: "components/enterprise/enterprise-finance-module-page.tsx",
  workspace: "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
  financeFr: "locales/enterprise-finance.fr.json",
  financeEn: "locales/enterprise-finance.en.json",
  accountingApi: "app/api/enterprise/[organizationId]/accounting-professional/route.ts",
  chartApi: "app/api/enterprise/[organizationId]/charts-of-accounts/route.ts",
  assetApi: "app/api/enterprise/[organizationId]/asset-accounting/route.ts",
  inventoryApi: "app/api/enterprise/[organizationId]/inventory-valuation/route.ts",
  reversal: "lib/enterprise/accounting/reversal-service.ts",
  access: "lib/enterprise/accounting/access.ts",
  inventory: "lib/enterprise/accounting/inventory-accounting-service.ts",
  statements: "app/api/enterprise/[organizationId]/financial-statements/route.ts",
  audit: "scripts/audit-financial-integrity.mjs",
  readiness: "lib/enterprise/module-commercial-readiness-iteration-05.json",
  readinessResolver: "lib/enterprise/module-commercial-readiness.ts",
  manualE2e: "docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_05.md",
  userGuide: "docs/ERP_ITERATION_05_USER_GUIDE.md",
  relationships: "lib/navigation/company-relationships.ts",
  desktopNav: "components/layout/nav-links.tsx",
  mobileNav: "components/dtsc/mobile-shell.tsx",
};
const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const modules = ["FINANCE_ACCOUNTING", "FINANCE_TAX", "FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS", "FINANCE_INVENTORY"];

const checks = {
  routing() {
    need(content.page, "EnterpriseAdvancedFinanceWorkspace", "Routage Finance avancée");
    need(content.page, "EnterpriseOperationalFinanceWorkspace", "Préservation Finance opérationnelle");
    reject(content.page, "EnterpriseFinanceWorkspace", "Retrait du workspace générique avancé");
    for (const code of modules) need(content.workspace, `${code}: [`, `Sections dédiées ${code}`);
  },
  accounting() {
    for (const marker of ["general-ledger", "trial-balance", "posting-rules", "anomalies", "EnterpriseJournalLine", "EnterprisePostingBatch"]) need(content.accountingApi, marker, "API Comptabilité professionnelle");
    for (const localized of [
      { key: "chartsOfAccounts", fr: "Plans comptables", en: "Charts of accounts", renderMarker: 'labelKey: "chartsOfAccounts"' },
      { key: "generalLedger", fr: "Grand livre", en: "General ledger", renderMarker: 'labelKey: "generalLedger"' },
      { key: "trialBalance", fr: "Balance générale", en: "Trial balance", renderMarker: 'labelKey: "trialBalance"' },
      { key: "postingRules", fr: "Règles de comptabilisation", en: "Posting rules", renderMarker: 'labelKey: "postingRules"' },
      { key: "actionReverse", fr: "Contrepasser", en: "Reverse", renderMarker: 't("actionReverse")' },
      { key: "post", fr: "Comptabiliser", en: "Post", renderMarker: 't("post")' },
    ]) needLocalized({ component: content.workspace, ...localized, scope: "Workspace Comptabilité" });
    for (const marker of ["createChartOfAccounts", "authorizeFinanceRequest", "writeAuditLog"]) need(content.chartApi, marker, "Plan comptable sécurisé");
  },
  integrity() {
    for (const marker of ["assertIndependentActor", "JOURNAL_ENTRY_SELF_REVERSAL_FORBIDDEN", "reversalOfEntryId", "idempotencyKey", "REVERSED"]) need(content.reversal, marker, "Contrepassation contrôlée");
    need(content.access, "EnterpriseAccountingError(errorCode, 409)", "Erreur métier de séparation des responsabilités");
    for (const marker of ["INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN", "idempotencyKey", "WEIGHTED_AVERAGE"]) need(content.inventory, marker, "Valorisation intègre");
    for (const marker of ["--organization-id", "--period-id", "--from-date", "--to-date", "--journal-id", "--account-id", "--json", "--output", "entryHeaderLineMismatches", "trialBalanceMismatch", "supplierInvoicesWithoutPayable", "duplicateReversals"]) need(content.audit, marker, "Audit financier borné");
  },
  advanced() {
    for (const localized of [
      { key: "taxCodesRates", fr: "Codes et taux fiscaux", en: "Tax codes and rates", renderMarker: 'labelKey: "taxCodesRates"' },
      { key: "financialCloses", fr: "Clôtures financières", en: "Financial closes", renderMarker: 'labelKey: "financialCloses"' },
      { key: "generatedPublishedVersions", fr: "Versions générées et publiées", en: "Generated and published versions", renderMarker: 'labelKey: "generatedPublishedVersions"' },
      { key: "fixedAssetRegister", fr: "Registre des immobilisations", en: "Fixed asset register", renderMarker: 'labelKey: "fixedAssetRegister"' },
      { key: "inventoryValuation", fr: "Valorisation du stock", en: "Inventory valuation", renderMarker: 'labelKey: "inventoryValuation"' },
    ]) needLocalized({ component: content.workspace, ...localized, scope: "Modules Finance avancée" });
    for (const marker of ["createAssetAccountingProfile", "availableAssets", "FINANCE_ASSETS"]) need(content.assetApi, marker, "Immobilisations professionnelles");
    for (const marker of ["publish", "EnterpriseFinancialStatementSnapshot", "authorizeFinanceRequest"]) need(content.statements, marker, "États financiers publiés");
    for (const marker of ["EnterpriseInventoryCostLayer", "LIMIT ${pageSize}", "inventoryItemName", "warehouseName", "weightedAverageUnitCost", "pagination"]) need(content.inventoryApi, marker, "Valorisation professionnelle paginée");
    reject(content.inventoryApi, "getInventoryValuation(", "Valorisation non paginée en mémoire");
  },
  languageMobile() {
    for (const marker of ["touch-pan-x", "overflow-x-auto", "inputMode=\"decimal\"", "text-base sm:text-sm"]) need(content.workspace, marker, "Responsive Finance avancée");
    for (const localized of [
      { key: "noDataForView", fr: "Aucune donnée pour cette vue", en: "No data for this view" },
      { key: "period", fr: "Période", en: "Period" },
      { key: "journalEntries", fr: "Écritures", en: "Journal entries", renderMarker: 'labelKey: "journalEntries"' },
      { key: "accumulatedDepreciation", fr: "Amortissements cumulés", en: "Accumulated depreciation" },
    ]) needLocalized({ component: content.workspace, ...localized, scope: "Langue Finance avancée" });
    reject(content.workspace, "EnterpriseJournalEntry", "Type Prisma visible dans le workspace");
  },
  readiness() {
    let readiness;
    try { readiness = JSON.parse(content.readiness); } catch (error) { failures.push(`Maturité itération 5: JSON invalide (${error instanceof Error ? error.message : "unknown"})`); return; }
    for (const code of modules) {
      const entry = readiness.moduleOverrides?.[code];
      if (!entry) { failures.push(`Maturité itération 5: module absent ${code}`); continue; }
      if (entry.maturity !== "PROFESSIONAL_READY") failures.push(`${code}: maturité attendue PROFESSIONAL_READY`);
      if (entry.commercializable !== false) failures.push(`${code}: commercializable doit rester false`);
      if (!entry.criteriaMissing?.includes("owner-authenticated-manual-e2e-validation")) failures.push(`${code}: validation manuelle propriétaire doit rester manquante`);
      if (entry.criteriaSatisfied?.includes("owner-authenticated-manual-e2e-validation")) failures.push(`${code}: validation E2E ne doit pas être inventée`);
    }
    need(content.readinessResolver, "iteration05Manifest", "Résolveur de maturité itération 5");
    need(content.manualE2e, "Tests E2E manuels préparés — validation du propriétaire en attente", "Statut E2E honnête");
    need(content.manualE2e, "NON_EXÉCUTÉ", "Scénarios manuels non exécutés");
    reject(content.manualE2e, "Campagne E2E manuelle : RÉUSSIE", "Réussite E2E inventée");
  },
  guides() {
    for (const marker of ["Configurer la comptabilité", "Créer une écriture manuelle", "Contrepasser", "Clôturer une période", "Capitaliser un actif", "Valoriser le stock"]) need(content.userGuide, marker, "Guide utilisateur itération 5");
  },
  navigation() {
    for (const marker of ["COMPANY_RELATIONSHIPS", "/enterprise-links", "Relations avec les entreprises"]) need(content.relationships, marker, "Relations entreprises canonique");
    need(content.desktopNav, "pendingCompanyRelationships", "Navigation desktop relations");
    need(content.mobileNav, "pendingCompanyRelationships", "Navigation mobile relations");
  },
};

const aliases = {
  all: Object.keys(checks),
  accounting: ["accounting", "routing"],
  "chart-of-accounts": ["accounting"],
  "periods-journals": ["accounting"],
  "journal-entries": ["accounting", "integrity"],
  "posting-rules": ["accounting", "integrity"],
  tax: ["advanced"],
  "financial-close": ["advanced", "integrity"],
  "financial-statements": ["advanced"],
  "fixed-assets": ["advanced", "integrity"],
  "inventory-valuation": ["advanced", "integrity"],
  integrity: ["integrity"],
  security: ["integrity", "navigation"],
  "french-language": ["languageMobile"],
  mobile: ["languageMobile"],
  "deep-links": ["routing"],
  "commercial-readiness": ["readiness", "guides"],
  "relationships-navigation": ["navigation"],
};

const selected = aliases[domain] || [domain];
for (const name of selected) {
  if (!checks[name]) failures.push(`Domaine QA inconnu: ${name}`);
  else checks[name]();
}

if (failures.length) {
  console.error(`QA ERP Comptabilité itération 05: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`QA ERP Comptabilité itération 05 (${domain}): OK`);
