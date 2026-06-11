import type { EnterpriseAdminDataset } from "@/lib/enterprise/enterprise-admin-types";
import { getEnterpriseCalendarDataset } from "@/lib/enterprise/enterprise-calendar-loader";
import { getEnterpriseHealthcareDataset } from "@/lib/enterprise/enterprise-healthcare-loader";
import { getEnterprisePharmacyDataset } from "@/lib/enterprise/enterprise-pharmacy-loader";
import { getEnterpriseMembersDataset } from "@/lib/enterprise/enterprise-members-loader";
import { getEnterpriseModulesDataset } from "@/lib/enterprise/enterprise-modules-loader";
import { getEnterpriseWorkflowsDataset } from "@/lib/enterprise/enterprise-workflows-loader";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

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
  if (!organization) {
    return null;
  }

  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) {
    return null;
  }

  const [members, moduleDataset, departments, positions, workflowDataset, calendarEvents, sectorRecords, coreRecords] = await Promise.all([
    getEnterpriseMembersDataset(organizationId),
    getEnterpriseModulesDataset(organizationId, entitlements),
    prisma.enterpriseDepartment.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterprisePosition.findMany({
      where: { organizationId },
      orderBy: [{ hierarchyLevel: "asc" }, { labelFr: "asc" }],
      include: { department: { select: { labelFr: true, labelEn: true } } },
    }),
    getEnterpriseWorkflowsDataset(organizationId),
    getEnterpriseCalendarDataset(organizationId),
    organization.sectorCode === "PHARMACY"
      ? getEnterprisePharmacyDataset(organizationId, organization.sectorCode)
      : getEnterpriseHealthcareDataset(organizationId, organization.sectorCode),
    prisma.enterpriseCoreRecord.findMany({
      where: { organizationId, archivedAt: null },
      select: { moduleCode: true, recordType: true, status: true, dueAt: true, updatedAt: true },
    }),
  ]);
  const closedStatuses = new Set(["COMPLETED", "APPROVED", "REJECTED", "CANCELLED", "ARCHIVED"]);
  const now = new Date();
  const recentThreshold = new Date(now.getTime() - 30 * 86400000);

  return toJson<EnterpriseAdminDataset>({
    organization,
    dashboard: {
      membersCount: members.length,
      activeModulesCount: moduleDataset.modules.filter((enterpriseModule) => enterpriseModule.isEnabled).length,
      modulesCount: moduleDataset.modules.length,
      openRequestsCount: workflowDataset.openRequestsCount,
      recentRequestsCount: workflowDataset.recentRequests.length,
      openTasksCount: coreRecords.filter((record) => record.moduleCode === "TASKS_OPERATIONS" && !closedStatuses.has(record.status)).length,
      overdueTasksCount: coreRecords.filter((record) => record.moduleCode === "TASKS_OPERATIONS" && !closedStatuses.has(record.status) && record.dueAt && record.dueAt < now).length,
      pendingValidationsCount: coreRecords.filter((record) => record.status === "PENDING_VALIDATION").length,
      recentDocumentsCount: coreRecords.filter((record) => record.recordType === "DOCUMENT" && record.updatedAt >= recentThreshold).length,
      activeBudgetsCount: coreRecords.filter((record) => record.recordType === "BUDGET" && !closedStatuses.has(record.status)).length,
      activeSuppliersCount: coreRecords.filter((record) => record.recordType === "SUPPLIER" && !closedStatuses.has(record.status)).length,
    },
    members,
    modules: moduleDataset.modules,
    departments,
    positions,
    activityBlocks: moduleDataset.activityBlocks,
    workflows: workflowDataset.workflows,
    recentRequests: workflowDataset.recentRequests,
    calendarEvents,
    sectorRecords,
    entitlements: {
      planCode: entitlements.planCode,
      planLabel: entitlements.planLabel,
      subscriptionStatus: entitlements.subscriptionStatus,
      subscriptionActive: entitlements.subscriptionActive,
      trialEndsAt: entitlements.trialEndsAt,
      expiresAt: entitlements.expiresAt,
      limits: entitlements.limits,
    },
  });
}
