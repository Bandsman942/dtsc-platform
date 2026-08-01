import type { EnterpriseAdminDataset } from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseCalendarDataset } from "@/lib/enterprise/enterprise-calendar-loader";
import { getEnterpriseMembersDataset } from "@/lib/enterprise/enterprise-members-loader";
import { getEnterpriseModulesDataset } from "@/lib/enterprise/enterprise-modules-loader";
import { getEnterpriseWorkflowsDataset } from "@/lib/enterprise/enterprise-workflows-loader";
import { listEnterpriseModuleConfigurationIssues } from "@/lib/enterprise/module-access";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

// Iteration 5 compatibility note: the former calls
// getEnterpriseHealthcareDataset(organizationId, organization.sectorCode) and
// getEnterprisePharmacyDataset(organizationId, organization.sectorCode) under
// organization.sectorCode === "PHARMACY" were intentionally removed from the
// normal admin render. Dedicated workspaces now load their own tenant-scoped
// data; historical sector records remain available only through protected,
// paginated legacy reads.

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
    configurationIssues,
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
  ]);

  const openTaskStatuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);
  const openRequestStatuses = new Set(["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED"]);
  const registryModules = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.registryKnown && enterpriseModule.implementationStatus !== "PLANNED" && enterpriseModule.implementationStatus !== "HIDDEN" && enterpriseModule.routeKind !== "ADMIN_SECTION");
  const hiddenIncompatibleModulesCount = moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.isEnabled && (!enterpriseModule.registryKnown || !enterpriseModule.sectorCompatible || !enterpriseModule.accessAllowed)).length;

  return toJson<EnterpriseAdminDataset>({
    organization,
    dashboard: {
      membersCount: members.length,
      activeModulesCount: registryModules.filter((enterpriseModule) => enterpriseModule.isEnabled && enterpriseModule.accessAllowed).length,
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
    },
    members,
    modules: moduleDataset.modules,
    departments,
    positions,
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
