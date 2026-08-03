import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scope = (process.argv[2] || "all").toLowerCase();
const failures = [];

function read(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) {
    failures.push(`Absent: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
}

function need(content, marker, label) {
  if (!content.includes(marker)) failures.push(`${label}: marqueur manquant « ${marker} »`);
}

function reject(content, marker, label) {
  if (content.includes(marker)) failures.push(`${label}: marqueur interdit « ${marker} »`);
}

const registry = read("lib/enterprise/module-registry.ts");
const convergence = read("lib/enterprise/module-registry-sector-convergence.json");
const cleanup = read("lib/enterprise/module-registry-final-cleanup.json");
const readiness = read("lib/enterprise/module-commercial-readiness-iteration-06.json");
const readinessResolver = read("lib/enterprise/module-commercial-readiness.ts");
const relationships = read("lib/navigation/company-relationships.ts");
const desktopNav = read("components/layout/nav-links.tsx");
const mobileNav = read("components/dtsc/mobile-shell.tsx");
const manualE2e = read("docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_06.md");
const finalManualE2e = read("docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_FINAL_PROGRAM.md");
const userGuide = read("docs/ERP_ITERATION_06_USER_GUIDE.md");
const audit = read("docs/ERP_FINAL_PROFESSIONALIZATION_AUDIT.md");
const matrix = read("docs/ERP_FINAL_COMMERCIAL_READINESS_MATRIX.md");
const closure = read("docs/ERP_FINAL_PROGRAM_CLOSURE_REPORT.md");
const confidentialityQa = read("scripts/qa-sector-data-confidentiality-checks.mjs");
const responsiveQa = read("scripts/qa-responsive-ui-contract-checks.mjs");
const i18nQa = read("scripts/qa-erp-i18n-checks.mjs");
const deepLinksQa = read("scripts/qa-erp-deep-links-checks.mjs");
const healthCoreQa = read("scripts/qa-health-core-convergence-checks.mjs");
const healthFinanceQa = read("scripts/qa-health-financial-convergence-checks.mjs");
const pharmacyCoreQa = read("scripts/qa-pharmacy-core-convergence-checks.mjs");
const pharmacyFinanceQa = read("scripts/qa-pharmacy-financial-convergence-checks.mjs");

const healthWorkspaces = {
  patients: "components/enterprise/health-patients-workspace.tsx",
  appointments: "components/enterprise/health-appointments-workspace.tsx",
  consultations: "components/enterprise/health-consultations-workspace.tsx",
  records: "components/enterprise/health-medical-records-workspace.tsx",
  team: "components/enterprise/health-staff-workspace.tsx",
  laboratory: "components/enterprise/health-laboratory-workspace.tsx",
  pharmacy: "components/enterprise/health-pharmacy-workspace.tsx",
  billing: "components/enterprise/health-medical-billing-workspace.tsx",
  insurance: "components/enterprise/health-insurance-workspace.tsx",
  quality: "components/enterprise/health-quality-workspace.tsx",
  documents: "components/enterprise/health-documents-workspace.tsx",
};

const pharmacyWorkspaces = {
  products: "components/enterprise/pharmacy-products-workspace.tsx",
  batches: "components/enterprise/pharmacy-batches-workspace.tsx",
  inventory: "components/enterprise/pharmacy-stock-workspace.tsx",
  receipts: "components/enterprise/pharmacy-receipts-workspace.tsx",
  sales: "components/enterprise/pharmacy-sales-workspace.tsx",
  prescriptions: "components/enterprise/pharmacy-prescriptions-workspace.tsx",
  procurement: "components/enterprise/pharmacy-purchases-workspace.tsx",
  cash: "components/enterprise/pharmacy-cash-workspace.tsx",
  returns: "components/enterprise/pharmacy-return-loss-workspace.tsx",
  alerts: "components/enterprise/pharmacy-alerts-workspace.tsx",
  quality: "components/enterprise/pharmacy-quality-workspace.tsx",
  documents: "components/enterprise/pharmacy-documents-workspace.tsx",
  reports: "components/enterprise/pharmacy-reports-workspace.tsx",
  settings: "components/enterprise/pharmacy-settings-workspace.tsx",
};

const healthModules = [
  "PATIENTS",
  "APPOINTMENTS",
  "CONSULTATIONS",
  "MEDICAL_RECORDS",
  "CARE_TEAM",
  "LABORATORY",
  "INTERNAL_PHARMACY",
  "MEDICAL_BILLING",
  "INSURANCE_COVERAGE",
  "QUALITY_INCIDENTS",
  "MEDICAL_DOCUMENTS",
];

const pharmacyModules = [
  "MEDICINES_PRODUCTS",
  "BATCH_EXPIRY",
  "STOCK_INVENTORY",
  "STOCK_RECEIPTS",
  "SALES_DISPENSATION",
  "PRESCRIPTIONS",
  "SUPPLIERS_ORDERS",
  "CASH_INVOICES_PAYMENTS",
  "RETURNS_ADJUSTMENTS_LOSSES",
  "ALERTS_EXPIRY_LOW_STOCK",
  "QUALITY_PHARMACOVIGILANCE",
  "PHARMACY_DOCUMENTS",
  "PHARMACY_REPORTS",
  "PHARMACY_SETTINGS",
];

function checkDedicatedWorkspaces(workspaces, label) {
  for (const [name, file] of Object.entries(workspaces)) {
    const content = read(file);
    need(content, "organizationId", `${label} ${name}: isolation tenant`);
    reject(content, "EnterpriseSectorRecord", `${label} ${name}: pas de CRUD sectoriel générique`);
  }
}

const checks = {
  foundation() {
    need(registry, "module-registry-sector-convergence.json", "Registre sectoriel");
    need(registry, "module-registry-final-cleanup.json", "Nettoyage final");
    need(registry, "isEnterpriseModuleNavigable", "Navigation canonique");
    for (const marker of ["MEDICAL_CONFIDENTIALITY", "HEALTH_SETTINGS", "HEALTH_REPORTS", '"implementationStatus": "HIDDEN"']) {
      need(cleanup, marker, "Surfaces Health génériques masquées");
    }
    for (const marker of ["CATALOG", "INVENTORY_LOGISTICS", "FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS", "FINANCE_CASH"]) {
      need(convergence, marker, "Convergence ERP/Finance commune");
    }
  },

  health() {
    checkDedicatedWorkspaces(healthWorkspaces, "Health");
    need(healthCoreQa, "success(", "QA convergence Core Health");
    need(healthFinanceQa, "success(", "QA convergence Finance Health");
  },

  pharmacy() {
    checkDedicatedWorkspaces(pharmacyWorkspaces, "Pharmacy");
    need(pharmacyCoreQa, "success(", "QA convergence Core Pharmacy");
    need(pharmacyFinanceQa, "success(", "QA convergence Finance Pharmacy");
  },

  confidentiality() {
    for (const marker of ["MEDICAL_CONFIDENTIAL", "forbidTokens", "diagnosis:", "await rateLimit"]) {
      need(confidentialityQa, marker, "Confidentialité sectorielle");
    }
    need(read("lib/health-document-access.ts"), "canAccessEnterpriseModule", "Documents médicaux protégés");
    need(read("lib/pharmacy-document-access.ts"), "canAccessEnterpriseModule", "Documents Pharmacy protégés");
  },

  languageMobile() {
    need(responsiveQa, "min-w-0", "Contrat responsive");
    need(responsiveQa, "320 px", "Contrat responsive mobile");
    need(i18nQa, "requiredKeys", "QA i18n ERP");
    need(i18nQa, "visibleTechnicalPatterns", "QA i18n ERP");
    for (const file of [...Object.values(healthWorkspaces), ...Object.values(pharmacyWorkspaces)]) {
      reject(read(file), "window.prompt", `${file}: pas de prompt navigateur`);
    }
  },

  navigation() {
    for (const marker of ["COMPANY_RELATIONSHIPS", "/enterprise-links", "Relations avec les entreprises"]) {
      need(relationships, marker, "Relations entreprises canonique");
    }
    need(desktopNav, "pendingCompanyRelationships", "Navigation desktop Relations entreprises");
    need(mobileNav, "pendingCompanyRelationships", "Navigation mobile Relations entreprises");
    need(deepLinksQa, "enterprise-links?", "QA liens profonds ERP");
    need(deepLinksQa, "contract=${encodeURIComponent", "QA liens profonds ERP");
  },

  readiness() {
    let manifest;
    try {
      manifest = JSON.parse(readiness);
    } catch (error) {
      failures.push(`Manifeste itération 6 invalide: ${error instanceof Error ? error.message : "erreur inconnue"}`);
      return;
    }
    for (const moduleCode of [...healthModules, ...pharmacyModules]) {
      if (!manifest.moduleCodes?.includes(moduleCode)) failures.push(`Maturité itération 6: module absent ${moduleCode}`);
    }
    if (manifest.assessment?.maturity !== "PROFESSIONAL_READY") failures.push("Maturité sectorielle attendue: PROFESSIONAL_READY");
    if (manifest.assessment?.commercializable !== false) failures.push("Les modules sectoriels ne doivent pas être commercialisables avant E2E manuel");
    if (!manifest.assessment?.criteriaMissing?.includes("owner-authenticated-manual-e2e-validation")) failures.push("La validation E2E manuelle du propriétaire doit rester manquante");
    need(readinessResolver, "iteration06Manifest", "Résolveur de maturité itération 6");
    need(readinessResolver, "iteration06Overrides", "Overrides de maturité sectoriels");
  },

  documentation() {
    for (const marker of ["NON_EXÉCUTÉ", "Tests E2E manuels préparés — validation du propriétaire en attente", "Résultat réel", "Ticket correctif"]) {
      need(manualE2e, marker, "E2E manuel itération 6");
      need(finalManualE2e, marker, "E2E manuel programme final");
    }
    reject(manualE2e, "Tests E2E réussis", "Aucune réussite E2E inventée");
    reject(finalManualE2e, "Tests E2E réussis", "Aucune réussite E2E finale inventée");
    for (const marker of ["Patients", "Rendez-vous", "Consultations", "Laboratoire", "Produits", "Lots", "Dispensation", "Caisse"]) need(userGuide, marker, "Guide utilisateur sectoriel");
    for (const marker of ["PROFESSIONAL_READY", "En attente", "Dette restante"]) need(audit, marker, "Audit final");
    for (const marker of ["COMMERCIAL_READY", "PR séparée", "validation manuelle"]) need(matrix, marker, "Matrice commerciale");
    need(closure, "PROGRAMME NON ENCORE COMMERCIALEMENT CLÔTURÉ", "Clôture honnête");
  },
};

const aliases = {
  all: Object.keys(checks),
  foundation: ["foundation"],
  health: ["health", "confidentiality", "languageMobile"],
  patients: ["health"],
  appointments: ["health"],
  consultations: ["health", "confidentiality"],
  records: ["health", "confidentiality"],
  team: ["health"],
  laboratory: ["health", "confidentiality"],
  "health-pharmacy": ["health", "pharmacy"],
  billing: ["health", "confidentiality"],
  insurance: ["health"],
  "health-quality": ["health", "confidentiality"],
  "health-documents": ["health", "confidentiality"],
  pharmacy: ["pharmacy", "confidentiality", "languageMobile"],
  products: ["pharmacy"],
  batches: ["pharmacy"],
  inventory: ["pharmacy"],
  receipts: ["pharmacy"],
  sales: ["pharmacy", "confidentiality"],
  prescriptions: ["pharmacy", "confidentiality"],
  procurement: ["pharmacy"],
  cash: ["pharmacy"],
  returns: ["pharmacy"],
  alerts: ["pharmacy"],
  "pharmacy-quality": ["pharmacy", "confidentiality"],
  "pharmacy-documents": ["pharmacy", "confidentiality"],
  reports: ["pharmacy"],
  settings: ["pharmacy"],
  "french-language": ["languageMobile"],
  mobile: ["languageMobile"],
  "deep-links": ["navigation"],
  confidentiality: ["confidentiality"],
  "single-source-of-truth": ["foundation", "confidentiality"],
  "commercial-readiness": ["readiness", "documentation"],
  "program-final-readiness": ["foundation", "readiness", "documentation", "navigation"],
};

const selected = aliases[scope] || [scope];
for (const checkName of selected) {
  if (!checks[checkName]) failures.push(`Domaine QA inconnu: ${checkName}`);
  else checks[checkName]();
}

if (failures.length) {
  console.error(`QA ERP itération 06 (${scope}): ${failures.length} échec(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`QA ERP itération 06 (${scope}): OK`);
