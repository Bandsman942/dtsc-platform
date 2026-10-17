import { getEnterpriseActivityBlocks } from "@/lib/enterprise/enterprise-activity-blocks-loader";
import { getEnterpriseActivityHealthcareRecords } from "@/lib/enterprise/enterprise-activity-healthcare-loader";
import { getEnterpriseActivityPharmacyRecords } from "@/lib/enterprise/enterprise-activity-pharmacy-loader";
import { getEnterpriseActivityMembers } from "@/lib/enterprise/enterprise-activity-members-loader";
import { getEnterpriseActivityRequests } from "@/lib/enterprise/enterprise-activity-requests-loader";
import { getEnterpriseActivityWorkflows } from "@/lib/enterprise/enterprise-activity-workflows-loader";
import type { EnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-types";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { projectEnterpriseActivityRequestWorkflows } from "@/lib/enterprise/enterprise-activity-workflow-links";
import { getBusinessSubtypeForSector } from "@/lib/enterprise/business-subtype-registry";
import { canAccessEnterpriseActivity } from "@/lib/enterprise-sector-templates";
import { GAMING_ACTIVITY_BLOCK_COPY, GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS } from "@/lib/enterprise/enterprise-activity-form-contract";
import { canonicalSectorActivityDestination } from "@/lib/enterprise/sector-activity-canonical-handoffs";
import { resolveEnterpriseModuleRoute, isEnterpriseModuleNavigable, getEnterpriseModuleLabel } from "@/lib/enterprise/module-registry";

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getEnterpriseActivitiesDataset({
  organizationId,
  userId,
  membershipRole,
}: {
  organizationId: string;
  userId: string;
  membershipRole: string | null | undefined;
}) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: {
      id: true,
      name: true,
      sector: true,
      sectorCode: true,
      businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } },
    },
  });

  if (!organization) {
    return null;
  }

  const subtypeSelection = await prisma.enterpriseBusinessSubtypeSelection.findUnique({
    where: { organizationId }, select: { businessSubtypeCode: true },
  });
  const businessSubtype = getBusinessSubtypeForSector(organization.sectorCode, subtypeSelection?.businessSubtypeCode);
  const gamingLounge = businessSubtype?.code === "GAMING_LOUNGE";
  const entitlements = await getOrganizationEntitlements(organizationId);
  if (!entitlements) {
    return null;
  }

  const [blocks, requests, members, sectorRecords, workflows] = await Promise.all([
    getEnterpriseActivityBlocks(organizationId, userId, organization.sectorCode),
    getEnterpriseActivityRequests({ organizationId, userId, membershipRole }),
    getEnterpriseActivityMembers(organizationId),
    organization.sectorCode === "PHARMACY"
      ? getEnterpriseActivityPharmacyRecords(organizationId, organization.sectorCode)
      : getEnterpriseActivityHealthcareRecords(organizationId, organization.sectorCode),
    getEnterpriseActivityWorkflows(organizationId, userId),
  ]);

  // Only active departments whose designated manager is still a live member
  // can be offered as candidates for REQUEST_MANAGER_APPROVAL.
  const departmentCandidates = await prisma.enterpriseDepartment.findMany({
    where: { organizationId, isActive: true, responsibleUserId: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, labelFr: true, labelEn: true, responsibleUserId: true },
    take: 200,
  });
  const activeManagers = departmentCandidates.length
    ? await prisma.organizationMember.findMany({
        where: { organizationId, userId: { in: departmentCandidates.map((item) => item.responsibleUserId).filter((value): value is string => Boolean(value)) }, status: "ACTIVE", removedAt: null },
        select: { userId: true },
      })
    : [];
  const activeManagerIds = new Set(activeManagers.map((member) => member.userId));
  const departments = departmentCandidates.filter((department) => department.responsibleUserId && activeManagerIds.has(department.responsibleUserId))
    .map((department) => ({ value: department.id, labelFr: department.labelFr, labelEn: department.labelEn }));

  const workflowLinks = await projectEnterpriseActivityRequestWorkflows({
    organizationId, userId, activityIds: requests.map((request) => request.id),
  });
  const requestsWithCanonicalState = requests.map((request) => ({
    ...request,
    workflowLink: workflowLinks.get(request.id) || null,
  }));

  // A readable activity is not necessarily submittable; never show an action
  // which the server will refuse for its missing submit permission.
  const eligibleBlocks = (await Promise.all(blocks.map(async (block) => ({
    block,
    allowed: await canAccessEnterpriseActivity(userId, organizationId, block.blockCode, "submit"),
  })))).filter((item) => item.allowed).map((item) => item.block);

  // Only expose real, navigable canonical ERP commands to members permitted to
  // CREATE in the target module. This is not a write permission delegated from
  // Activities: the destination page and API will check rights again.
  const canonicalActionHandoffs: Record<string, { href: string; labelFr: string; labelEn: string }> = {};
  const knownHandoffs = eligibleBlocks.flatMap((block) => {
    const destination = canonicalSectorActivityDestination(organization.sectorCode, block.blockCode);
    return destination ? [{ blockCode: block.blockCode, destination }] : [];
  });
  await Promise.all(knownHandoffs.map(async ({ blockCode, destination }) => {
    const [capabilities, route] = await Promise.all([
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: destination.moduleCode }),
      Promise.resolve(resolveEnterpriseModuleRoute(destination.moduleCode)),
    ]);
    if (!capabilities.canRead || !capabilities.canCreate || !route || !isEnterpriseModuleNavigable(route.definition)) return;
    canonicalActionHandoffs[blockCode] = {
      href: `${route.path}?activityAction=${destination.intent}`,
      labelFr: getEnterpriseModuleLabel(route.definition, "fr"),
      labelEn: getEnterpriseModuleLabel(route.definition, "en"),
    };
  }));

  const gamingReferences = gamingLounge ? await (async () => {
    // Do not leak private Gaming/CRM references to users who may submit a
    // collaborative request but do not have read access to the target module.
    const [stationAccess, bookingAccess, sessionAccess, closeAccess, customerAccess] = await Promise.all([
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "GAMING_STATIONS" }),
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "GAMING_BOOKINGS" }),
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "GAMING_SESSIONS" }),
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "GAMING_DAILY_CLOSE" }),
      resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "CRM_CUSTOMERS" }),
    ]);
    const [stations, bookings, sessions, closes, parties] = await Promise.all([
      stationAccess.canRead ? prisma.enterpriseGamingStationProfile.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, stationCode: true, displayName: true }, orderBy: { sortOrder: "asc" }, take: 100 }) : Promise.resolve([]),
      bookingAccess.canRead ? prisma.enterpriseGamingBooking.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, reference: true }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
      sessionAccess.canRead ? prisma.enterpriseGamingSession.findMany({ where: { organizationId, archivedAt: null }, select: { id: true, reference: true }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
      closeAccess.canRead ? prisma.enterpriseGamingDailyClose.findMany({ where: { organizationId }, select: { id: true, reference: true }, orderBy: { submittedAt: "desc" }, take: 50 }) : Promise.resolve([]),
      customerAccess.canRead ? prisma.enterpriseBusinessParty.findMany({ where: { organizationId, archivedAt: null, status: "ACTIVE", roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } }, select: { id: true, legalName: true, displayName: true }, orderBy: { legalName: "asc" }, take: 100 }) : Promise.resolve([]),
    ]);
    return {
      gamingStations: stations.map((item) => ({ value: item.id, label: `${item.stationCode} · ${item.displayName || item.stationCode}` })),
      gamingBookings: bookings.map((item) => ({ value: item.id, label: item.reference })),
      gamingSessions: sessions.map((item) => ({ value: item.id, label: item.reference })),
      gamingCloses: closes.map((item) => ({ value: item.id, label: item.reference })),
      businessParties: parties.map((item) => ({ value: item.id, label: item.displayName || item.legalName })),
    };
  })() : {};
  return toJson<EnterpriseActivitiesDataset>({
    organization: { ...organization, businessSubtypeCode: businessSubtype?.code || null, businessSubtypeLabelFr: businessSubtype?.labelFr || null, businessSubtypeLabelEn: businessSubtype?.labelEn || null },
    blocks: gamingLounge
      ? eligibleBlocks.filter((block) => !GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS.has(block.blockCode))
        .map((block) => ({ ...block, ...(GAMING_ACTIVITY_BLOCK_COPY[block.blockCode] || {}) }))
      : eligibleBlocks,
    requests: requestsWithCanonicalState,
    canonicalActionHandoffs,
    members,
    departments,
    sectorRecords,
    workflows,
    gamingReferences,
    entitlements: {
      planCode: entitlements.planCode,
      planLabel: entitlements.planLabel,
      subscriptionStatus: entitlements.subscriptionStatus,
      subscriptionActive: entitlements.subscriptionActive,
    },
  });
}
