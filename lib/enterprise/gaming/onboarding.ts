import { Prisma } from "@prisma/client";
import { z } from "zod";
import { resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { GAMING_BUSINESS_SUBTYPE_CODE, GAMING_MODULE_CODES, GAMING_SECTOR_CODE } from "@/lib/enterprise/gaming/domain";
import { GAMING_RECOMMENDED_POSITION_CODES } from "@/lib/enterprise/gaming/provisioning";
import { prisma } from "@/lib/prisma";

export const GAMING_ONBOARDING_STEPS = [
  "IDENTITY_SITE",
  "STATIONS_ASSETS",
  "TEAM_PERMISSIONS",
  "CATALOG_SERVICES",
  "PRICING",
  "FINANCE_PAYMENTS",
  "OPERATIONS",
  "CLOSE_REPORTING_AI",
] as const;
export type GamingOnboardingStep = (typeof GAMING_ONBOARDING_STEPS)[number];
type ReadinessDb = Prisma.TransactionClient | typeof prisma;

export const gamingOnboardingSelectionSchema = z.object({
  preferredSiteId: z.string().trim().min(1).max(180).optional().nullable().or(z.literal("")),
  revision: z.coerce.number().int().positive().optional(),
}).strict();
export type GamingOnboardingSelection = z.infer<typeof gamingOnboardingSelectionSchema>;

type GamingSettings = {
  onboardingVersion?: number;
  onboarding?: {
    preferredSiteId?: string | null;
    currentStep?: string;
    completed?: number;
    total?: number;
    ready?: boolean;
    checkedAt?: string;
  };
};

function asSettings(value: Prisma.JsonValue | null | undefined): GamingSettings {
  return value && typeof value === "object" && !Array.isArray(value) ? value as GamingSettings : {};
}

function normalizedId(value: string | null | undefined) {
  return value?.trim() || null;
}

async function assertGamingTenant(db: ReadinessDb, organizationId: string) {
  const [organization, subtype] = await Promise.all([
    db.organization.findFirst({
      where: {
        id: organizationId,
        status: "ACTIVE",
        deletedAt: null,
        organizationType: "CLIENT",
        sectorCode: GAMING_SECTOR_CODE,
      },
      select: { id: true, name: true, country: true, timezone: true, sectorCode: true },
    }),
    db.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);
  if (!organization) throw new EnterpriseDomainError("GAMING_ONBOARDING_ORGANIZATION_NOT_FOUND", 404);
  if (subtype?.sectorCode !== GAMING_SECTOR_CODE || subtype.businessSubtypeCode !== GAMING_BUSINESS_SUBTYPE_CODE) {
    throw new EnterpriseDomainError("GAMING_ONBOARDING_SUBTYPE_REQUIRED", 403);
  }
  return organization;
}

function deepLink(code: GamingOnboardingStep) {
  const links: Record<GamingOnboardingStep, string> = {
    IDENTITY_SITE: "/enterprise-modules/SITES_WAREHOUSES",
    STATIONS_ASSETS: "/enterprise-modules/GAMING_STATIONS",
    TEAM_PERMISSIONS: "/enterprise-modules/HUMAN_RESOURCES",
    CATALOG_SERVICES: "/enterprise-modules/CATALOG",
    PRICING: "/enterprise-modules/GAMING_PRICING_PACKAGES",
    FINANCE_PAYMENTS: "/enterprise-modules/FINANCE_TREASURY",
    OPERATIONS: "/enterprise-modules/GAMING_BOOKINGS",
    CLOSE_REPORTING_AI: "/enterprise-modules/GAMING_DAILY_CLOSE",
  };
  return links[code];
}

async function computeGamingReadinessWithDb(db: ReadinessDb, organizationId: string, preferredSiteId?: string | null) {
  const organization = await assertGamingTenant(db, organizationId);
  const requestedSiteId = normalizedId(preferredSiteId);
  const [
    sites,
    stationProfiles,
    activeMembers,
    recommendedPositionCount,
    activeServiceCount,
    activePricingCount,
    financialAccountCount,
    financeReadiness,
    enabledModules,
  ] = await Promise.all([
    db.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }],
    }),
    db.enterpriseGamingStationProfile.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, assetId: true },
      orderBy: [{ sortOrder: "asc" }, { stationCode: "asc" }],
    }),
    db.organizationMember.count({ where: { organizationId, status: "ACTIVE", removedAt: null } }),
    db.enterprisePosition.count({
      where: { organizationId, positionCode: { in: [...GAMING_RECOMMENDED_POSITION_CODES] }, isActive: true },
    }),
    db.enterpriseCatalogItem.count({
      where: { organizationId, status: "ACTIVE", archivedAt: null, itemType: "SERVICE" },
    }),
    db.enterpriseGamingPricingRule.count({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
    }),
    db.enterpriseFinancialAccount.count({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
    }),
    resolveEnterpriseFinanceReadiness(db, organizationId, { mode: "SETUP" }),
    db.enterpriseModule.findMany({
      where: { organizationId, moduleCode: { in: [...GAMING_MODULE_CODES] }, isEnabled: true },
      select: { moduleCode: true },
    }),
  ]);

  const validAssets = stationProfiles.length
    ? await db.enterpriseAsset.count({
        where: {
          organizationId,
          id: { in: stationProfiles.map((station) => station.assetId) },
          archivedAt: null,
          status: { not: "DISPOSED" },
        },
      })
    : 0;
  const selectedSite = requestedSiteId
    ? sites.find((site) => site.id === requestedSiteId) || null
    : sites.length === 1 ? sites[0] : null;
  const enabled = new Set(enabledModules.map((module) => module.moduleCode));
  const operationalModulesReady = ["GAMING_BOOKINGS", "GAMING_SESSIONS", "GAMING_CHECKOUT"].every((code) => enabled.has(code));
  const closeReportingAiReady = ["GAMING_DAILY_CLOSE", "GAMING_DASHBOARD", "GAMING_REPORTS", "GAMING_TOURNAMENTS"].every((code) => enabled.has(code));

  const items = [
    {
      code: "IDENTITY_SITE" as const,
      complete: Boolean(organization.name.trim() && organization.country?.trim() && organization.timezone?.trim() && selectedSite),
      detail: { siteCount: sites.length, selectedSiteId: selectedSite?.id || null },
    },
    {
      code: "STATIONS_ASSETS" as const,
      complete: stationProfiles.length >= 5 && validAssets === stationProfiles.length,
      detail: { stationCount: stationProfiles.length, canonicalAssetCount: validAssets, launchBaseline: 5 },
    },
    {
      code: "TEAM_PERMISSIONS" as const,
      complete: activeMembers > 0 && recommendedPositionCount === GAMING_RECOMMENDED_POSITION_CODES.length,
      detail: { activeMembers, recommendedPositionCount, expectedPositionCount: GAMING_RECOMMENDED_POSITION_CODES.length },
    },
    {
      code: "CATALOG_SERVICES" as const,
      complete: activeServiceCount > 0,
      detail: { activeServiceCount },
    },
    {
      code: "PRICING" as const,
      complete: activePricingCount > 0,
      detail: { activePricingCount },
    },
    {
      code: "FINANCE_PAYMENTS" as const,
      complete: financeReadiness.ready && financialAccountCount > 0,
      detail: { financialAccountCount, blockers: financeReadiness.blockers.map((item) => item.code), warnings: financeReadiness.warnings.map((item) => item.code) },
    },
    {
      code: "OPERATIONS" as const,
      complete: operationalModulesReady,
      detail: { requiredModules: ["GAMING_BOOKINGS", "GAMING_SESSIONS", "GAMING_CHECKOUT"] },
    },
    {
      code: "CLOSE_REPORTING_AI" as const,
      complete: closeReportingAiReady,
      detail: { requiredModules: ["GAMING_DAILY_CLOSE", "GAMING_DASHBOARD", "GAMING_REPORTS", "GAMING_TOURNAMENTS"] },
    },
  ].map((item) => ({ ...item, deepLink: deepLink(item.code) }));

  const completed = items.filter((item) => item.complete).length;
  return {
    version: 1 as const,
    ready: completed === items.length,
    completed,
    total: items.length,
    currentStep: items.find((item) => !item.complete)?.code || "COMPLETE",
    items,
    selected: { preferredSiteId: selectedSite?.id || null },
    options: { sites },
  };
}

export async function getGamingSelfServiceOnboarding(organizationId: string) {
  const config = await prisma.enterpriseGamingConfiguration.findUnique({ where: { organizationId } });
  const settings = asSettings(config?.settingsJson);
  const readiness = await computeGamingReadinessWithDb(prisma, organizationId, settings.onboarding?.preferredSiteId || null);
  return { configurationRevision: config?.revision || 1, readiness };
}

export async function saveGamingSelfServiceOnboarding({
  organizationId,
  actorUserId,
  selection,
}: {
  organizationId: string;
  actorUserId: string;
  selection: GamingOnboardingSelection;
}) {
  return prisma.$transaction(async (tx) => {
    await assertGamingTenant(tx, organizationId);
    const config = await tx.enterpriseGamingConfiguration.findUnique({ where: { organizationId } });
    if (!config) throw new EnterpriseDomainError("GAMING_CONFIGURATION_REQUIRED", 409);
    if (selection.revision && selection.revision !== config.revision) {
      throw new EnterpriseDomainError("GAMING_ONBOARDING_REVISION_CONFLICT", 409);
    }
    const currentSettings = asSettings(config.settingsJson);
    const preferredSiteId = normalizedId(selection.preferredSiteId ?? currentSettings.onboarding?.preferredSiteId);
    const readiness = await computeGamingReadinessWithDb(tx, organizationId, preferredSiteId);
    const settings: GamingSettings = {
      ...currentSettings,
      onboardingVersion: 1,
      onboarding: {
        preferredSiteId: readiness.selected.preferredSiteId,
        currentStep: readiness.currentStep,
        completed: readiness.completed,
        total: readiness.total,
        ready: readiness.ready,
        checkedAt: new Date().toISOString(),
      },
    };
    const updated = await tx.enterpriseGamingConfiguration.updateMany({
      where: { id: config.id, organizationId, revision: config.revision },
      data: { settingsJson: settings as Prisma.InputJsonValue, updatedByUserId: actorUserId, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseDomainError("GAMING_ONBOARDING_REVISION_CONFLICT", 409);
    const latest = await tx.enterpriseGamingConfiguration.findUniqueOrThrow({ where: { organizationId } });
    return { configurationRevision: latest.revision, readiness };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
