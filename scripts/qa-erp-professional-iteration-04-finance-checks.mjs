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
const need = (content, marker, scope) => {
  if (!content.includes(marker)) failures.push(`${scope}: marqueur manquant « ${marker} »`);
};
const reject = (content, marker, scope) => {
  if (content.includes(marker)) failures.push(`${scope}: marqueur interdit « ${marker} »`);
};
const needLocalized = ({ component, key, fr, en, scope }) => {
  need(component, `t("${key}")`, scope);
  need(content.financeFr, `"${key}": "${fr}"`, `${scope} · catalogue FR`);
  need(content.financeEn, `"${key}": "${en}"`, `${scope} · catalogue EN`);
};

const files = {
  router: "components/enterprise/professional/enterprise-operational-finance-workspace.tsx",
  page: "components/enterprise/enterprise-finance-module-page.tsx",
  overview: "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  invoices: "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  payments: "components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx",
  cashBank: "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx",
  shared: "components/enterprise/professional/finance-professional-workspace-shared.tsx",
  professionalUi: "components/enterprise/professional/professional-erp-ui.tsx",
  language: "components/enterprise/professional/finance-professional-ui.ts",
  financeFr: "locales/enterprise-finance.fr.json",
  financeEn: "locales/enterprise-finance.en.json",
  comments: "app/api/enterprise/[organizationId]/finance-comments/[entityType]/[entityId]/route.ts",
  bankDetail: "app/api/enterprise/[organizationId]/bank-statements/[statementId]/route.ts",
  reconciliationDetail: "app/api/enterprise/[organizationId]/reconciliations/[sessionId]/route.ts",
  lookups: "app/api/enterprise/[organizationId]/operational-lookups/route.ts",
  schema: "prisma/enterprise-finance-professional.prisma",
  migration: "prisma/migrations/20260802123000_erp_professional_finance_comments/migration.sql",
  readiness: "lib/enterprise/module-commercial-readiness-iteration-04.json",
  financeGuides: "lib/enterprise/finance-user-guides.ts",
  helpCenter: "app/help/enterprise/page.tsx",
  manualE2e: "docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_04.md",
  commercialAcceptance: "docs/ERP_ITERATION_04_COMMERCIAL_ACCEPTANCE.md",
  navigation: "lib/navigation/company-relationships.ts",
  desktopNav: "components/layout/nav-links.tsx",
  mobileNav: "components/dtsc/mobile-shell.tsx",
};
const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const modules = ["FINANCE_OVERVIEW", "FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS", "FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"];

const checks = {
  routing() {
    for (const code of modules) need(content.router, `"${code}"`, "Routage Finance dédié");
    need(content.page, "EnterpriseOperationalFinanceWorkspace", "Page Finance");
    need(content.page, "OPERATIONAL_FINANCE_MODULE_CODES", "Page Finance");
  },
  overview() {
    // Iteration 04 originally asserted two French literals directly in the component.
    // The canonical i18n convergence keeps the same business capabilities while moving
    // customer copy into enterprise-finance FR/EN catalogs. Require the rendered keys,
    // the server-driven diagnostic authority, and both canonical translations instead.
    for (const marker of [
      'financeT(locale, "setupAssistant")',
      "DiagnosticCard",
      "diagnostics",
      'financeT(locale, "recommendedActions")',
      "financeMetricLabel",
      "functionalCurrencyCode",
      "reconciliationTolerance",
    ]) need(content.overview, marker, "Vue d’ensemble Finance");
    for (const marker of [
      '"setupAssistant": "Assistant de mise en service"',
      '"recommendedActions": "Actions recommandées"',
    ]) need(content.financeFr, marker, "Catalogue Finance FR");
    for (const marker of [
      '"setupAssistant": "Setup assistant"',
      '"recommendedActions": "Recommended actions"',
    ]) need(content.financeEn, marker, "Catalogue Finance EN");
    reject(content.overview, "Assistant de configuration", "Ancien assistant Finance interdit");
    reject(content.overview, "Checklist de préparation", "Ancienne checklist Finance interdite");
    reject(content.overview, "const steps = useMemo", "Checklist locale Finance interdite");
    reject(content.overview, "checklist.hasFunctionalCurrency", "Contrat checklist legacy interdit");
  },
  receivables() {
    for (const localized of [
      { key: "newCustomerInvoice", fr: "Nouvelle facture client", en: "New customer invoice" },
      { key: "customerInvoices", fr: "Factures clients", en: "Customer invoices" },
      { key: "receivables", fr: "Créances", en: "Receivables" },
      { key: "creditNotes", fr: "Avoirs", en: "Credit notes" },
      { key: "dueDates", fr: "Échéances", en: "Due dates" },
      { key: "createCreditNote", fr: "Créer un avoir", en: "Create credit note" },
    ]) needLocalized({ component: content.invoices, ...localized, scope: "Créances professionnelles" });
    for (const marker of ["FinanceCollaboration", "sales-credit-notes", "PENDING_APPROVAL"]) need(content.invoices, marker, "Créances professionnelles");
  },
  payables() {
    for (const localized of [
      { key: "newSupplierInvoice", fr: "Nouvelle facture fournisseur", en: "New supplier invoice" },
      { key: "supplierInvoices", fr: "Factures fournisseurs", en: "Supplier invoices" },
      { key: "payables", fr: "Dettes", en: "Payables" },
      { key: "supplierCreditNotes", fr: "Avoirs fournisseurs", en: "Supplier credit notes" },
      { key: "poReceiptInvoiceControl", fr: "Contrôle commande-réception-facture", en: "Purchase order, receipt and invoice control" },
    ]) needLocalized({ component: content.invoices, ...localized, scope: "Dettes professionnelles" });
    for (const marker of ["supplier-credit-notes", "threeWayMatch"]) need(content.invoices, marker, "Dettes professionnelles");
  },
  payments() {
    for (const localized of [
      { key: "newPayment", fr: "Nouveau paiement", en: "New payment" },
      { key: "allocatePayment", fr: "Affecter le paiement", en: "Allocate payment" },
    ]) needLocalized({ component: content.payments, ...localized, scope: "Paiements professionnels" });
    for (const marker of ["unallocatedAmount", "targetId", "idempotencyKey", "PAYROLL_PAYMENT", "REVERSE", "FinanceCollaboration"]) need(content.payments, marker, "Paiements professionnels");
  },
  treasury() {
    for (const localized of [
      { key: "newFinancialAccount", fr: "Nouveau compte financier", en: "New financial account" },
      { key: "newTransfer", fr: "Nouveau transfert", en: "New transfer" },
    ]) needLocalized({ component: content.payments, ...localized, scope: "Trésorerie professionnelle" });
    for (const marker of ["maskedReference", "sourceFinancialAccountId", "targetFinancialAccountId", "exchangeRate", "ledgerAccountId"]) need(content.payments, marker, "Trésorerie professionnelle");
  },
  cash() {
    for (const marker of ["Ouvrir une session de caisse", "Assistant de clôture de caisse", "Comptage physique", "Validation indépendante", "PENDING_VALIDATION", "countedClosingAmount"]) need(content.cashBank, marker, "Caisse professionnelle");
  },
  bank() {
    for (const marker of ["Importer un relevé bancaire", "accept=\".csv,text/csv\"", "5 * 1024 * 1024", "parseBankCsv", "Prévisualisation", "safeText", "bank-statements"]) need(content.cashBank, marker, "Banque professionnelle");
    for (const marker of ["authorizeFinanceRequest", "organizationId", "lines", "maskedReference", "writeApiLog"]) need(content.bankDetail, marker, "Détail relevé sécurisé");
  },
  reconciliation() {
    for (const marker of ["Créer un rapprochement", "Nouvelle correspondance", "matchedAmount", "Une ambiguïté", "completeReconciliation", "reconciliations"]) need(content.cashBank, marker, "Rapprochement professionnel");
    for (const marker of ["authorizeFinanceRequest", "organizationId", "statementLines", "matches", "writeApiLog"]) need(content.reconciliationDetail, marker, "Détail rapprochement sécurisé");
  },
  language() {
    for (const marker of ["Paiements non affectés", "Partiellement payé", "Clôture provisoire", "Premier entré, premier sorti", "Une autre personne autorisée"]) need(content.language + content.invoices + content.payments, marker, "Français Finance");
    needLocalized({ component: content.invoices, key: "poReceiptInvoiceControl", fr: "Contrôle commande-réception-facture", en: "Purchase order, receipt and invoice control", scope: "Français Finance" });
    reject(content.language, "metricLabel(\"", "Libellés automatiques interdits");
  },
  mobile() {
    for (const marker of ["h-[94dvh]", "h-[96dvh]", "inputMode=\"decimal\"", "sticky bottom-0", "data-responsive-actions"]) need(content.overview + content.invoices + content.payments + content.cashBank, marker, "Finance mobile");
  },
  deeplinks() {
    for (const marker of ["useSearchParams", "invoiceId", "paymentId", "cashSessionId", "statementId", "reconciliationId"]) need(content.invoices + content.payments + content.cashBank, marker, "Liens profonds Finance");
    for (const marker of ["sourceEntityType", "sourceEntityId", "action=upload"]) need(content.shared, marker, "Liens documents Finance");
  },
  security() {
    for (const marker of ["authorizeFinanceRequest", "financeEntityExists", "authorUserId !== context.auth.session.userId", "archivedAt", "writeAuditLog", "mutation: true"]) need(content.comments, marker, "Commentaires Finance sécurisés");
    for (const marker of ["FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS", "FINANCE_RECONCILIATION", "authorizeFinanceRequest", "organizationId"]) need(content.lookups, marker, "Sélecteurs Finance tenant-safe");
  },
  integrity() {
    for (const marker of ["@@index([organizationId, entityType, entityId", "revision", "archivedAt"]) need(content.schema, marker, "Schéma Finance collaboratif");
    for (const marker of ["CREATE TABLE \"EnterpriseFinanceComment\"", "EnterpriseFinanceComment_scope_idx", "EnterpriseFinanceComment_author_idx"]) need(content.migration, marker, "Migration additive Finance");
  },
  guides() {
    need(content.helpCenter, "FINANCE_USER_GUIDES", "Centre d’aide Finance");
    need(content.professionalUi, "Guide utilisateur", "Accès aux guides depuis les modules");
    need(content.professionalUi, "/help/enterprise?module=", "Lien contextuel des guides");
    for (const code of modules) need(content.financeGuides, `${code}: {`, `Guide utilisateur ${code}`);
    for (const marker of ["Avant de commencer", "Procédure pas à pas", "Statuts et workflow", "Contrôles et confidentialité", "Dépannage"]) need(content.helpCenter, marker, "Structure du centre d’aide");
    for (const marker of ["format CSV réellement supporté", "auto-approbation", "période fermée", "allocations", "clôture", "suggestion ambiguë"]) need(content.financeGuides, marker, "Contenu métier des guides Finance");
  },
  readiness() {
    let readiness;
    try { readiness = JSON.parse(content.readiness); } catch (error) { failures.push(`Maturité Finance: JSON invalide (${error instanceof Error ? error.message : "unknown"})`); return; }
    for (const code of modules) {
      const entry = readiness.moduleOverrides?.[code];
      if (!entry) { failures.push(`Maturité Finance: module absent ${code}`); continue; }
      if (entry.maturity !== "COMMERCIAL_READY") failures.push(`${code}: maturité attendue COMMERCIAL_READY`);
      if (entry.commercializable !== true) failures.push(`${code}: commercializable doit être true`);
      if (entry.criteriaMissing?.length !== 0) failures.push(`${code}: aucun critère ne doit rester manquant`);
      if (!entry.criteriaSatisfied?.includes("owner-authenticated-manual-e2e-validation")) failures.push(`${code}: validation E2E propriétaire absente`);
      if (!entry.criteriaSatisfied?.includes("owner-commercial-acceptance")) failures.push(`${code}: acceptation commerciale propriétaire absente`);
      if (!entry.evidence?.includes("docs/ERP_ITERATION_04_COMMERCIAL_ACCEPTANCE.md")) failures.push(`${code}: attestation commerciale absente des preuves`);
    }
    need(content.manualE2e, "Campagne E2E manuelle : RÉUSSIE", "Statut E2E propriétaire");
    need(content.commercialAcceptance, "Décision du propriétaire", "Attestation commerciale");
    need(content.commercialAcceptance, "COMMERCIAL_READY", "Décision commerciale");
    reject(content.manualE2e, "validation du propriétaire en attente", "Statut E2E actualisé");
  },
  navigation() {
    for (const marker of ["COMPANY_RELATIONSHIPS", "/enterprise-links", "Relations avec les entreprises"]) need(content.navigation, marker, "Relations entreprises canonique");
    need(content.desktopNav, "pendingCompanyRelationships", "Navigation desktop relations");
    need(content.mobileNav, "pendingCompanyRelationships", "Navigation mobile relations");
  },
};

const aliases = {
  all: Object.keys(checks),
  "finance-overview": ["overview", "routing"],
  receivables: ["receivables", "deeplinks"],
  payables: ["payables", "deeplinks"],
  payments: ["payments", "security"],
  treasury: ["treasury", "security"],
  cash: ["cash", "mobile"],
  bank: ["bank", "security"],
  reconciliation: ["reconciliation", "security"],
  "french-language": ["language"],
  mobile: ["mobile"],
  "deep-links": ["deeplinks"],
  security: ["security"],
  integrity: ["integrity"],
  guides: ["guides"],
  "commercial-readiness": ["readiness", "guides"],
  "relationships-navigation": ["navigation"],
};
const selected = aliases[domain] || [domain];
for (const name of selected) {
  if (!checks[name]) failures.push(`Domaine QA inconnu: ${name}`);
  else checks[name]();
}
if (failures.length) {
  console.error(`QA ERP Finance itération 04: ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`QA ERP Finance itération 04 (${domain}): OK`);