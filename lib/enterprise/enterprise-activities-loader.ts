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
import { getBusinessSubtypeForSector } from "@/lib/enterprise/business-subtype-registry";
import { GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS } from "@/lib/enterprise/enterprise-activity-form-contract";

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
    getEnterpriseActivityBlocks(organizationId, userId),
    getEnterpriseActivityRequests({ organizationId, userId, membershipRole }),
    getEnterpriseActivityMembers(organizationId),
    organization.sectorCode === "PHARMACY"
      ? getEnterpriseActivityPharmacyRecords(organizationId, organization.sectorCode)
      : getEnterpriseActivityHealthcareRecords(organizationId, organization.sectorCode),
    getEnterpriseActivityWorkflows(organizationId),
  ]);

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
    blocks: gamingLounge ? blocks.filter((block) => !GAMING_INCOMPATIBLE_ACTIVITY_BLOCKS.has(block.blockCode)) : blocks,
    requests,
    members,
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
