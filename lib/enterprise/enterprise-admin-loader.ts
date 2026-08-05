import type { EnterpriseAdminDataset } from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseCalendarDataset } from "@/lib/enterprise/enterprise-calendar-loader";
import { getEnterpriseMembersDataset } from "@/lib/enterprise/enterprise-members-loader";
import { getEnterpriseModulesDataset } from "@/lib/enterprise/enterprise-modules-loader";
import { getEnterpriseWorkflowsDataset } from "@/lib/enterprise/enterprise-workflows-loader";
import { listEnterpriseModuleConfigurationIssues } from "@/lib/enterprise/module-access";
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

export async function getEnterpriseAdministrationDataset(organizationId: string): Promise<EnterpriseAdminDataset | null> {
  const organization = await getEnterpriseOrganizationForAdmin(organizationId);
  if (!organization) return null;

  await reconcileOrganizationModulesWithSubscription(organizationId);
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) return null;

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
    pendingValidationsCount,
    meetings,
    recentDocumentsCount,
    activeBudgetsCount,
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
    prisma.enterpriseTask.findMany({ where: { organizationId, archivedAt: null }, select: { status: true, dueAt: true } }),
    prisma.enterpriseRequest.findMany({ where: { organizationId, archivedAt: null }, select: { status: true, createdAt: true } }),
    prisma.enterpriseApproval.count({ where: { organizationId, archivedAt: null, status: "PENDING" } }),
    prisma.enterpriseMeeting.findMany({ where: { organizationId, archivedAt: null }, select: { status: true, startAt: true } }),
    prisma.enterpriseDocument.count({ where: { organizationId, archivedAt: null, updatedAt: { gte: recentThreshold } } }),
    prisma.enterpriseBudget.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
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
    moduleCode: issue.moduleLabel || (issue.code === "ORGANIZATION_NOT_FOUND" ? "Entreprise" : "Configuration à vérifier"),
  }));
  const openTaskStatuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);
  const openRequestStatuses = new Set(["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED"]);
  const registryModules = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.registryKnown && enterpriseModule.implementationStatus !== "PLANNED" && enterpriseModule.implementationStatus !== "HIDDEN" && enterpriseModule.routeKind !== "ADMIN_SECTION");
  const hiddenIncompatibleModulesCount = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.isEnabled && (!enterpriseModule.registryKnown || !enterpriseModule.sectorCompatible || !enterpriseModule.accessAllowed)).length;
  const activeMembersCount = members.filter((member) => member.status === "ACTIVE").length;
  const activeAdminCount = members.filter((member) => member.status === "ACTIVE" && ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(member.role)).length;
  const activeModulesCount = registryModules.filter((enterpriseModule) => enterpriseModule.isEnabled && enterpriseModule.accessAllowed).length;
  const configurationChecklist = [
    { code: "ORGANIZATION_IDENTITY", label: "Identité de l’organisation", complete: Boolean(organization.name && organization.country && organization.timezone), deepLink: "/enterprise-admin?section=settings", reasonCode: "ORGANIZATION_IDENTITY_INCOMPLETE" },
    { code: "RESPONSIBLE_ADMINS", label: "Responsables administratifs", complete: activeAdminCount >= 1, deepLink: "/enterprise-admin?section=members", reasonCode: "ADMIN_REQUIRED" },
    { code: "DEPARTMENTS", label: "Départements", complete: departments.some((department) => department.isActive), deepLink: "/enterprise-admin?section=departments", reasonCode: "DEPARTMENT_REQUIRED" },
    { code: "COLLABORATORS", label: "Collaborateurs", complete: activeMembersCount >= 1, deepLink: "/enterprise-admin?section=members", reasonCode: "COLLABORATOR_REQUIRED" },
    { code: "ROLES", label: "Rôles et permissions", complete: roles.some((role) => role.isActive), deepLink: "/enterprise-admin?section=permissions", reasonCode: "ROLE_REQUIRED" },
    { code: "SUBSCRIPTION", label: "Abonnement", complete: entitlements.subscriptionActive, deepLink: "/enterprise-admin?section=subscription", reasonCode: "SUBSCRIPTION_INACTIVE" },
    { code: "MODULES", label: "Modules", complete: activeModulesCount > 0, deepLink: "/enterprise-admin?section=modules", reasonCode: "MODULE_REQUIRED" },
    { code: "BRANDING", label: "Identité visuelle", complete: Boolean(organization.logoUrl || (organization.brandingJson && Object.keys(organization.brandingJson as Record<string, unknown>).length)), deepLink: "/enterprise-admin?section=settings", reasonCode: "BRANDING_INCOMPLETE" },
    { code: "SECURITY", label: "Politique de sécurité", complete: Boolean(securityPolicy), deepLink: "/enterprise-admin?section=security", reasonCode: "SECURITY_POLICY_REQUIRED" },
  ];

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
