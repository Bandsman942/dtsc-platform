import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Fichier introuvable: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function check(label, condition, hint) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(`${label}${hint ? `\n  ${hint}` : ""}`);
  console.error(`FAIL ${label}`);
}

function containsAll(source, patterns) {
  return patterns.every((pattern) => typeof pattern === "string" ? source.includes(pattern) : pattern.test(source));
}

function indexOrder(source, before, after) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  return beforeIndex !== -1 && afterIndex !== -1 && beforeIndex < afterIndex;
}

const packageJson = JSON.parse(read("package.json") || "{}");
const middleware = read("middleware.ts");
const postLoginRedirect = read("lib/post-login-redirect.ts");
const supportAccess = read("lib/support-access.ts");
const supportPage = read("app/support/page.tsx");
const supportCreateRoute = read("app/api/support/tickets/route.ts");
const supportUpdateRoute = read("app/api/support/tickets/[id]/route.ts");
const supportMessageRoute = read("app/api/support/tickets/[id]/messages/route.ts");
const supportMessageMutationRoute = read("app/api/support/tickets/[id]/messages/[messageId]/route.ts");
const supportTicketBoard = read("components/support/ticket-board.tsx");
const activityCommentsRoute = read("app/api/activities/comments/route.ts");
const actionMenu = read("components/ui/action-menu.tsx");
const publicPublicationEngagement = read("components/public/publication-engagement.tsx");
const enterpriseAdminPage = read("app/enterprise-admin/page.tsx");
const enterpriseActivitiesPage = read("app/enterprise-activities/page.tsx");
const enterpriseModulePage = read("app/enterprise-modules/[moduleCode]/page.tsx");
const enterpriseNavigation = read("lib/enterprise/enterprise-navigation.ts");
const enterpriseModuleWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
const enterpriseAdminLoader = read("lib/enterprise/enterprise-admin-loader.ts");
const enterpriseActivitiesLoader = read("lib/enterprise/enterprise-activities-loader.ts");
const enterpriseHealthcareLoader = read("lib/enterprise/enterprise-healthcare-loader.ts");
const enterpriseActivityHealthcareLoader = read("lib/enterprise/enterprise-activity-healthcare-loader.ts");
const enterprisePharmacyLoader = read("lib/enterprise/enterprise-pharmacy-loader.ts");
const enterpriseActivityPharmacyLoader = read("lib/enterprise/enterprise-activity-pharmacy-loader.ts");
const enterpriseAdminApi = read("app/api/enterprise/[organizationId]/administration/route.ts");
const enterpriseHealthcareApi = read("app/api/enterprise/[organizationId]/healthcare/route.ts");
const enterprisePharmacyApi = read("app/api/enterprise/[organizationId]/pharmacy/route.ts");
const enterprisePharmacyRecordApi = read("app/api/enterprise/[organizationId]/pharmacy/[recordId]/route.ts");
const pharmacyProductsApi = read("app/api/enterprise/[organizationId]/pharmacy/products/route.ts");
const pharmacyProductApi = read("app/api/enterprise/[organizationId]/pharmacy/products/[productId]/route.ts");
const pharmacyProductsWorkspace = read("components/enterprise/pharmacy-products-workspace.tsx");
const pharmacyProductsLabels = read("lib/pharmacy-products.ts");
const pharmacyProductAccess = read("lib/pharmacy-product-access.ts");
const pharmacyBatchesApi = read("app/api/enterprise/[organizationId]/pharmacy/batches/route.ts");
const pharmacyBatchApi = read("app/api/enterprise/[organizationId]/pharmacy/batches/[batchId]/route.ts");
const pharmacyBatchesWorkspace = read("components/enterprise/pharmacy-batches-workspace.tsx");
const pharmacyBatchAccess = read("lib/pharmacy-batch-access.ts");
const pharmacyBatchesService = read("lib/pharmacy-batches.ts");
const pharmacyStockApi = read("app/api/enterprise/[organizationId]/pharmacy/stock/route.ts");
const pharmacyStockWorkspace = read("components/enterprise/pharmacy-stock-workspace.tsx");
const pharmacyStockService = read("lib/pharmacy-stock.ts");
const pharmacyReceiptsApi = read("app/api/enterprise/[organizationId]/pharmacy/receipts/route.ts");
const pharmacyReceiptApi = read("app/api/enterprise/[organizationId]/pharmacy/receipts/[receiptId]/route.ts");
const pharmacyReceiptsWorkspace = read("components/enterprise/pharmacy-receipts-workspace.tsx");
const pharmacyReceiptsService = read("lib/pharmacy-receipts.ts");
const pharmacyReceiptAccess = read("lib/pharmacy-receipt-access.ts");
const pharmacySalesApi = read("app/api/enterprise/[organizationId]/pharmacy/sales/route.ts");
const pharmacySaleApi = read("app/api/enterprise/[organizationId]/pharmacy/sales/[saleId]/route.ts");
const pharmacySalesWorkspace = read("components/enterprise/pharmacy-sales-workspace.tsx");
const pharmacySalesService = read("lib/pharmacy-sales.ts");
const pharmacySaleAccess = read("lib/pharmacy-sale-access.ts");
const prismaSchema = read("prisma/schema.prisma");
const collaboratorsPage = read("app/collaborators/page.tsx");
const collaboratorsGroupsRoute = read("app/api/collaborators/groups/route.ts");
const collaboratorsMessagesRoute = read("app/api/collaborators/groups/[id]/messages/route.ts");
const collaboratorsCallsRoute = read("app/api/collaborators/groups/[id]/calls/route.ts");
const callJoinRoute = read("app/api/collaborators/calls/[id]/join/route.ts");
const callLeaveRoute = read("app/api/collaborators/calls/[id]/leave/route.ts");
const callEndRoute = read("app/api/collaborators/calls/[id]/end/route.ts");
const callEventsRoute = read("app/api/collaborators/calls/events/route.ts");
const callParticipantRoute = read("app/api/collaborators/calls/[id]/participants/route.ts");
const callTelemetryRoute = read("app/api/collaborators/calls/[id]/events/route.ts");
const globalCallToast = read("components/calls/global-call-toast.tsx");
const appShell = read("components/layout/app-shell.tsx");
const calendarRoute = read("app/api/calendar/route.ts");
const calendarAvailabilityRoute = read("app/api/calendar/availabilities/route.ts");
const internalCalendar = read("lib/internal-calendar.ts");
const adminPage = read("app/admin/page.tsx");
const billingPlans = read("lib/billing/plans.ts");
const billingDefaults = read("lib/billing.ts");
const billingEntitlements = read("lib/billing/entitlements.ts");
const billingModuleEntitlements = read("lib/billing/module-entitlements.ts");
const consoleBilling = read("lib/console/console-billing.ts");
const adminBillingSubscriptions = read("components/admin/admin-billing-subscriptions.tsx");
const billingPlanManager = read("components/admin/billing-plan-manager.tsx");
const clientOrganizationCreateRoute = read("app/api/admin/client-organizations/route.ts");
const clientOrganizationUpdateRoute = read("app/api/admin/client-organizations/[id]/route.ts");
const organizationSubscriptionCreateRoute = read("app/api/admin/organization-subscriptions/route.ts");
const organizationSubscriptionUpdateRoute = read("app/api/admin/organization-subscriptions/[id]/route.ts");
const billingPlanUpdateRoute = read("app/api/admin/billing-plans/[id]/route.ts");
const billingCheckoutRoute = read("app/api/billing/checkout/route.ts");
const enterpriseModuleToggleRoute = read("app/api/enterprise/[organizationId]/modules/[moduleId]/route.ts");

check(
  "script qa:regression déclaré",
  packageJson.scripts?.["qa:regression"] === "node scripts/qa-regression-checks.mjs",
  "Ajouter le script npm pour pouvoir exécuter la suite QA sans dépendance externe."
);

check(
  "middleware protège les routes privées critiques",
  containsAll(middleware, [
    '"/admin"',
    '"/enterprise-admin"',
    '"/enterprise-activities"',
    '"/collaborators"',
    '"/calendar"',
    '"/support"',
    '"/notifications"',
  ])
);

check(
  "middleware ne rewrite pas les API avant les gardes RBAC",
  indexOrder(middleware, 'if (pathname.startsWith("/api/"))', "applyHostRouting(request, session, hostType)")
);

check(
  "middleware réserve la Console DTSC au contexte interne",
  containsAll(middleware, ["hasDtscInternalContext", 'activeContext === "DTSC_INTERNAL"', 'activeOrganizationId === DTSC_INTERNAL_ORGANIZATION_ID'])
);

check(
  "post-login refuse les redirects ouverts",
  containsAll(postLoginRedirect, ['candidate.startsWith("//")', 'hostType === "unknown"', 'hostType === "local" && process.env.NODE_ENV === "production"'])
);

check(
  "post-login oriente DTSC_INTERNAL vers la console et les autres vers le SaaS",
  containsAll(postLoginRedirect, ['context === "DTSC_INTERNAL"', 'getConsoleUrl("/admin")', "getDashboardUrl()"])
);

check(
  "Support isole les tickets par créateur sauf Support DTSC",
  containsAll(supportAccess, ["ticket.userId === session.userId", "canManageSupportTickets(session)", "{ userId: session.userId }"])
    && supportPage.includes("supportTicketVisibilityWhere(session)")
);

check(
  "création ticket Support: session, origine, rate limit, Zod et organisation active",
  containsAll(supportCreateRoute, ["isSameOriginRequest", "await rateLimit", "supportTicketSchema.safeParse", "resolveSupportTicketOrganizationId", "status: \"ACTIVE\""])
);

check(
  "mise à jour ticket Support: DTSC_INTERNAL, rôle Support, origine et rate limit",
  containsAll(supportUpdateRoute, ["isDtscInternalSession", "canManageSupportRole", "isSameOriginRequest", "await rateLimit", "supportTicketUpdateSchema.safeParse"])
);

check(
  "messages ticket Support: accès ticket, origine, rate limit et validation Zod",
  containsAll(supportMessageRoute, ["canUserAccessSupportTicket", "isSameOriginRequest", "await rateLimit", "ticketMessageSchema.safeParse"])
);

check(
  "messages ticket Support: pagination, réponses et CRUD non destructif",
  containsAll(supportMessageRoute, ["export async function GET", "replyToId", "nextCursor", "hasMore"])
    && containsAll(supportMessageMutationRoute, ["export async function PATCH", "export async function DELETE", "deletedAt: new Date()", "writeAuditLog"])
    && containsAll(supportTicketBoard, ["Charger les précédents", "jumpToMessage", "setReplyingTo", "setEditing", "setDeleting"])
);

check(
  "commentaires opérationnels: réponses, pagination et CRUD protégé",
  containsAll(activityCommentsRoute, ["replyToId", "export async function PATCH", "export async function DELETE", "isSameOriginRequest", "await rateLimit", "deletedAt: new Date()"])
);

check(
  "commentaires publics: les réponses permettent de revenir au commentaire source",
  containsAll(publicPublicationEngagement, ["jumpToComment", "data-publication-comment-id", "parentComment"])
);

check(
  "menus d'actions rendus au premier plan hors des conteneurs",
  containsAll(actionMenu, ["createPortal", "document.body", 'className=\"fixed z-[1000]'])
);

check(
  "Enterprise Admin exige contexte ORGANIZATION et permission d'administration",
  containsAll(enterpriseAdminPage, ['activeContext === "ORGANIZATION"', "ENTERPRISE_MANAGER_ROLES", 'canUseFeature(organizationId, "enterprise-admin")', "getEnterpriseAdministrationDataset(organizationId)"])
);

check(
  "Enterprise Activities exige contexte ORGANIZATION et membership actif",
  containsAll(enterpriseActivitiesPage, ['activeContext === "ORGANIZATION"', "requireEnterpriseMembership", "getEnterpriseActivitiesDataset"])
);

check(
  "navigation Enterprise expose uniquement les modules actifs et autorisés",
  containsAll(enterpriseNavigation, ["enterpriseModule.isCore && enterpriseModule.isEnabled && enterpriseModule.accessAllowed", "getOrganizationEntitlements", "getEnterpriseModulesDataset"])
    && containsAll(enterpriseModulePage, ["canAccessEnterpriseModule", "requireEnterpriseMembership", "organizationId_moduleCode", "!enterpriseModule.isCore", "internalCalendarEvent", "auditLog.findMany"])
    && middleware.includes('"/enterprise-modules"')
);

check(
  "socle commun Enterprise: pages alimentées par les données réelles de l'organisation",
  containsAll(enterpriseModuleWorkspace, ["Données actuelles de l'entreprise", "Collaborateurs actifs", "Départements actifs", "resolveModuleItems", "Aucune donnée n'est encore enregistrée"])
    && !enterpriseModuleWorkspace.includes("Espace opérationnel")
);

check(
  "loaders Enterprise filtrent toutes les données par organizationId",
  containsAll(enterpriseAdminLoader, ["where: { organizationId }", "getEnterpriseHealthcareDataset(organizationId, organization.sectorCode)"])
    && containsAll(enterpriseActivitiesLoader, ["where: { id: organizationId", "getEnterpriseActivityRequests({ organizationId, userId, membershipRole })"])
);

check(
  "données Santé non chargées hors HEALTH_CARE",
  containsAll(enterpriseHealthcareLoader, ['sectorCode !== HEALTHCARE_SECTOR_CODE', "return [];"])
    && containsAll(enterpriseActivityHealthcareLoader, ['sectorCode !== HEALTHCARE_SECTOR_CODE', "return [];"])
);

check(
  "routes Enterprise mutantes: origine, rate limit, organizationId et permissions métier",
  containsAll(enterpriseAdminApi, ["isSameOriginRequest", "await rateLimit", "canManageEnterpriseAdministration(session.userId, organizationId)"])
    && containsAll(enterpriseHealthcareApi, ["isSameOriginRequest", "await rateLimit", "canAccessEnterpriseModule(session.userId, organizationId"])
);

check(
  "Mes collaborateurs limite les groupes au scope autorisé",
  containsAll(collaboratorsGroupsRoute, ["collaborationGroupScopeWhere(session)", 'members: { some: { userId: session.userId, status: "ACTIVE" } }'])
    && containsAll(collaboratorsPage, ["collaborationGroupScopeWhere(session)", "members: { some: { userId: user.id"])
);

check(
  "messages de groupe vérifient membership et contexte de conversation partagée",
  containsAll(collaboratorsMessagesRoute, ["assertGroupMemberForSession", "getActiveOrganizationId(session)", "userId: session.userId", "organizationId"])
);

check(
  "appels de groupe: démarrer/rejoindre/quitter/terminer vérifient origine, rate limit et membership",
  [collaboratorsCallsRoute, callJoinRoute, callLeaveRoute, callEndRoute, callParticipantRoute, callTelemetryRoute].every((source) =>
    containsAll(source, ["isSameOriginRequest", "await rateLimit", "assertGroupMemberForSession"])
  )
);

check(
  "terminer un appel reste réservé au lanceur ou gestionnaire de groupe",
  containsAll(callEndRoute, ["call.startedById !== session.userId", "canManageGroup(member, session.role)", "durationSeconds"])
);

check(
  "liste UI des appels n'expose pas roomName/provider",
  !/roomName|provider/.test(read("components/collaborators/collaborators-workspace.tsx").split("type GroupCall =")[1]?.split("type JoinedCall =")[0] || "")
    && !/roomName|provider/.test(read("components/collaborators/collaborators-workspace.tsx").split("type JoinedCall =")[1]?.split("type CallPreferences =")[0] || "")
    && !/roomName|provider/.test(collaboratorsPage)
    && !/roomName|provider/.test(collaboratorsGroupsRoute)
    && !/roomName|provider/.test((collaboratorsCallsRoute.match(/return \{[\s\S]*?participants: call\.participants,[\s\S]*?events: call\.events,[\s\S]*?\};/) || [""])[0])
);

check(
  "notifications d'appel: polling léger et visibilité par groupe autorisé",
  containsAll(callEventsRoute, ["canAccessGroupInSessionWithSubscription", "take: 20", "MAX_EVENT_AGE_MS"])
    && globalCallToast.includes("}, 6000)")
);

check(
  "GlobalCallToast monté dans AppShell authentifié",
  appShell.includes("<GlobalCallToast />")
);

check(
  "calendrier interne: accès privé, contexte organisation et disponibilité filtrée",
  containsAll(calendarRoute, ["canAccessInternalCalendar", "canUseInternalCalendarFeature", "getCalendarContext", "organizationId: context.activeOrganizationId"])
    && containsAll(calendarAvailabilityRoute, ["canAccessInternalCalendar", "canUseInternalCalendarFeature", "collaboratorAvailabilityWhere"])
    && containsAll(internalCalendar, ["activeOrganizationId", "organizationId", 'canUseFeature(context.activeOrganizationId, "calendar")'])
);

check(
  "calendrier interne: routes mutantes avec origine, rate limit et entitlements",
  containsAll(calendarRoute, ["isSameOriginRequest", "await rateLimit", "canUseInternalCalendarFeature"])
    && containsAll(calendarAvailabilityRoute, ["isSameOriginRequest", "await rateLimit", "canUseInternalCalendarFeature"])
    && containsAll(read("app/api/calendar/events/[id]/route.ts"), ["isSameOriginRequest", "await rateLimit", "canUseInternalCalendarFeature"])
    && containsAll(read("app/api/calendar/availabilities/[id]/route.ts"), ["isSameOriginRequest", "await rateLimit", "canUseInternalCalendarFeature"])
);

check(
  "SaaS: plans, limites et entitlements centralisés",
  containsAll(billingPlans, ["STARTER", "BUSINESS", "ENTERPRISE", "resolveSaasPlanCode", "planMeetsRequirement"])
    && containsAll(billingModuleEntitlements, ["FEATURE_ENTITLEMENTS", "requiredPlanForModule", "moduleRequiresActiveSubscription"])
    && containsAll(billingEntitlements, ["getOrganizationEntitlements", "canUseModule", "canUseFeature", "assertCanUseModule", "getOrganizationUsageLimits", "isSubscriptionActive"])
);

check(
  "SaaS: initialisation des plans non destructive",
  containsAll(billingDefaults, ["prisma.billingPlan.createMany", "skipDuplicates: true"])
    && !billingDefaults.includes("update: plan")
);

check(
  "SaaS: gestion des plans et tarifs réservée ADMIN, sécurisée et auditée",
  containsAll(billingPlanUpdateRoute, [
    "UserRole.ADMIN",
    "isDtscInternalSession",
    "isSameOriginRequest",
    "await rateLimit",
    "billingPlanUpdateSchema.safeParse",
    "BILLING_PLAN_UPDATED",
    "writeApiLog",
    'current.id === "freemium"',
  ])
    && containsAll(billingPlanManager, ["translate(locale", "plansAndPricing", "editPlanPricing", "/api/admin/billing-plans/", "pricingReason"])
    && containsAll(adminPage, ["BillingPlanManager", "user.role === UserRole.ADMIN"])
);

check(
  "SaaS: modules Enterprise et données sectorielles contrôlés par entitlements",
  containsAll(enterpriseModuleToggleRoute, ["canUseModule", "PLAN_REQUIRED", "SUBSCRIPTION_REQUIRED"])
    && containsAll(enterpriseAdminLoader, ["getOrganizationEntitlements", "entitlements"])
    && containsAll(enterpriseActivitiesLoader, ["getOrganizationEntitlements", "entitlements"])
    && containsAll(read("lib/enterprise/enterprise-healthcare-loader.ts"), ["getOrganizationEntitlements", "moduleCode: { in: allowedModuleCodes }"])
);

check(
  "PHARMACY: données chargées uniquement pour le secteur et modules autorisés",
  containsAll(enterprisePharmacyLoader, ['sectorCode !== PHARMACY_SECTOR_CODE', "getOrganizationEntitlements", "moduleCode: { in: allowedModuleCodes }"])
    && containsAll(enterpriseActivityPharmacyLoader, ['sectorCode !== PHARMACY_SECTOR_CODE', "getOrganizationEntitlements", "moduleCode: { in: allowedModuleCodes }"])
    && containsAll(enterpriseAdminLoader, ["getEnterprisePharmacyDataset", 'organization.sectorCode === "PHARMACY"'])
    && containsAll(enterpriseActivitiesLoader, ["getEnterpriseActivityPharmacyRecords", 'organization.sectorCode === "PHARMACY"'])
);

check(
  "PHARMACY: routes sécurisées, relations isolées et stock transactionnel",
  containsAll(enterprisePharmacyApi, ["isSameOriginRequest", "await rateLimit", "enterprisePharmacyRecordSchema.safeParse", "canAccessEnterpriseModule", "organizationId", "validateReferences"])
    && containsAll(enterprisePharmacyRecordApi, ["isSameOriginRequest", "await rateLimit", "canAccessEnterpriseModule", "prisma.$transaction", "BATCH_NOT_SELLABLE", "INSUFFICIENT_STOCK", "stockImpactApplied"])
);

check(
  "PHARMACY: Administration et Activités utilisent des vues et formulaires dédiés",
  containsAll(read("components/enterprise/pharmacy-admin-workspace.tsx"), ["PHARMACY_DASHBOARD", "ListControls", "RecordSelect", "SALES_DISPENSATION", "STOCK_RECEIPTS", "BATCH_EXPIRY"])
    && containsAll(read("components/enterprise/enterprise-activities-panels.tsx"), ["pharmacyActivityFields", "REQUEST_REPLENISHMENT", "REQUEST_STOCK_ADJUSTMENT_VALIDATION", "REQUEST_PHARMACIST_OPINION", "SUBMIT_INVENTORY"])
);

check(
  "PHARMACY Produits: catalogue dédié, sécurisé et non destructif",
  containsAll(prismaSchema, ["model PharmacyProduct", "@@unique([organizationId, internalCode])", "@@unique([organizationId, barcode])"])
    && containsAll(pharmacyProductsApi, ["canAccessPharmacyProducts", "pharmacyProductSchema.safeParse", "isSameOriginRequest", "await rateLimit", "organizationId"])
    && containsAll(pharmacyProductApi, ["pharmacyProductUpdateSchema.safeParse", 'status: "ARCHIVED"', "PHARMACY_PRODUCT_ARCHIVED"])
    && containsAll(pharmacyProductAccess, ["MEDICINES_PRODUCTS", "organization: { sectorCode: \"PHARMACY\""])
    && containsAll(pharmacyProductsWorkspace, ["Catalogue central", "PHARMACY_PRODUCT_CATEGORIES", "Nouveau produit", "Lots", "Historique"])
);

check(
  "PHARMACY Produits: libellés métier et aides contextuelles sans clés techniques visibles",
  containsAll(pharmacyProductsWorkspace, ["FIELD_HELP", "CircleHelp", "Ordonnance obligatoire", "Seuil d'alerte de stock", "Nombre d'unités par emballage", "fieldLabel(key)"])
    && !pharmacyProductsWorkspace.includes("labelText={field}")
    && !pharmacyProductsWorkspace.includes(">{field}</label>")
);

check(
  "PHARMACY Lots: tables dédiées, isolation multi-tenant et mouvement initial",
  containsAll(prismaSchema, ["model PharmacyBatch", "model PharmacyStockMovement", "@@unique([organizationId, productId, batchNumber])", "@@unique([organizationId, barcode])"])
    && containsAll(pharmacyBatchesApi, ["canAccessPharmacyBatches", "pharmacyBatchSchema.safeParse", "organizationId", "INITIAL_BATCH_CREATION", "pharmacyStockMovement.create"])
    && containsAll(pharmacyBatchApi, ["pharmacyBatchUpdateSchema.safeParse", "organizationId", "PHARMACY_BATCH_UPDATED"])
    && containsAll(pharmacyBatchAccess, ["BATCH_EXPIRY", "organization: { sectorCode: \"PHARMACY\""])
);

check(
  "PHARMACY Lots: interface métier, actions réelles et FEFO",
  containsAll(pharmacyBatchesWorkspace, ["Lots & péremptions", "Aucun lot n&apos;est encore enregistré", "Mettre en quarantaine", "Marquer comme rappelé", "Mouvements stock", "h-[94dvh]", "CircleHelp"])
    && containsAll(pharmacyBatchesService, ["getSellableBatchesForProduct", 'orderBy: [{ expiryDate: "asc" }', 'status: { notIn: ["RECALLED", "QUARANTINED", "BLOCKED", "CANCELLED", "EXPIRED"] }'])
);

check(
  "PHARMACY Stock: modèles dédiés, calculs réels et ajustements transactionnels",
  containsAll(prismaSchema, ["model PharmacyInventorySession", "model PharmacyInventoryLine", "model PharmacyStockAdjustment", "model PharmacyStockLocation", 'direction         String   @default("NEUTRAL")'])
    && containsAll(pharmacyStockService, ["getPharmacyStockDataset", "calculateProductStockStatus", "generateInventoryLines", "Number(batch.availableQuantity)"])
    && containsAll(pharmacyStockApi, ["canAccessPharmacyStock", "isSameOriginRequest", "await rateLimit", "prisma.$transaction", "NEGATIVE_STOCK", "PharmacyStockAdjustment"])
);

check(
  "PHARMACY Stock: dix vues fonctionnelles et formulaires plein écran",
  containsAll(pharmacyStockWorkspace, ["Vue stock global", "Stock par produit", "Stock par lot", "Mouvements de stock", "Sessions d'inventaire", "Écarts d'inventaire", "Ajustements stock", "Emplacements", "Alertes stock", "Historique stock", "h-[94dvh]", "Enregistrer le comptage"])
);

check(
  "PHARMACY Stock: formulaires guidés, listes françaises et confinement mobile",
  containsAll(pharmacyStockWorkspace, ["FIELD_HELP", "LabelWithHelp", "CircleHelp", "Inventaire complet", "Tous les produits", "Entrée en stock", "Zone des produits expirés", "overflow-x-hidden", "min-w-0"])
    && containsAll(pharmacyProductsWorkspace, ["w-full min-w-0 max-w-full overflow-hidden", "Toutes les catégories", "Toutes les règles"])
    && containsAll(pharmacyProductsLabels, ["Ordonnance obligatoire", "Produit soumis à contrôle renforcé", "Nom commercial", "Date de création"])
);

check(
  "PHARMACY Réceptions: modèles dédiés et impact stock idempotent",
  containsAll(prismaSchema, ["model PharmacyReceipt", "model PharmacyReceiptLine", "model PharmacyReceiptBatch", "model PharmacyReceiptDiscrepancy", "model PharmacyReceiptDocument", "@@unique([organizationId, receiptNumber])"])
    && containsAll(pharmacyReceiptsService, ["applyReceiptStockImpact", "reverseReceiptStockImpact", "receipt.stockImpactApplied", 'movementType: "RECEIPT"', "NEGATIVE_STOCK", "prisma.$transaction"])
);

check(
  "PHARMACY Réceptions: routes multi-tenant sécurisées et auditées",
  containsAll(pharmacyReceiptsApi, ["canAccessPharmacyReceipts", "isSameOriginRequest", "await rateLimit", "pharmacyReceiptSchema.safeParse", "validateReceiptReferences", "writeAuditLog"])
    && containsAll(pharmacyReceiptApi, ["organizationId", "receiptActionSchema.safeParse", "applyReceiptStockImpact", "reverseReceiptStockImpact", "writeAuditLog"])
    && containsAll(pharmacyReceiptAccess, ["STOCK_RECEIPTS", "organizationMember", "sectorCode: \"PHARMACY\""])
);

check(
  "PHARMACY Réceptions: sept vues fonctionnelles, combobox et formulaire mobile plein écran",
  containsAll(pharmacyReceiptsWorkspace, ["Tableau de bord", "Réceptions fournisseurs", "Lignes de réception", "Réceptions partielles", "Écarts de réception", "Documents de réception", "Historique des réceptions", "h-[96dvh]", "CircleHelp", "Ajouter un lot", "Enregistrer en brouillon"])
    && !pharmacyReceiptsWorkspace.includes('type="url"')
);

check(
  "PHARMACY Ventes: modèles dédiés et sorties stock idempotentes",
  containsAll(prismaSchema, ["model PharmacySale", "model PharmacySaleLine", "model PharmacySaleRefund", "model PharmacySaleRefundLine", "model PharmacySaleAnomaly", "@@unique([organizationId, saleNumber])"])
    && containsAll(pharmacySalesService, ["applySaleStockImpact", "reverseSaleStockImpact", "sale.stockImpactApplied", 'movementType: "SALE"', 'movementType: "SALE_CANCELLATION"', "prisma.$transaction"])
);

check(
  "PHARMACY Ventes: routes multi-tenant sécurisées et auditées",
  containsAll(pharmacySalesApi, ["canAccessPharmacySales", "isSameOriginRequest", "await rateLimit", "pharmacySaleSchema.safeParse", "validateSaleReferences", "writeAuditLog"])
    && containsAll(pharmacySaleApi, ["organizationId", "saleActionSchema.safeParse", "applySaleStockImpact", "reverseSaleStockImpact", "const refundAmount = data.refundAmount", "refundAmount === undefined", "writeAuditLog"])
    && containsAll(pharmacySaleAccess, ["SALES_DISPENSATION", "organizationMember", 'sectorCode: "PHARMACY"'])
);

check(
  "PHARMACY Ventes: onze vues métier, FEFO, aides et formulaire mobile",
  containsAll(pharmacySalesWorkspace, ["Tableau de bord", "Nouvelle vente / dispensation", "Ventes du jour", "Historique des ventes", "Lignes de vente", "Validations pharmacien", "Annulations & remboursements", "Sorties exceptionnelles", "Reçus / factures", "Anomalies de vente", "Historique des mouvements", "Lot vendable FEFO", "CircleHelp", "h-[96dvh]", "min-w-0", "overflow-x-hidden"])
);

check(
  "SaaS: Console DTSC expose le centre de contrôle abonnements, limites, modules et derniers paiements",
  containsAll(consoleBilling, ["organizationSubscriptionItems", "billingPlanOptions", "billingSummary", "getPlanUsageLimits", "resolveSaasPlanCode", "enabledModules", "latestBillingRecord"])
    && consoleBilling.includes("plans.filter((plan) => plan.isActive)")
    && !consoleBilling.includes('getPlanUsageLimits("FREE")')
    && containsAll(adminBillingSubscriptions, ["Centre de contrôle SaaS", "Créer un abonnement", "Renouveler avec historique", "Annuler l'abonnement", "maxActiveModules"])
    && adminPage.includes("AdminBillingSubscriptions")
);

check(
  "SaaS: CRUD abonnements admin protégé, validé, rate limité et audité",
  containsAll(organizationSubscriptionCreateRoute, [
    "isDtscInternalSession",
    "canManageClientOrganizations",
    "isSameOriginRequest",
    "await rateLimit",
    "organizationSubscriptionCreateSchema.safeParse",
    "ORGANIZATION_SUBSCRIPTION_CREATED",
  ])
    && containsAll(organizationSubscriptionUpdateRoute, [
      "isDtscInternalSession",
      "canManageClientOrganizations",
      "isSameOriginRequest",
      "await rateLimit",
      "organizationSubscriptionUpdateSchema.safeParse",
      "ORGANIZATION_SUBSCRIPTION_RENEWED",
      '"CANCELED"',
      '"EXPIRED"',
    ])
);

check(
  "routes admin organisations: contexte DTSC interne, origine, rate limit et validation Zod",
  containsAll(clientOrganizationCreateRoute, ["isDtscInternalSession", "isSameOriginRequest", "await rateLimit", "enterpriseOrganizationCreateSchema.safeParse"])
    && containsAll(clientOrganizationUpdateRoute, ["isDtscInternalSession", "isSameOriginRequest", "await rateLimit", "enterpriseOrganizationUpdateSchema.safeParse"])
);

check(
  "checkout facturation: origine, rate limit, validation Zod et maintenance MaishaPay explicite",
  containsAll(billingCheckoutRoute, ["isSameOriginRequest", "await rateLimit", "checkoutSchema.safeParse", "MAISHAPAY_MAINTENANCE", "freePlanAvailable"])
);

check(
  "collaboration SaaS: groupes et appels vérifient les entitlements organisation",
  containsAll(collaboratorsGroupsRoute, ["canUseFeature", '"collaborators"', "featureAccess.message"])
    && containsAll(collaboratorsCallsRoute, ["canUseFeature", '"collaboration-calls"', "featureAccess.message"])
    && containsAll(callJoinRoute, ["canUseFeature", '"collaboration-calls"', "featureAccess.message"])
);

check(
  "Console DTSC charge par datasets et détails conditionnels",
  containsAll(adminPage, [
    "isDtscInternalSession(session)",
    "getConsoleOverviewMetrics",
    "loadUserDetails",
    "loadClientOrganizationDetails",
    "loadActivityDetails",
    "loadBillingDetails",
    "loadAuditDetails",
    "loadInternalOperations",
  ])
);

if (failures.length) {
  console.error("\nQA regression checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nQA regression checks passed.");
