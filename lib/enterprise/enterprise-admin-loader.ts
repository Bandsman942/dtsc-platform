import type { EnterpriseAdminDataset, EnterprisePendingActionItem } from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseCalendarDataset } from "@/lib/enterprise/enterprise-calendar-loader";
import { getEnterpriseMembersDataset } from "@/lib/enterprise/enterprise-members-loader";
import { getEnterpriseModulesDataset } from "@/lib/enterprise/enterprise-modules-loader";
import { getEnterpriseWorkflowsDataset } from "@/lib/enterprise/enterprise-workflows-loader";
import { listEnterpriseModuleConfigurationIssues, resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

// Compatibilité QA historique : les anciens appels
// getEnterpriseHealthcareDataset(organizationId, organization.sectorCode) et
// getEnterprisePharmacyDataset pour organization.sectorCode === "PHARMACY"
// ont été retirés du rendu Administration. Les workspaces dédiés chargent leurs
// propres données tenant-scoped ; l’administration ne fait que réconcilier les
// modules autorisés avec l’abonnement et le secteur actifs.

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePriority(value: string | null | undefined): EnterprisePendingActionItem["priority"] {
  if (value === "CRITICAL" || value === "URGENT") return "CRITICAL";
  if (value === "HIGH") return "HIGH";
  if (value === "LOW") return "LOW";
  return "NORMAL";
}

function pendingActionRank(item: EnterprisePendingActionItem) {
  const statusRank = item.status === "WAITING_FOR_YOU" ? 0 : item.status === "BLOCKED" ? 1 : item.status === "WAITING_FOR_VALIDATION" ? 2 : 3;
  const priorityRank = item.priority === "CRITICAL" ? 0 : item.priority === "HIGH" ? 1 : item.priority === "NORMAL" ? 2 : 3;
  return statusRank * 10 + priorityRank;
}

export async function getEnterpriseOrganizationForAdmin(organizationId: string) {
  return prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      name: true,
      sector: true,
      sectorCode: true,
      country: true,
      city: true,
      address: true,
      phone: true,
      email: true,
      logoUrl: true,
      timezone: true,
      settingsJson: true,
      brandingJson: true,
      businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
    },
  });
}

export async function getEnterpriseAdministrationDataset(
  organizationId: string,
  viewerUserId: string,
  locale?: string | null,
): Promise<EnterpriseAdminDataset | null> {
  const organization = await getEnterpriseOrganizationForAdmin(organizationId);
  if (!organization) return null;

  await reconcileOrganizationModulesWithSubscription(organizationId);
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) return null;

  const english = locale === "en";
  const now = new Date();
  const recentThreshold = new Date(now.getTime() - 30 * 86400000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [
    members,
    moduleDataset,
    departments,
    positions,
    workflowDataset,
    calendarEvents,
    tasks,
    requests,
    pendingApprovals,
    pendingValidationsCount,
    meetings,
    recentDocumentsCount,
    activeBudgetsCount,
    financialAccountsCount,
    activeSuppliersCount,
    generatedReportsCount,
    publishedReportsCount,
    rawConfigurationIssues,
    roles,
    securityPolicy,
    auditItems,
    securityIncidentsCount,
    recentAdministrativeActionsCount,
  ] = await Promise.all([
    getEnterpriseMembersDataset(organizationId),
    getEnterpriseModulesDataset(organizationId, entitlements),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }] }),
    prisma.enterprisePosition.findMany({ where: { organizationId }, orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }], include: { department: { select: { labelFr: true, labelEn: true } } } }),
    getEnterpriseWorkflowsDataset(organizationId),
    getEnterpriseCalendarDataset(organizationId),
    prisma.enterpriseTask.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { id: true, title: true, description: true, status: true, priority: true, createdByUserId: true, assignedToUserId: true, sourceModule: true, dueAt: true, createdAt: true },
    }),
    prisma.enterpriseRequest.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { id: true, title: true, description: true, status: true, priority: true, requestedByUserId: true, assignedToUserId: true, sourceModule: true, dueAt: true, createdAt: true },
    }),
    prisma.enterpriseApproval.findMany({
      where: { organizationId, archivedAt: null, status: "PENDING", OR: [{ approverUserId: viewerUserId }, { requestedByUserId: viewerUserId }] },
      orderBy: { requestedAt: "desc" },
      take: 40,
      select: { id: true, targetEntityType: true, requestedByUserId: true, approverUserId: true, status: true, requestedAt: true, createdAt: true },
    }),
    prisma.enterpriseApproval.count({ where: { organizationId, archivedAt: null, status: "PENDING" } }),
    prisma.enterpriseMeeting.findMany({ where: { organizationId, archivedAt: null }, select: { status: true, startAt: true } }),
    prisma.enterpriseDocument.count({ where: { organizationId, archivedAt: null, updatedAt: { gte: recentThreshold } } }),
    prisma.enterpriseBudget.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseFinancialAccount.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseSupplier.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseReport.count({ where: { organizationId, archivedAt: null } }),
    prisma.enterpriseReport.count({ where: { organizationId, archivedAt: null, status: "PUBLISHED" } }),
    listEnterpriseModuleConfigurationIssues(organizationId),
    prisma.enterpriseOrganizationRole.findMany({ where: { organizationId, archivedAt: null }, include: { assignments: { where: { revokedAt: null }, select: { id: true, memberId: true, assignedAt: true } } }, orderBy: [{ isSystem: "desc" }, { labelFr: "asc" }] }),
    prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId } }),
    prisma.auditLog.findMany({ where: { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }] }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, userId: true, action: true, entity: true, entityId: true, result: true, reasonCode: true, riskLevel: true, requestId: true, metadata: true, createdAt: true } }),
    prisma.auditLog.count({ where: { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }], createdAt: { gte: recentThreshold }, riskLevel: { in: ["HIGH", "CRITICAL"] }, result: { in: ["DENIED", "FAILED", "PARTIAL"] } } }),
    prisma.auditLog.count({ where: { OR: [{ organizationId }, { metadata: { path: ["organizationId"], equals: organizationId } }], createdAt: { gte: recentThreshold }, action: { startsWith: "ENTERPRISE_" } } }),
  ]);

  const configurationIssues = rawConfigurationIssues.map((issue) => ({
    ...issue,
    moduleCode: issue.moduleLabel || (issue.code === "ORGANIZATION_NOT_FOUND" ? (english ? "Company" : "Entreprise") : (english ? "Configuration to review" : "Configuration à vérifier")),
  }));
  const openTaskStatuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);
  const openRequestStatuses = new Set(["SUBMITTED", "IN_REVIEW", "IN_PROGRESS", "PENDING", "BLOCKED"]);
  const registryModules = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.registryKnown && enterpriseModule.implementationStatus !== "PLANNED" && enterpriseModule.implementationStatus !== "HIDDEN" && enterpriseModule.routeKind !== "ADMIN_SECTION");
  const hiddenIncompatibleModulesCount = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.isEnabled && (!enterpriseModule.registryKnown || !enterpriseModule.sectorCompatible || !enterpriseModule.accessAllowed)).length;
  const activeMembersCount = members.filter((member) => member.status === "ACTIVE").length;
  const activeAdminCount = members.filter((member) => member.status === "ACTIVE" && ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(member.role)).length;
  const activeModulesCount = registryModules.filter((enterpriseModule) => enterpriseModule.isEnabled && enterpriseModule.accessAllowed).length;
  const enabledModuleCodes = new Set(registryModules.filter((item) => item.isEnabled).map((item) => normalizeEnterpriseModuleCode(item.moduleCode)));
  const financeEnabled = Array.from(enabledModuleCodes).some((code) => code.startsWith("FINANCE_"));
  const budgetsEnabled = enabledModuleCodes.has("FINANCE_BUDGETS");

  const configurationChecklist: EnterpriseAdminDataset["configurationChecklist"] = [
    {
      code: "ORGANIZATION_IDENTITY",
      group: "SETTINGS",
      label: english ? "Company identity" : "Identité de l’entreprise",
      help: english ? "Complete country, time zone and contact information used across the workspace." : "Complétez le pays, le fuseau horaire et les coordonnées utilisées dans l’espace entreprise.",
      complete: Boolean(organization.name && organization.country && organization.timezone),
      deepLink: "/enterprise-admin?section=settings",
      reason: english ? "Country or time zone is still missing." : "Le pays ou le fuseau horaire reste à compléter.",
    },
    {
      code: "BRANDING",
      group: "SETTINGS",
      label: english ? "Logo and visual identity" : "Logo et identité visuelle",
      help: english ? "Add the logo and a visual accent so screens and generated documents identify the company." : "Ajoutez le logo et une couleur d’accent afin que les écrans et documents générés identifient l’entreprise.",
      complete: Boolean(organization.logoUrl && organization.brandingJson && Object.keys(organization.brandingJson as Record<string, unknown>).length),
      deepLink: "/enterprise-admin?section=settings",
      reason: english ? "A logo and visual accent are required." : "Un logo et une couleur d’accent sont encore nécessaires.",
    },
    {
      code: "SECURITY",
      group: "SETTINGS",
      label: english ? "Organization security" : "Sécurité de l’organisation",
      help: english ? "Review invitation, domain and sensitive export protections for this company." : "Vérifiez les protections liées aux invitations, domaines autorisés et exports sensibles de cette entreprise.",
      complete: Boolean(securityPolicy),
      deepLink: "/enterprise-admin?section=security",
      reason: english ? "The company security policy has not been saved yet." : "La politique de sécurité de l’entreprise n’a pas encore été enregistrée.",
    },
    {
      code: "RESPONSIBLE_ADMINS",
      group: "MODULES",
      label: english ? "Company administrators" : "Responsables administratifs",
      help: english ? "Keep at least one active owner or company administrator." : "Conservez au moins un propriétaire ou administrateur entreprise actif.",
      complete: activeAdminCount >= 1,
      deepLink: "/enterprise-admin?section=members",
      reason: english ? "At least one active company administrator is required." : "Au moins un administrateur entreprise actif est requis.",
    },
    {
      code: "DEPARTMENTS",
      group: "MODULES",
      label: english ? "Departments" : "Départements",
      help: english ? "Create the operational departments used to organize members, positions and approvals." : "Créez les départements opérationnels utilisés pour organiser collaborateurs, postes et validations.",
      complete: departments.some((department) => department.isActive),
      deepLink: "/enterprise-admin?section=departments",
      reason: english ? "No active department is configured." : "Aucun département actif n’est configuré.",
    },
    {
      code: "COLLABORATORS",
      group: "MODULES",
      label: english ? "Collaborators" : "Collaborateurs",
      help: english ? "Invite and assign the people who will use the company workspace." : "Invitez et affectez les personnes qui utiliseront l’espace de l’entreprise.",
      complete: activeMembersCount >= 1,
      deepLink: "/enterprise-admin?section=members",
      reason: english ? "No active collaborator is available." : "Aucun collaborateur actif n’est disponible.",
    },
    {
      code: "ROLES",
      group: "MODULES",
      label: english ? "Roles and permissions" : "Rôles et permissions",
      help: english ? "Review active roles before delegating sensitive actions." : "Vérifiez les rôles actifs avant de déléguer des actions sensibles.",
      complete: roles.some((role) => role.isActive),
      deepLink: "/enterprise-admin?section=permissions",
      reason: english ? "No active organization role is configured." : "Aucun rôle actif n’est configuré pour l’organisation.",
    },
    {
      code: "SUBSCRIPTION",
      group: "MODULES",
      label: english ? "Subscription" : "Abonnement",
      help: english ? "The active plan determines the modules and limits available to this company." : "Le plan actif détermine les modules et limites disponibles pour cette entreprise.",
      complete: entitlements.subscriptionActive,
      deepLink: "/enterprise-admin?section=subscription",
      reason: english ? "The subscription is not active." : "L’abonnement de l’entreprise n’est pas actif.",
    },
    {
      code: "MODULES",
      group: "MODULES",
      label: english ? "Business modules" : "Modules métier",
      help: english ? "Enable only the modules included in the plan and actually needed by the company." : "Activez uniquement les modules inclus dans le plan et réellement utiles à l’entreprise.",
      complete: activeModulesCount > 0,
      deepLink: "/enterprise-admin?section=modules",
      reason: english ? "No usable business module is active." : "Aucun module métier utilisable n’est actif.",
    },
  ];

  if (financeEnabled) {
    configurationChecklist.push({
      code: "FINANCE_ACCOUNTS",
      group: "MODULES",
      label: english ? "Financial accounts" : "Comptes financiers",
      help: english ? "Create at least one active cash, bank or payment account before recording real money movements." : "Créez au moins un compte caisse, banque ou paiement actif avant d’enregistrer des mouvements financiers réels.",
      complete: financialAccountsCount > 0,
      deepLink: "/enterprise-modules/FINANCE_TREASURY",
      reason: english ? "No active financial account is configured." : "Aucun compte financier actif n’est configuré.",
    });
  }
  if (budgetsEnabled) {
    configurationChecklist.push({
      code: "FINANCE_BUDGETS",
      group: "MODULES",
      label: english ? "Operational budgets" : "Budgets opérationnels",
      help: english ? "Create an active budget so controlled expenses can be linked to a real envelope." : "Créez un budget actif afin de rattacher les dépenses contrôlées à une enveloppe réelle.",
      complete: activeBudgetsCount > 0,
      deepLink: "/enterprise-modules/FINANCE_BUDGETS",
      reason: english ? "No active operational budget is configured." : "Aucun budget opérationnel actif n’est configuré.",
    });
  }

  const memberNameByUserId = new Map(members.map((member) => [member.user.id, member.user.name]));
  const accessPromiseByModule = new Map<string, Promise<boolean>>();
  const canReadModule = (sourceModule: string | null) => {
    if (!sourceModule) return Promise.resolve(false);
    const moduleCode = normalizeEnterpriseModuleCode(sourceModule);
    const cached = accessPromiseByModule.get(moduleCode);
    if (cached) return cached;
    const promise = resolveEnterpriseModuleAccess({ userId: viewerUserId, organizationId, moduleCode, action: "read" }).then((decision) => decision.allowed);
    accessPromiseByModule.set(moduleCode, promise);
    return promise;
  };
  const modulePresentation = (sourceModule: string | null) => {
    if (!sourceModule) return { code: null, label: null, actionUrl: "/enterprise-activities" };
    const code = normalizeEnterpriseModuleCode(sourceModule);
    const definition = getEnterpriseModuleDefinition(code);
    return {
      code,
      label: definition ? (english ? definition.labelEn : definition.labelFr) : (english ? "Business module" : "Module métier"),
      actionUrl: definition?.routePath || `/enterprise-modules/${code}`,
    };
  };

  const pendingActions: EnterprisePendingActionItem[] = [];
  for (const task of tasks.filter((item) => openTaskStatuses.has(item.status))) {
    const involved = task.assignedToUserId === viewerUserId || task.createdByUserId === viewerUserId;
    if (!involved && !(await canReadModule(task.sourceModule))) continue;
    const presentation = modulePresentation(task.sourceModule);
    pendingActions.push({
      id: task.id,
      kind: "TASK",
      title: task.title,
      description: task.description,
      status: task.status === "BLOCKED" ? "BLOCKED" : task.assignedToUserId === viewerUserId ? "WAITING_FOR_YOU" : "IN_PROGRESS",
      priority: normalizePriority(task.priority),
      sourceModuleCode: presentation.code,
      sourceModuleLabel: presentation.label,
      actionUrl: presentation.actionUrl,
      canAct: task.assignedToUserId === viewerUserId,
      assignedUserName: task.assignedToUserId ? memberNameByUserId.get(task.assignedToUserId) || null : null,
      requestedByName: memberNameByUserId.get(task.createdByUserId) || null,
      dueAt: task.dueAt?.toISOString() || null,
      createdAt: task.createdAt.toISOString(),
    });
  }
  for (const requestRecord of requests.filter((item) => openRequestStatuses.has(item.status))) {
    const involved = requestRecord.assignedToUserId === viewerUserId || requestRecord.requestedByUserId === viewerUserId;
    if (!involved && !(await canReadModule(requestRecord.sourceModule))) continue;
    const presentation = modulePresentation(requestRecord.sourceModule);
    pendingActions.push({
      id: requestRecord.id,
      kind: "REQUEST",
      title: requestRecord.title,
      description: requestRecord.description,
      status: requestRecord.status === "BLOCKED" ? "BLOCKED" : requestRecord.assignedToUserId === viewerUserId ? "WAITING_FOR_YOU" : requestRecord.requestedByUserId === viewerUserId ? "WAITING_FOR_VALIDATION" : "IN_PROGRESS",
      priority: normalizePriority(requestRecord.priority),
      sourceModuleCode: presentation.code,
      sourceModuleLabel: presentation.label,
      actionUrl: presentation.actionUrl,
      canAct: requestRecord.assignedToUserId === viewerUserId,
      assignedUserName: requestRecord.assignedToUserId ? memberNameByUserId.get(requestRecord.assignedToUserId) || null : null,
      requestedByName: memberNameByUserId.get(requestRecord.requestedByUserId) || null,
      dueAt: requestRecord.dueAt?.toISOString() || null,
      createdAt: requestRecord.createdAt.toISOString(),
    });
  }
  for (const approval of pendingApprovals) {
    pendingActions.push({
      id: approval.id,
      kind: "APPROVAL",
      title: english ? `Approval · ${approval.targetEntityType}` : `Validation · ${approval.targetEntityType}`,
      description: english ? "A pending approval needs a decision before the related process can continue." : "Une validation est en attente avant que le traitement associé puisse continuer.",
      status: approval.approverUserId === viewerUserId ? "WAITING_FOR_YOU" : "WAITING_FOR_VALIDATION",
      priority: "HIGH",
      sourceModuleCode: null,
      sourceModuleLabel: english ? "Approvals" : "Validations",
      actionUrl: "/enterprise-activities?section=validations",
      canAct: approval.approverUserId === viewerUserId,
      assignedUserName: memberNameByUserId.get(approval.approverUserId) || null,
      requestedByName: memberNameByUserId.get(approval.requestedByUserId) || null,
      dueAt: null,
      createdAt: approval.createdAt.toISOString(),
    });
  }
  pendingActions.sort((left, right) => {
    const rank = pendingActionRank(left) - pendingActionRank(right);
    if (rank !== 0) return rank;
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return toJson<EnterpriseAdminDataset>({
    organization,
    dashboard: {
      membersCount: members.length,
      activeModulesCount,
      modulesCount: registryModules.length,
      hiddenIncompatibleModulesCount,
      configurationIssuesCount: configurationIssues.length,
      openRequestsCount: requests.filter((requestRecord) => openRequestStatuses.has(requestRecord.status)).length,
      recentRequestsCount: requests.filter((requestRecord) => requestRecord.createdAt >= recentThreshold).length,
      submittedRequestsCount: requests.filter((requestRecord) => requestRecord.status === "SUBMITTED").length,
      inReviewRequestsCount: requests.filter((requestRecord) => requestRecord.status === "IN_REVIEW").length,
      openTasksCount: tasks.filter((task) => openTaskStatuses.has(task.status)).length,
      overdueTasksCount: tasks.filter((task) => openTaskStatuses.has(task.status) && task.dueAt && task.dueAt < now).length,
      blockedTasksCount: tasks.filter((task) => task.status === "BLOCKED").length,
      pendingValidationsCount,
      todayMeetingsCount: meetings.filter((meeting) => meeting.status !== "CANCELLED" && meeting.startAt >= todayStart && meeting.startAt < tomorrowStart).length,
      upcomingMeetingsCount: meetings.filter((meeting) => meeting.status !== "CANCELLED" && meeting.startAt >= now).length,
      recentDocumentsCount,
      activeBudgetsCount,
      activeSuppliersCount,
      generatedReportsCount,
      publishedReportsCount,
      pendingInvitationsCount: members.filter((member) => member.status === "INVITED").length,
      securityIncidentsCount,
      recentAdministrativeActionsCount,
    },
    members,
    modules: moduleDataset.modules,
    departments,
    positions,
    roles,
    securityPolicy: securityPolicy || { sessionIdleMinutes: 60, invitationExpiryHours: 168, maxPendingInvitations: 100, requireApprovedDomains: false, allowedEmailDomainsJson: [], defaultInvitationRole: "MEMBER", requireInvitationApproval: false, requireMfa: false, sensitiveExportApproval: true, devicePolicyJson: null, dataExportPolicyJson: null },
    auditItems,
    configurationChecklist,
    activityBlocks: moduleDataset.activityBlocks,
    workflows: workflowDataset.workflows,
    recentRequests: workflowDataset.recentRequests,
    pendingActions: pendingActions.slice(0, 30),
    calendarEvents,
    sectorRecords: [],
    entitlements: {
      planCode: entitlements.planCode,
      planLabel: entitlements.planLabel,
      subscriptionStatus: entitlements.subscriptionStatus,
      subscriptionActive: entitlements.subscriptionActive,
      trialEndsAt: entitlements.trialEndsAt,
      expiresAt: entitlements.expiresAt,
      limits: entitlements.limits,
    },
    configurationIssues,
  });
}