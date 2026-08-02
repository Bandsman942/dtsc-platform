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

const files = {
  router: "components/enterprise/professional/enterprise-operational-finance-workspace.tsx",
  page: "components/enterprise/enterprise-finance-module-page.tsx",
  overview: "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  invoices: "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  payments: "components/enterprise/professional/enterprise-finance-payments-treasury-workspace.tsx",
  cashBank: "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx",
  shared: "components/enterprise/professional/finance-professional-workspace-shared.tsx",
  language: "components/enterprise/professional/finance-professional-ui.ts",
  comments: "app/api/enterprise/[organizationId]/finance-comments/[entityType]/[entityId]/route.ts",
  bankDetail: "app/api/enterprise/[organizationId]/bank-statements/[statementId]/route.ts",
  reconciliationDetail: "app/api/enterprise/[organizationId]/reconciliations/[reconciliationId]/route.ts",
  lookups: "app/api/enterprise/[organizationId]/operational-lookups/route.ts",
  schema: "prisma/enterprise-finance-professional.prisma",
  migration: "prisma/migrations/20260802123000_erp_professional_finance_comments/migration.sql",
  readiness: "lib/enterprise/module-commercial-readiness-iteration-04.json",
  manualE2e: "docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_04.md",
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
    for (const marker of ["Assistant de configuration", "Checklist de préparation", "Actions recommandées", "financeMetricLabel", "functionalCurrencyCode", "reconciliationTolerance"]) need(content.overview, marker, "Vue d’ensemble Finance");
    reject(content.overview, "hasFiscalYear}", "Libellés métier");
  },
  receivables() {
    for (const marker of ["Nouvelle facture client", "Factures clients", "Créances", "Avoirs", "Échéances", "Créer un avoir", "FinanceCollaboration", "sales-credit-notes", "PENDING_APPROVAL"]) need(content.invoices, marker, "Créances professionnelles");
  },
  payables() {
    for (const marker of ["Nouvelle facture fournisseur", "Factures fournisseurs", "Dettes", "Avoirs fournisseurs", "Contrôle commande-réception-facture", "supplier-credit-notes", "threeWayMatch"]) need(content.invoices, marker, "Dettes professionnelles");
  },
  payments() {
    for (const marker of ["Nouveau paiement", "Affecter le paiement", "unallocatedAmount", "targetId", "idempotencyKey", "PAYROLL_PAYMENT", "REVERSE", "FinanceCollaboration"]) need(content.payments, marker, "Paiements professionnels");
  },
  treasury() {
    for (const marker of ["Nouveau compte financier", "Nouveau transfert", "maskedReference", "sourceFinancialAccountId", "targetFinancialAccountId", "exchangeRate", "ledgerAccountId"]) need(content.payments, marker, "Trésorerie professionnelle");
  },
  cash() {
    for (const marker of ["Ouvrir une session de caisse", "Assistant de clôture de caisse", "Comptage physique", "Validation indépendante", "PENDING_VALIDATION", "countedClosingAmount"]) need(content.cashBank, marker, "Caisse professionnelle");
  },
  bank() {
    for (const marker of ["Importer un relevé bancaire", "accept=\".csv,text/csv\"", "5 * 1024 * 1024", "parseBankCsv", "Prévisualisation", "safeText", "bank-statements"]) need(content.cashBank, marker, "Banque professionnelle");
    for (const marker of ["authorizeFinanceRequest", "organizationId", "lines", "maskedReference", "writeApiLog"]) need(content.bankDetail, marker, "Détail relevé sécurisé");
  },
  reconciliation() {
    for (const marker of ["Créer un rapprochement", "Nouvelle correspondance", "matchedAmount", "Une ambiguïté", "completeReconciliation", "reconciliations"] ) need(content.cashBank, marker, "Rapprochement professionnel");
    for (const marker of ["authorizeFinanceRequest", "organizationId", "statementLines", "matches", "writeApiLog"]) need(content.reconciliationDetail, marker, "Détail rapprochement sécurisé");
  },
  language() {
    for (const marker of ["Paiements non affectés", "Contrôle commande-réception-facture", "Partiellement payé", "Clôture provisoire", "Premier entré, premier sorti", "Une autre personne autorisée"]) need(content.language + content.invoices + content.payments, marker, "Français Finance");
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
  readiness() {
    let readiness;
    try { readiness = JSON.parse(content.readiness); } catch (error) { failures.push(`Maturité Finance: JSON invalide (${error instanceof Error ? error.message : "unknown"})`); return; }
    for (const code of modules) {
      const entry = readiness.moduleOverrides?.[code];
      if (!entry) { failures.push(`Maturité Finance: module absent ${code}`); continue; }
      if (entry.maturity !== "PROFESSIONAL_READY") failures.push(`${code}: maturité attendue PROFESSIONAL_READY`);
      if (entry.commercializable !== false) failures.push(`${code}: commercializable doit rester false`);
      if (!entry.criteriaMissing?.includes("owner-authenticated-manual-e2e-validation")) failures.push(`${code}: validation manuelle propriétaire non signalée`);
    }
    need(content.manualE2e, "Tests E2E manuels préparés — validation du propriétaire en attente", "Statut E2E honnête");
    reject(content.manualE2e, "Tests E2E réussis", "Statut E2E honnête");
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
  "commercial-readiness": ["readiness"],
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
