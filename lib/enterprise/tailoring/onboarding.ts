import { Prisma } from "@prisma/client";
import { z } from "zod";
import { resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import { MANUFACTURING_SECTOR_CODE } from "@/lib/enterprise/manufacturing/constants";
import { prisma } from "@/lib/prisma";
import {
  TAILORING_BUSINESS_SUBTYPE_CODE,
  TAILORING_MEASUREMENT_UNITS,
  TAILORING_OPERATING_MODES,
} from "@/lib/enterprise/tailoring/constants";
import { TailoringConflictError, TailoringDomainError } from "@/lib/enterprise/tailoring/errors";

const BUSINESS_MODE_TO_CANONICAL = {
  SUR_MESURE: "MADE_TO_MEASURE",
  PRET_A_PORTER: "READY_TO_WEAR",
  MIXTE: "MIXED",
} as const;
const CANONICAL_TO_BUSINESS_MODE = {
  MADE_TO_MEASURE: "SUR_MESURE",
  READY_TO_WEAR: "PRET_A_PORTER",
  MIXED: "MIXTE",
} as const;

export const TAILORING_ONBOARDING_STEPS = [
  "IDENTITY",
  "SITES_WAREHOUSES",
  "TEAM",
  "CATALOG",
  "INITIAL_STOCK",
  "FINANCE",
  "PRODUCTION",
  "TAILORING_CONFIGURATION",
] as const;

export type TailoringOnboardingStep = (typeof TAILORING_ONBOARDING_STEPS)[number];
export type TailoringCanonicalOperatingMode = (typeof TAILORING_OPERATING_MODES)[number];
export type TailoringBusinessOperatingMode = keyof typeof BUSINESS_MODE_TO_CANONICAL;
type ReadinessDb = Prisma.TransactionClient | typeof prisma;

const optionalId = z.string().trim().min(1).max(180).optional().nullable().or(z.literal(""));
export const tailoringOnboardingSelectionSchema = z.object({
  operatingMode: z.enum([
    ...TAILORING_OPERATING_MODES,
    "SUR_MESURE",
    "PRET_A_PORTER",
    "MIXTE",
  ] as [TailoringCanonicalOperatingMode | TailoringBusinessOperatingMode, ...(TailoringCanonicalOperatingMode | TailoringBusinessOperatingMode)[]]).optional(),
  preferredSiteId: optionalId,
  preferredWarehouseId: optionalId,
  revision: z.coerce.number().int().positive().optional(),
}).strict();

export type TailoringOnboardingSelection = z.infer<typeof tailoringOnboardingSelectionSchema>;

function normalizeId(value: string | null | undefined) {
  const normalized = value?.trim() || "";
  return normalized || null;
}

export function normalizeTailoringOperatingMode(value: string | null | undefined): TailoringCanonicalOperatingMode {
  const normalized = (value || "MIXED").trim().toUpperCase();
  if (normalized in BUSINESS_MODE_TO_CANONICAL) {
    return BUSINESS_MODE_TO_CANONICAL[normalized as TailoringBusinessOperatingMode];
  }
  if ((TAILORING_OPERATING_MODES as readonly string[]).includes(normalized)) {
    return normalized as TailoringCanonicalOperatingMode;
  }
  throw new TailoringDomainError("Le mode Couture sélectionné n’est pas reconnu.", 400, "TAILORING_OPERATING_MODE_INVALID");
}

export function tailoringBusinessOperatingMode(value: string | null | undefined): TailoringBusinessOperatingMode {
  return CANONICAL_TO_BUSINESS_MODE[normalizeTailoringOperatingMode(value)];
}

function uniqueOrNull<T>(items: T[]) {
  return items.length === 1 ? items[0] : null;
}

async function assertTailoringOnboardingTenant(db: ReadinessDb, organizationId: string) {
  const [organization, subtype] = await Promise.all([
    db.organization.findFirst({
      where: {
        id: organizationId,
        status: "ACTIVE",
        deletedAt: null,
        organizationType: "CLIENT",
        sectorCode: MANUFACTURING_SECTOR_CODE,
      },
      select: { id: true, name: true, country: true, timezone: true, sectorCode: true },
    }),
    db.enterpriseBusinessSubtypeSelection.findUnique({
      where: { organizationId },
      select: { sectorCode: true, businessSubtypeCode: true },
    }),
  ]);
  if (!organization) throw new TailoringDomainError("L’entreprise Couture active est introuvable.", 404, "TAILORING_ONBOARDING_ORGANIZATION_NOT_FOUND");
  if (subtype?.sectorCode !== MANUFACTURING_SECTOR_CODE || subtype.businessSubtypeCode !== TAILORING_BUSINESS_SUBTYPE_CODE) {
    throw new TailoringDomainError("Cette mise en service est réservée au sous-secteur Couture.", 403, "TAILORING_ONBOARDING_SUBTYPE_REQUIRED");
  }
  return organization;
}

function onboardingDeepLink(code: TailoringOnboardingStep) {
  const links: Record<TailoringOnboardingStep, string> = {
    IDENTITY: "/enterprise-admin",
    SITES_WAREHOUSES: "/enterprise-modules/SITES_WAREHOUSES",
    TEAM: "/enterprise-modules/HUMAN_RESOURCES",
    CATALOG: "/enterprise-modules/CATALOG",
    INITIAL_STOCK: "/enterprise-modules/INVENTORY_LOGISTICS",
    FINANCE: "/enterprise-modules/FINANCE_ACCOUNTING",
    PRODUCTION: "/enterprise-modules/MANUFACTURING_OVERVIEW",
    TAILORING_CONFIGURATION: "/enterprise-tailoring/TAILORING_OVERVIEW",
  };
  return links[code];
}

async function computeTailoringReadinessWithDb(
  db: ReadinessDb,
  organizationId: string,
  selection: Pick<TailoringOnboardingSelection, "operatingMode" | "preferredSiteId" | "preferredWarehouseId"> = {},
) {
  const organization = await assertTailoringOnboardingTenant(db, organizationId);
  const [
    sites,
    warehouses,
    activeMembers,
    activeEmployees,
    catalogCount,
    trackedCatalogCount,
    inventoryItemCount,
    positiveInventoryBalances,
    manufacturingConfiguration,
    workCenterCount,
    activeBomCount,
    activeRoutingCount,
    tailoringConfiguration,
    financeReadiness,
  ] = await Promise.all([
    db.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    db.enterpriseWarehouse.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ siteId: "asc" }, { code: "asc" }],
      select: { id: true, siteId: true, code: true, name: true },
    }),
    db.organizationMember.count({ where: { organizationId, status: "ACTIVE", removedAt: null } }),
    db.enterpriseEmployee.count({ where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null } }),
    db.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseCatalogItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null, trackInventory: true } }),
    db.enterpriseInventoryItem.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseInventoryBalance.count({ where: { organizationId, quantityOnHand: { gt: 0 } } }),
    db.enterpriseManufacturingConfiguration.findUnique({ where: { organizationId } }),
    db.enterpriseManufacturingWorkCenter.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseBillOfMaterial.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseManufacturingRouting.count({ where: { organizationId, status: "ACTIVE", archivedAt: null } }),
    db.enterpriseTailoringConfiguration.findUnique({ where: { organizationId } }),
    resolveEnterpriseFinanceReadiness(db, organizationId, { mode: "SETUP" }),
  ]);

  const requestedSiteId = normalizeId(selection.preferredSiteId);
  const requestedWarehouseId = normalizeId(selection.preferredWarehouseId);
  const requestedSite = requestedSiteId ? sites.find((item) => item.id === requestedSiteId) || null : null;
  const requestedWarehouse = requestedWarehouseId ? warehouses.find((item) => item.id === requestedWarehouseId) || null : null;
  let selectedSite = requestedSite
    || (requestedWarehouse ? sites.find((item) => item.id === requestedWarehouse.siteId) || null : null)
    || uniqueOrNull(sites);
  let warehouseCandidates = warehouses.filter((item) => !selectedSite || item.siteId === selectedSite.id);
  const selectedWarehouse = requestedWarehouse && (!selectedSite || requestedWarehouse.siteId === selectedSite.id)
    ? requestedWarehouse
    : uniqueOrNull(warehouseCandidates);
  if (!selectedSite && selectedWarehouse) {
    selectedSite = sites.find((item) => item.id === selectedWarehouse.siteId) || null;
    warehouseCandidates = warehouses.filter((item) => item.siteId === selectedSite?.id);
  }

  const configuredOperatingMode = normalizeTailoringOperatingMode(selection.operatingMode || tailoringConfiguration?.operatingMode || "MIXED");
  const defaultMeasurementUnitValid = Boolean(
    tailoringConfiguration?.defaultMeasurementUnit
    && (TAILORING_MEASUREMENT_UNITS as readonly string[]).includes(tailoringConfiguration.defaultMeasurementUnit),
  );
  const configuredWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
  const manufacturingDefaultsReady = Boolean(
    manufacturingConfiguration?.defaultMaterialWarehouseId
    && manufacturingConfiguration.defaultOutputWarehouseId
    && configuredWarehouseIds.has(manufacturingConfiguration.defaultMaterialWarehouseId)
    && configuredWarehouseIds.has(manufacturingConfiguration.defaultOutputWarehouseId),
  );

  const items = [
    {
      code: "IDENTITY" as const,
      complete: Boolean(organization.name.trim() && organization.country?.trim() && organization.timezone?.trim()),
      detail: { countryConfigured: Boolean(organization.country?.trim()), timezoneConfigured: Boolean(organization.timezone?.trim()) },
    },
    {
      code: "SITES_WAREHOUSES" as const,
      complete: Boolean(selectedSite && selectedWarehouse),
      detail: { siteCount: sites.length, warehouseCount: warehouses.length, selectedSiteName: selectedSite?.name || null, selectedWarehouseName: selectedWarehouse?.name || null },
    },
    {
      code: "TEAM" as const,
      complete: activeMembers > 0 && activeEmployees > 0,
      detail: { activeMembers, activeEmployees },
    },
    {
      code: "CATALOG" as const,
      complete: catalogCount > 0 && trackedCatalogCount > 0,
      detail: { activeItems: catalogCount, inventoryTrackedItems: trackedCatalogCount },
    },
    {
      code: "INITIAL_STOCK" as const,
      complete: inventoryItemCount > 0 && positiveInventoryBalances > 0,
      detail: { inventoryItems: inventoryItemCount, positiveBalances: positiveInventoryBalances },
    },
    {
      code: "FINANCE" as const,
      complete: financeReadiness.ready,
      detail: { blockers: financeReadiness.blockers.map((item) => item.code), warnings: financeReadiness.warnings.map((item) => item.code) },
    },
    {
      code: "PRODUCTION" as const,
      complete: Boolean(manufacturingConfiguration && manufacturingDefaultsReady && workCenterCount > 0 && activeBomCount > 0 && activeRoutingCount > 0),
      detail: { manufacturingConfigured: Boolean(manufacturingConfiguration), warehouseDefaultsConfigured: manufacturingDefaultsReady, activeWorkCenters: workCenterCount, activeBoms: activeBomCount, activeRoutings: activeRoutingCount },
    },
    {
      code: "TAILORING_CONFIGURATION" as const,
      complete: Boolean(tailoringConfiguration && defaultMeasurementUnitValid),
      detail: { operatingMode: configuredOperatingMode, businessModeCode: tailoringBusinessOperatingMode(configuredOperatingMode), defaultMeasurementUnit: tailoringConfiguration?.defaultMeasurementUnit || null },
    },
  ].map((item) => ({ ...item, deepLink: onboardingDeepLink(item.code) }));

  const completed = items.filter((item) => item.complete).length;
  const currentStep = items.find((item) => !item.complete)?.code || "COMPLETE";
  return {
    version: 1 as const,
    ready: completed === items.length,
    completed,
    total: items.length,
    currentStep,
    items,
    selected: {
      operatingMode: configuredOperatingMode,
      businessModeCode: tailoringBusinessOperatingMode(configuredOperatingMode),
      preferredSiteId: selectedSite?.id || null,
      preferredWarehouseId: selectedWarehouse?.id || null,
    },
    options: { sites, warehouses },
  };
}

export async function getCanonicalTailoringReadiness(organizationId: string) {
  const run = await prisma.enterpriseTailoringOnboardingRun.findUnique({ where: { organizationId } });
  return computeTailoringReadinessWithDb(prisma, organizationId, run || {});
}

export async function getTailoringSelfServiceOnboarding(organizationId: string) {
  const latestRun = await prisma.enterpriseTailoringOnboardingRun.findUnique({ where: { organizationId } });
  const readiness = await computeTailoringReadinessWithDb(prisma, organizationId, latestRun || {});
  return { latestRun, readiness };
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function saveTailoringSelfServiceOnboarding({
  organizationId,
  actorUserId,
  selection,
}: {
  organizationId: string;
  actorUserId: string;
  selection: TailoringOnboardingSelection;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertTailoringOnboardingTenant(tx, organizationId);
      const [currentRun, currentConfiguration] = await Promise.all([
        tx.enterpriseTailoringOnboardingRun.findUnique({ where: { organizationId } }),
        tx.enterpriseTailoringConfiguration.findUnique({ where: { organizationId } }),
      ]);
      if (!currentConfiguration) {
        throw new TailoringDomainError("La configuration Couture doit d’abord être provisionnée.", 409, "TAILORING_CONFIGURATION_REQUIRED");
      }
      if (selection.revision && currentRun && selection.revision !== currentRun.revision) {
        throw new TailoringConflictError("La mise en service a été modifiée. Rechargez puis réessayez.", "TAILORING_ONBOARDING_REVISION_CONFLICT");
      }

      const operatingMode = normalizeTailoringOperatingMode(selection.operatingMode || currentRun?.operatingMode || currentConfiguration.operatingMode);
      if (operatingMode !== currentConfiguration.operatingMode) {
        const configurationUpdate = await tx.enterpriseTailoringConfiguration.updateMany({
          where: { organizationId, revision: currentConfiguration.revision },
          data: { operatingMode, updatedByUserId: actorUserId, revision: { increment: 1 } },
        });
        if (configurationUpdate.count !== 1) throw new TailoringConflictError();
      }

      const readiness = await computeTailoringReadinessWithDb(tx, organizationId, {
        operatingMode,
        preferredSiteId: selection.preferredSiteId ?? currentRun?.preferredSiteId ?? null,
        preferredWarehouseId: selection.preferredWarehouseId ?? currentRun?.preferredWarehouseId ?? null,
      });
      const status = readiness.ready ? "COMPLETED" : "IN_PROGRESS";
      const blockedReason = readiness.ready ? null : readiness.currentStep;

      if (currentRun) {
        const updated = await tx.enterpriseTailoringOnboardingRun.updateMany({
          where: { id: currentRun.id, organizationId, revision: currentRun.revision },
          data: {
            status,
            currentStep: readiness.currentStep,
            operatingMode,
            preferredSiteId: readiness.selected.preferredSiteId,
            preferredWarehouseId: readiness.selected.preferredWarehouseId,
            readinessJson: jsonValue(readiness),
            blockedReason,
            completedAt: readiness.ready ? new Date() : null,
            updatedByUserId: actorUserId,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new TailoringConflictError("La mise en service a été modifiée. Rechargez puis réessayez.", "TAILORING_ONBOARDING_REVISION_CONFLICT");
      } else {
        await tx.enterpriseTailoringOnboardingRun.create({
          data: {
            organizationId,
            status,
            currentStep: readiness.currentStep,
            operatingMode,
            preferredSiteId: readiness.selected.preferredSiteId,
            preferredWarehouseId: readiness.selected.preferredWarehouseId,
            readinessJson: jsonValue(readiness),
            blockedReason,
            completedAt: readiness.ready ? new Date() : null,
            createdByUserId: actorUserId,
          },
        });
      }

      const latestRun = await tx.enterpriseTailoringOnboardingRun.findUniqueOrThrow({ where: { organizationId } });
      return { latestRun, readiness };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TailoringConflictError("La mise en service a été modifiée en parallèle. Rechargez puis réessayez.", "TAILORING_ONBOARDING_REVISION_CONFLICT");
    }
    throw error;
  }
}
