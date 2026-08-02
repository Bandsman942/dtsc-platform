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
  route: "app/enterprise-modules/[moduleCode]/page.tsx",
  navigation: "lib/navigation/company-relationships.ts",
  navDesktop: "components/layout/nav-links.tsx",
  navMobile: "components/dtsc/mobile-shell.tsx",
  appShell: "components/layout/app-shell.tsx",
  relationships: "components/enterprise/identity-links/enterprise-identity-user-panel.tsx",
  cancelRelationship: "app/api/account/identity-links/cancel/route.ts",
  sales: "components/enterprise/professional/enterprise-sales-operations-workspace.tsx",
  procurement: "components/enterprise/professional/enterprise-procurement-operations-workspace.tsx",
  inventory: "components/enterprise/professional/enterprise-inventory-operations-workspace.tsx",
  hr: "components/enterprise/professional/enterprise-human-resources-workspace.tsx",
  time: "components/enterprise/professional/enterprise-time-attendance-workspace.tsx",
  payroll: "components/enterprise/professional/enterprise-payroll-operations-workspace.tsx",
  projects: "components/enterprise/professional/enterprise-projects-deliverables-workspace.tsx",
  assets: "components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx",
  lookups: "app/api/enterprise/[organizationId]/operational-lookups/route.ts",
  projectOverview: "app/api/enterprise/[organizationId]/projects/[projectId]/overview/route.ts",
  projectMembers: "app/api/enterprise/[organizationId]/projects/[projectId]/members/route.ts",
  assetOverview: "app/api/enterprise/[organizationId]/assets/[assetId]/overview/route.ts",
  manualE2e: "docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_03.md",
};
const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

const checks = {
  navigation() {
    for (const marker of ["COMPANY_RELATIONSHIPS", "/enterprise-links", "Relations avec les entreprises", "Company relationships"]) need(content.navigation, marker, "Navigation canonique");
    for (const marker of ["pendingCompanyRelationships", "aria-current", "99+"]) need(content.navDesktop, marker, "Navigation desktop");
    for (const marker of ["pendingCompanyRelationships", "data-mobile-secondary-nav", "scrollIntoView", "aria-current"]) need(content.navMobile, marker, "Navigation mobile");
    for (const marker of ["enterpriseIdentityLink.count", "COMPANY_RELATIONSHIP_USER_ACTION_STATUSES"]) need(content.appShell, marker, "Badge global");
    for (const marker of ["À traiter", "Relations actives", "Mes demandes", "Historique", "Retirer l’autorisation"]) need(content.relationships, marker, "Workspace relations");
    for (const marker of ["isSameOriginRequest", "rateLimit", "revision", "CANCELLED", "writeAuditLog"]) need(content.cancelRelationship, marker, "Annulation relation");
  },
  sales() {
    for (const marker of ["Nouveau devis", "catalogItemId", "Convertir en commande", "quantityRemaining", "idempotencyKey", "Enregistrer la livraison"]) need(content.sales, marker, "Ventes professionnelles");
    reject(content.sales, "businessPartyId\" placeholder=\"UUID", "Ventes professionnelles");
  },
  procurement() {
    for (const marker of ["EnterpriseSuppliersWorkspace", "EnterprisePurchasesWorkspace", "commande-réception-facture"]) need(content.procurement, marker, "Achats professionnels");
  },
  inventory() {
    for (const marker of ["Nouveau transfert de stock", "Nouvelle campagne d’inventaire", "Ajustement contrôlé", "approverUserId", "idempotencyKey", "stock négatif"]) need(content.inventory, marker, "Stock professionnel");
  },
  hr() {
    for (const marker of ["EnterpriseEmployeesIdentityWorkspace", "Nouveau contrat de travail", "Organigramme mobile", "approverUserId", "baseCompensation"]) need(content.hr, marker, "RH professionnelle");
  },
  time() {
    for (const marker of ["Nouvelle demande de congé", "Nouvelle feuille de temps", "partialDay", "approved", "billable", "approverUserId"]) need(content.time, marker, "Temps et congés");
  },
  payroll() {
    for (const marker of ["Assistant de préparation de paie", "employeeIds", "adjustments", "PENDING_APPROVAL", "payroll-runs", "cancel", "bulletins privés"]) need(content.payroll, marker, "Paie professionnelle");
    reject(content.payroll, "crée automatiquement un paiement", "Frontière paie/paiement");
  },
  projects() {
    for (const marker of ["Nouveau projet", "Ajouter un membre", "Ajouter un jalon", "Ajouter un risque", "Ajouter un livrable", "REQUEST_CHANGES", "relation active"]) need(content.projects, marker, "Projets professionnels");
    for (const marker of ["organizationId", "archivedAt", "members", "deliverables", "risks"]) need(content.projectOverview, marker, "Détail projet");
    for (const marker of ["isSameOriginRequest", "rateLimit", "organizationId", "employeeId", "ENTERPRISE_PROJECT_MEMBER_REMOVED"]) need(content.projectMembers, marker, "Membres projet");
  },
  assets() {
    for (const marker of ["Nouvel actif", "Affecter", "Enregistrer le retour", "Planifier une maintenance", "Déclarer un incident", "resolveIncident"]) need(content.assets, marker, "Actifs professionnels");
    for (const marker of ["organizationId", "assignments", "maintenanceRecords", "incidents"]) need(content.assetOverview, marker, "Détail actif");
  },
  routing() {
    for (const marker of ["EnterpriseSalesOperationsWorkspace", "EnterpriseProcurementOperationsWorkspace", "EnterpriseInventoryOperationsWorkspace", "EnterpriseHumanResourcesWorkspace", "EnterpriseTimeAttendanceWorkspace", "EnterprisePayrollOperationsWorkspace", "EnterpriseProjectsDeliverablesWorkspace", "EnterpriseAssetsMaintenanceWorkspace"]) need(content.route, marker, "Routage dédié");
    reject(content.route, "EnterpriseCommonDomainWorkspace", "Routage dédié");
  },
  security() {
    for (const marker of ["getEnterpriseCommonDomainAccess", "organizationId", "archivedAt"]) need(content.lookups, marker, "Sélecteurs opérationnels");
    for (const key of ["cancelRelationship", "projectMembers"]) {
      for (const marker of ["isSameOriginRequest", "rateLimit", "writeAuditLog"]) need(content[key], marker, `Sécurité ${key}`);
    }
  },
  language() {
    for (const key of ["sales", "inventory", "hr", "time", "payroll", "projects", "assets", "relationships"]) {
      reject(content[key], ">DRAFT<", `Libellés ${key}`);
      reject(content[key], ">PENDING_APPROVAL<", `Libellés ${key}`);
      reject(content[key], "UUID", `Libellés ${key}`);
    }
  },
  mobile() {
    for (const key of ["sales", "inventory", "hr", "time", "payroll", "projects", "assets"]) {
      need(content[key], "h-[9", `Dialogue mobile ${key}`);
      need(content[key], "sticky bottom-0", `Actions mobiles ${key}`);
      need(content[key], "text-base", `Champs iOS ${key}`);
    }
  },
  e2e() {
    for (const marker of ["NON_EXÉCUTÉ", "RÉUSSI", "ÉCHOUÉ", "BLOQUÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]) need(content.manualE2e, marker, "Plan E2E manuel");
    reject(content.manualE2e, "Tests E2E réussis", "Plan E2E manuel");
  },
};

const aliases = {
  all: Object.keys(checks),
  sales: ["sales", "routing", "language", "mobile", "security"],
  procurement: ["procurement", "routing", "language", "mobile", "security"],
  inventory: ["inventory", "routing", "language", "mobile", "security"],
  hr: ["hr", "routing", "language", "mobile", "security"],
  time: ["time", "routing", "language", "mobile", "security"],
  payroll: ["payroll", "routing", "language", "mobile", "security"],
  projects: ["projects", "routing", "language", "mobile", "security"],
  deliverables: ["projects", "routing", "language", "mobile", "security"],
  assets: ["assets", "routing", "language", "mobile", "security"],
  navigation: ["navigation", "security", "mobile"],
  access: ["navigation", "security"],
  readiness: ["routing", "navigation", "sales", "procurement", "inventory", "hr", "time", "payroll", "projects", "assets", "e2e"],
  deeplinks: ["navigation", "projects", "assets"],
  security: ["security", "navigation", "sales", "inventory", "hr", "payroll", "projects", "assets"],
  language: ["language"],
  mobile: ["mobile", "navigation"],
};

for (const name of aliases[domain] || aliases.all) checks[name]?.();

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✅ QA ERP professionnalisation itération 3 validée (${domain}).`);
