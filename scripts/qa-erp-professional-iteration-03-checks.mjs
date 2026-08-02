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
const needAny = (content, markers, scope) => {
  if (!markers.some((marker) => content.includes(marker))) failures.push(`${scope}: aucun marqueur trouvé parmi ${markers.map((marker) => `« ${marker} »`).join(", ")}`);
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
  professionalUi: "components/enterprise/professional/professional-erp-ui.tsx",
  moduleWorkspace: "components/workspace/module-workspace.tsx",
  businessList: "components/workspace/business-list.tsx",
  mobileCss: "app/mobile-stability.css",
  commonAccess: "lib/enterprise/common/access.ts",
  contracts: "components/enterprise/professional/enterprise-contracts-workspace.tsx",
  contractRoute: "app/api/enterprise/[organizationId]/contracts/route.ts",
  contractTransition: "app/api/enterprise/[organizationId]/contracts/[contractId]/transition/route.ts",
  contractComments: "app/api/enterprise/[organizationId]/contracts/[contractId]/comments/route.ts",
  workflowComments: "components/enterprise/professional/professional-workflow-comments.tsx",
  documents: "components/enterprise/core-v2/enterprise-documents-workspace.tsx",
  documentLinks: "app/api/enterprise/[organizationId]/documents/[id]/links/route.ts",
  procurementShared: "lib/enterprise/procurement/shared.ts",
  guides: "app/help/enterprise/page.tsx",
  voiceComposer: "components/chat/VoiceConversationComposer.tsx",
  collaborationMedia: "lib/collaboration-media.ts",
  voiceRoute: "app/api/collaborators/groups/[id]/voice/route.ts",
  messagesRoute: "app/api/collaborators/groups/[id]/messages/route.ts",
  conversation: "components/collaborators/collaborators-conversation-workspace.tsx",
  lookups: "app/api/enterprise/[organizationId]/operational-lookups/route.ts",
  projectOverview: "app/api/enterprise/[organizationId]/projects/[projectId]/overview/route.ts",
  projectMembers: "app/api/enterprise/[organizationId]/projects/[projectId]/members/route.ts",
  assetOverview: "app/api/enterprise/[organizationId]/assets/[assetId]/overview/route.ts",
  input: "components/ui/input.tsx",
  nativeSelect: "components/enterprise/core-v2/erp-v2-ui.tsx",
  readiness: "lib/enterprise/module-commercial-readiness-iteration-03.json",
  manualE2e: "docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_03.md",
};
const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

const iterationModules = [
  "SALES_QUOTES_ORDERS",
  "SUPPLIERS_PURCHASES",
  "INVENTORY_LOGISTICS",
  "HUMAN_RESOURCES",
  "TIME_ATTENDANCE",
  "PAYROLL_OPERATIONS",
  "PROJECTS_SERVICES",
  "TIME_DELIVERABLES",
  "ASSETS_MAINTENANCE",
];

const checks = {
  navigation() {
    for (const marker of ["COMPANY_RELATIONSHIPS", "/enterprise-links", "Relations avec les entreprises", "Company relationships"]) need(content.navigation, marker, "Navigation canonique");
    for (const marker of ["pendingCompanyRelationships", "aria-current", "99+"]) need(content.navDesktop, marker, "Navigation desktop");
    for (const marker of ["pendingCompanyRelationships", "data-mobile-secondary-nav", "scrollIntoView", "aria-current", "navigationPath", "getSupportUrl(\"/support\")"]) need(content.navMobile, marker, "Navigation mobile et Support");
    for (const marker of ["enterpriseIdentityLink.count", "COMPANY_RELATIONSHIP_USER_ACTION_STATUSES"]) need(content.appShell, marker, "Badge global");
    for (const marker of ["À traiter", "Relations actives", "Mes demandes", "Historique", "submitUserRequest", "organizationCode", "relationType", "Retirer l’autorisation", "DTSC ne propose pas d’annuaire public"]) need(content.relationships, marker, "Workspace relations");
    for (const marker of ["isSameOriginRequest", "rateLimit", "revision", "CANCELLED", "writeAuditLog"]) need(content.cancelRelationship, marker, "Annulation relation");
  },
  rails() {
    for (const marker of ["data-professional-tabs", "data-horizontal-rail", "overflow-x-auto", "scrollIntoView", "inline: \"center\""]) need(content.professionalUi, marker, "Rails professionnels");
    for (const marker of ["data-workspace-toolbar-controls", "grid-cols-[minmax(0,1fr)]"]) need(content.moduleWorkspace, marker, "Toolbar professionnelle");
    reject(content.moduleWorkspace, "controls ? <div data-responsive-actions", "Filtres séparés des actions");
    for (const marker of ["touch-action: pan-x !important", "-webkit-overflow-scrolling: touch", "[data-professional-tabs]"]) need(content.mobileCss, marker, "Gestes horizontaux mobiles");
  },
  density() {
    for (const marker of ["sm:grid-cols-[minmax(0,1fr)_auto]", "data-business-list-title", "break-words", "data-business-list-actions", "w-full min-w-0"]) need(content.businessList, marker, "Densité des listes mobiles");
    reject(content.businessList, "grid-cols-[minmax(0,1fr)_auto] items-start", "Colonnes rigides sur petit écran");
  },
  sales() {
    for (const marker of ["Nouveau devis", "catalogItemId", "Convertir en commande", "quantityRemaining", "idempotencyKey", "Enregistrer la livraison", "<Dialog", "<form"]) need(content.sales, marker, "Ventes professionnelles");
    reject(content.sales, "businessPartyId\" placeholder=\"UUID", "Ventes professionnelles");
  },
  procurement() {
    for (const marker of ["EnterpriseSuppliersWorkspace", "EnterprisePurchasesWorkspace", "commande-réception-facture"]) need(content.procurement, marker, "Achats professionnels");
    needAny(content.procurement, ["<form", "Dialog"], "Formulaires achats");
  },
  inventory() {
    for (const marker of ["Nouveau transfert de stock", "Nouvelle campagne d’inventaire", "Ajustement contrôlé", "approverUserId", "idempotencyKey", "stock négatif", "<form"]) need(content.inventory, marker, "Stock professionnel");
  },
  hr() {
    for (const marker of ["EnterpriseEmployeesIdentityWorkspace", "Nouveau contrat de travail", "Organigramme mobile", "approverUserId", "baseCompensation"]) need(content.hr, marker, "RH professionnelle");
    needAny(content.hr, ["<form", "Dialog"], "Formulaires RH");
  },
  time() {
    for (const marker of ["Nouvelle demande de congé", "Nouvelle feuille de temps", "partialDay", "approved", "billable", "approverUserId", "<form"]) need(content.time, marker, "Temps et congés");
  },
  payroll() {
    for (const marker of ["Assistant de préparation de paie", "employeeIds", "adjustments", "PENDING_APPROVAL", "payroll-runs", "cancel", "bulletins privés", "<form"]) need(content.payroll, marker, "Paie professionnelle");
    reject(content.payroll, "crée automatiquement un paiement", "Frontière paie/paiement");
  },
  projects() {
    for (const marker of ["Nouveau projet", "Ajouter un membre", "Ajouter un jalon", "Ajouter un risque", "Ajouter un livrable", "REQUEST_CHANGES", "relation active", "<form"]) need(content.projects, marker, "Projets professionnels");
    for (const marker of ["organizationId", "archivedAt", "members", "deliverables", "risks"]) need(content.projectOverview, marker, "Détail projet");
    for (const marker of ["isSameOriginRequest", "rateLimit", "organizationId", "employeeId", "ENTERPRISE_PROJECT_MEMBER_REMOVED"]) need(content.projectMembers, marker, "Membres projet");
  },
  assets() {
    for (const marker of ["Nouvel actif", "Affecter", "Enregistrer le retour", "Planifier une maintenance", "Déclarer un incident", "resolveIncident", "<form"]) need(content.assets, marker, "Actifs professionnels");
    for (const marker of ["organizationId", "assignments", "maintenanceRecords", "incidents"]) need(content.assetOverview, marker, "Détail actif");
  },
  contracts() {
    for (const marker of ["canDecide", "Votre décision est requise", "REQUEST_CORRECTION", "Demander une correction", "ProfessionalWorkflowComments", "Téléverser ou ouvrir les documents liés"]) need(content.contracts, marker, "Workflow contrats UI");
    for (const marker of ["capabilities", "isApprover", "canDecide", "canComment", "canWrite"]) need(content.contractRoute, marker, "Capacités contrat");
    for (const marker of ["DECISION_ACTIONS", "approverUserId !== session.userId", "REQUEST_CORRECTION", "status: \"RETURNED\"", "notifyUser", "writeAuditLog"]) need(content.contractTransition, marker, "Décision contrat assignée");
    for (const marker of ["export async function GET", "export async function POST", "export async function PATCH", "export async function DELETE", "authorUserId: session.userId", "deletedAt: new Date()", "isSameOriginRequest", "rateLimit"]) need(content.contractComments, marker, "Commentaires contrats CRUD");
    for (const marker of ["ProfessionalWorkflowComments", "canEdit", "canDelete", "method: editing ? \"PATCH\" : \"POST\"", "method: \"DELETE\""]) need(content.workflowComments, marker, "Commentaires workflow UI");
  },
  documents() {
    for (const marker of ["sourceEntityType", "sourceEntityId", "sourceReference", "requestedAction", "action === \"upload\"", "Téléverser un document lié", "new File", "type=\"file\"", "/versions"]) need(content.documents, marker, "Documents liés et upload réel");
    for (const marker of ["EnterpriseContract", "EnterpriseProject", "EnterpriseAsset", "targetModule", "createEnterpriseLink"]) need(content.documentLinks, marker, "Liens documentaires ERP");
    for (const marker of ["EnterpriseContract", "EnterpriseProject", "EnterpriseAsset", "CROSS_TENANT_LINK_DENIED"]) need(content.procurementShared, marker, "Validation tenant des liens");
  },
  guides() {
    for (const moduleCode of ["CONTRACTS", ...iterationModules]) need(content.guides, `${moduleCode}:`, `Guide dédié ${moduleCode}`);
    for (const marker of ["Avant de commencer", "Procédure pas à pas", "Statuts et workflow", "Contrôles et confidentialité", "Dépannage"]) need(content.guides, marker, "Structure des guides");
    need(content.professionalUi, "/help/enterprise?module=", "Lien guide contextuel");
  },
  voice() {
    for (const marker of ["window.isSecureContext", "navigator.mediaDevices.getUserMedia", "navigator.permissions.query", "NotAllowedError", "NotFoundError", "NotReadableError", "requestData", "audio/mp4", "audio/ogg"]) need(content.voiceComposer, marker, "Capture microphone");
    for (const marker of ["audio/x-m4a", "audio/3gpp", "normalizeCollaborationMimeType", "validateCollaborationAudio"]) need(content.collaborationMedia, marker, "Formats vocaux mobiles");
    for (const marker of ["VOICE_STORAGE_NOT_CONFIGURED", "VOICE_UPLOAD_FAILED", "VOICE_MESSAGE_SAVE_FAILED", "removeCollaborationMedia", "message:"]) need(content.voiceRoute, marker, "Erreurs vocales actionnables");
  },
  receipts() {
    for (const marker of ["receiptSummary", "recipientCount", "deliveredCount", "readCount", "allDelivered", "allRead", "lastSeenAt", "message.reads"]) need(content.messagesRoute, marker, "Résumé accusés serveur");
    for (const marker of ["CheckCheck", "MessageReceiptIndicator", "summary?.allRead", "summary?.allDelivered", "text-emerald-300"]) need(content.conversation, marker, "Accusés dans les bulles");
  },
  readiness() {
    let readiness;
    try {
      readiness = JSON.parse(content.readiness);
    } catch (error) {
      failures.push(`Matrice commerciale: JSON invalide (${error instanceof Error ? error.message : "unknown"})`);
      return;
    }
    for (const moduleCode of iterationModules) {
      const entry = readiness.moduleOverrides?.[moduleCode];
      if (!entry) {
        failures.push(`Matrice commerciale: module absent ${moduleCode}`);
        continue;
      }
      if (entry.maturity !== "COMMERCIAL_READY") failures.push(`${moduleCode}: maturité attendue COMMERCIAL_READY, reçue ${entry.maturity}`);
      if (entry.commercializable !== true) failures.push(`${moduleCode}: commercializable doit être true`);
      if (!Array.isArray(entry.criteriaMissing) || entry.criteriaMissing.length !== 0) failures.push(`${moduleCode}: criteriaMissing doit être vide`);
      for (const criterion of ["responsive-filter-rails", "compact-mobile-rows", "dedicated-user-guide", "owner-manual-findings-addressed"]) {
        if (!entry.criteriaSatisfied?.includes(criterion)) failures.push(`${moduleCode}: critère commercial manquant ${criterion}`);
      }
    }
  },
  routing() {
    for (const marker of ["EnterpriseSalesOperationsWorkspace", "EnterpriseProcurementOperationsWorkspace", "EnterpriseInventoryOperationsWorkspace", "EnterpriseHumanResourcesWorkspace", "EnterpriseTimeAttendanceWorkspace", "EnterprisePayrollOperationsWorkspace", "EnterpriseProjectsDeliverablesWorkspace", "EnterpriseAssetsMaintenanceWorkspace"]) need(content.route, marker, "Routage dédié");
    reject(content.route, "EnterpriseCommonDomainWorkspace", "Routage dédié");
  },
  security() {
    for (const marker of ["getEnterpriseCommonDomainAccess", "organizationId", "archivedAt"]) need(content.lookups, marker, "Sélecteurs opérationnels");
    for (const marker of ["canWrite", "canAdminister", "resolveEnterpriseModuleAccess", "action: \"write\"", "action: \"manage\""]) need(content.commonAccess, marker, "Séparation write/manage");
    for (const key of ["cancelRelationship", "projectMembers", "contractComments", "contractTransition"]) {
      for (const marker of ["isSameOriginRequest", "rateLimit", "writeAuditLog"]) need(content[key], marker, `Sécurité ${key}`);
    }
  },
  language() {
    for (const key of ["sales", "inventory", "hr", "time", "payroll", "projects", "assets", "relationships"]) {
      reject(content[key], ">DRAFT<", `Libellés ${key}`);
      reject(content[key], ">PENDING_APPROVAL<", `Libellés ${key}`);
      for (const visibleUuidMarker of [">UUID<", "placeholder=\"UUID", "label=\"UUID"]) reject(content[key], visibleUuidMarker, `Libellés ${key}`);
    }
  },
  mobile() {
    need(content.input, "text-base", "Contrat Input iOS");
    need(content.nativeSelect, "text-base", "Contrat NativeSelect iOS");
    for (const key of ["sales", "inventory", "hr", "time", "payroll", "projects", "assets"]) {
      need(content[key], "h-[9", `Dialogue mobile ${key}`);
      need(content[key], "sticky bottom-0", `Actions mobiles ${key}`);
      needAny(content[key], ["<Input", "<NativeSelect", "text-base"], `Champs iOS ${key}`);
    }
  },
  e2e() {
    for (const marker of ["NON_EXÉCUTÉ", "RÉUSSI", "ÉCHOUÉ", "BLOQUÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]) need(content.manualE2e, marker, "Plan E2E manuel");
    const affirmativeSuccess = content.manualE2e.split(/\r?\n/).map((line) => line.trim()).some((line) => line === "Tests E2E réussis" || line === "**Tests E2E réussis**");
    if (affirmativeSuccess) failures.push("Plan E2E manuel: déclaration affirmative interdite « Tests E2E réussis »");
  },
};

const aliases = {
  all: Object.keys(checks),
  sales: ["sales", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  procurement: ["procurement", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  inventory: ["inventory", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  hr: ["hr", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  time: ["time", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  payroll: ["payroll", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  projects: ["projects", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  deliverables: ["projects", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  assets: ["assets", "routing", "rails", "density", "guides", "language", "mobile", "security"],
  navigation: ["navigation", "rails", "security", "mobile"],
  access: ["navigation", "security"],
  readiness: ["readiness", "routing", "navigation", "rails", "density", "contracts", "documents", "guides", "voice", "receipts", "sales", "procurement", "inventory", "hr", "time", "payroll", "projects", "assets", "e2e"],
  deeplinks: ["navigation", "contracts", "documents", "projects", "assets"],
  security: ["security", "navigation", "contracts", "documents", "sales", "inventory", "hr", "payroll", "projects", "assets"],
  language: ["language"],
  mobile: ["mobile", "navigation", "rails", "density"],
};

for (const name of aliases[domain] || aliases.all) checks[name]?.();

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✅ QA ERP professionnalisation itération 3 validée (${domain}).`);
