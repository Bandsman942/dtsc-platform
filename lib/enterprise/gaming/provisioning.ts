import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import {
  GAMING_BUSINESS_SUBTYPE_CODE,
  GAMING_MODULE_CODES,
  GAMING_SECTOR_CODE,
  isGamingLoungeSubtype,
} from "@/lib/enterprise/gaming/domain";

const GAMING_POSITIONS = [
  {
    positionCode: "GAMING_MANAGER",
    labelFr: "Gérant / Administrateur Gaming",
    labelEn: "Gaming manager / administrator",
    hierarchyLevel: 4,
    isKeyPosition: true,
    permissions: [
      "enterprise.gaming.overview.read", "enterprise.gaming.overview.manage",
      "enterprise.gaming.stations.read", "enterprise.gaming.stations.create", "enterprise.gaming.stations.update", "enterprise.gaming.stations.manage",
      "enterprise.gaming.sessions.read", "enterprise.gaming.sessions.create", "enterprise.gaming.sessions.update", "enterprise.gaming.sessions.manage",
      "enterprise.gaming.bookings.read", "enterprise.gaming.bookings.create", "enterprise.gaming.bookings.update", "enterprise.gaming.bookings.manage",
      "enterprise.gaming.pricing.read", "enterprise.gaming.pricing.create", "enterprise.gaming.pricing.update", "enterprise.gaming.pricing.manage",
      "enterprise.gaming.checkout.read", "enterprise.gaming.checkout.create", "enterprise.gaming.checkout.update", "enterprise.gaming.checkout.manage",
      "enterprise.gaming.close.read", "enterprise.gaming.close.create", "enterprise.gaming.close.update", "enterprise.gaming.close.manage",
      "enterprise.gaming.tournaments.read", "enterprise.gaming.tournaments.create", "enterprise.gaming.tournaments.update", "enterprise.gaming.tournaments.manage",
      "enterprise.gaming.reports.read", "enterprise.gaming.reports.create", "enterprise.gaming.reports.manage",
    ],
  },
  {
    positionCode: "GAMING_OPERATOR_CASHIER",
    labelFr: "Caissier / Opérateur Gaming",
    labelEn: "Gaming cashier / operator",
    hierarchyLevel: 2,
    isKeyPosition: false,
    permissions: [
      "enterprise.gaming.overview.read",
      "enterprise.gaming.stations.read",
      "enterprise.gaming.sessions.read", "enterprise.gaming.sessions.create", "enterprise.gaming.sessions.update",
      "enterprise.gaming.bookings.read", "enterprise.gaming.bookings.create", "enterprise.gaming.bookings.update",
      "enterprise.gaming.checkout.read", "enterprise.gaming.checkout.create", "enterprise.gaming.checkout.update",
      "enterprise.gaming.close.read", "enterprise.gaming.close.create",
    ],
  },
  {
    positionCode: "GAMING_TECHNICIAN",
    labelFr: "Technicien Gaming",
    labelEn: "Gaming technician",
    hierarchyLevel: 2,
    isKeyPosition: false,
    permissions: [
      "enterprise.gaming.stations.read", "enterprise.gaming.stations.update",
      "enterprise.assets.read", "enterprise.assets.update",
    ],
  },
  {
    positionCode: "GAMING_FINANCE_ACCOUNTANT",
    labelFr: "Finance / Comptable Gaming",
    labelEn: "Gaming finance / accountant",
    hierarchyLevel: 3,
    isKeyPosition: false,
    permissions: [
      "enterprise.gaming.overview.read", "enterprise.gaming.checkout.read",
      "enterprise.gaming.close.read", "enterprise.gaming.close.manage",
      "enterprise.gaming.reports.read", "enterprise.gaming.reports.create",
      "enterprise.finance.receivables.read", "enterprise.finance.payments.read", "enterprise.finance.treasury.read",
    ],
  },
] as const;

const GAMING_ACTIVITY_BLOCKS = [
  {
    blockCode: "GAMING_REPORT_BREAKDOWN",
    labelFr: "Signaler une panne Gaming",
    labelEn: "Report a Gaming breakdown",
    descriptionFr: "Ouvrir le domaine Actifs & maintenance pour signaler l’incident sur l’actif canonique du poste.",
    descriptionEn: "Open Assets & maintenance to report the incident on the station canonical asset.",
    icon: "triangle-alert",
    targetModuleCode: "ASSETS_MAINTENANCE",
    sortOrder: 410,
  },
  {
    blockCode: "GAMING_REQUEST_MAINTENANCE",
    labelFr: "Demander une maintenance",
    labelEn: "Request maintenance",
    descriptionFr: "Créer ou suivre la maintenance dans le domaine Actifs canonique, sans registre Gaming parallèle.",
    descriptionEn: "Create or track maintenance in the canonical Assets domain without a parallel Gaming registry.",
    icon: "wrench",
    targetModuleCode: "ASSETS_MAINTENANCE",
    sortOrder: 420,
  },
  {
    blockCode: "GAMING_CASH_VARIANCE",
    labelFr: "Signaler un écart de caisse",
    labelEn: "Report a cash variance",
    descriptionFr: "Ouvrir la clôture Gaming, rapprochée avec les comptes et paiements du domaine Finance commun.",
    descriptionEn: "Open Gaming daily close reconciled with shared Finance accounts and payments.",
    icon: "badge-alert",
    targetModuleCode: "GAMING_DAILY_CLOSE",
    sortOrder: 430,
  },
  {
    blockCode: "GAMING_PRICING_EXCEPTION",
    labelFr: "Demander une dérogation tarifaire",
    labelEn: "Request a pricing exception",
    descriptionFr: "Ouvrir les tarifs Gaming ; toute dérogation reste soumise aux permissions, au motif et à l’audit.",
    descriptionEn: "Open Gaming pricing; every exception remains permission-, reason-, and audit-controlled.",
    icon: "badge-dollar-sign",
    targetModuleCode: "GAMING_PRICING_PACKAGES",
    sortOrder: 440,
  },
  {
    blockCode: "GAMING_SERVICE_REPORT",
    labelFr: "Rapport de service Gaming",
    labelEn: "Gaming service report",
    descriptionFr: "Ouvrir les rapports Gaming construits sur le framework Reports commun.",
    descriptionEn: "Open Gaming reports built on the shared Reports framework.",
    icon: "file-chart-column",
    targetModuleCode: "GAMING_REPORTS",
    sortOrder: 450,
  },
] as const;

export const GAMING_RECOMMENDED_POSITION_CODES = GAMING_POSITIONS.map((position) => position.positionCode);
export const GAMING_ACTIVITY_BLOCK_CODES = GAMING_ACTIVITY_BLOCKS.map((block) => block.blockCode);

export async function syncGamingOnboardingProvisioning({
  organizationId,
  sectorCode,
  businessSubtypeCode,
  actorUserId,
}: {
  organizationId: string;
  sectorCode: string | null | undefined;
  businessSubtypeCode: string | null | undefined;
  actorUserId: string;
}) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, sectorId: true, sectorCode: true },
  });
  if (!organization) throw new Error("GAMING_ORGANIZATION_NOT_FOUND");

  const enabled = isGamingLoungeSubtype(sectorCode, businessSubtypeCode)
    && organization.sectorCode === GAMING_SECTOR_CODE;

  if (!enabled) {
    const [disabledModules, disabledBlocks] = await prisma.$transaction([
      prisma.enterpriseModule.updateMany({
        where: { organizationId, moduleCode: { in: [...GAMING_MODULE_CODES] }, isEnabled: true },
        data: { isEnabled: false },
      }),
      prisma.enterpriseActivityBlock.updateMany({
        where: { organizationId, blockCode: { in: [...GAMING_ACTIVITY_BLOCK_CODES] }, isEnabled: true },
        data: { isEnabled: false },
      }),
    ]);
    return { enabled: false, moduleCount: 0, disabledModuleCount: disabledModules.count, positionCount: 0, activityBlockCount: 0, disabledActivityBlockCount: disabledBlocks.count };
  }

  const persistedSubtype = await prisma.enterpriseBusinessSubtypeSelection.findUnique({
    where: { organizationId },
    select: { sectorCode: true, businessSubtypeCode: true },
  });
  if (!persistedSubtype || !isGamingLoungeSubtype(persistedSubtype.sectorCode, persistedSubtype.businessSubtypeCode)) {
    throw new Error("GAMING_SUBTYPE_SELECTION_REQUIRED");
  }

  await prisma.enterpriseGamingConfiguration.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, settingsJson: { onboardingVersion: 1 }, createdByUserId: actorUserId },
  });

  let moduleCount = 0;
  for (const moduleCode of GAMING_MODULE_CODES) {
    const definition = getEnterpriseModuleDefinition(moduleCode);
    if (!definition) throw new Error(`GAMING_MODULE_DEFINITION_MISSING:${moduleCode}`);
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: {
        sectorId: organization.sectorId,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: true,
        isCore: false,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
      create: {
        organizationId,
        sectorId: organization.sectorId,
        moduleCode,
        labelFr: definition.labelFr,
        labelEn: definition.labelEn,
        descriptionFr: definition.descriptionFr,
        descriptionEn: definition.descriptionEn,
        moduleCategory: definition.domain,
        icon: definition.iconKey,
        isEnabled: true,
        isCore: false,
        sourceTemplateId: null,
        requiresPlanLevel: definition.minimumPlan,
        sortOrder: definition.navigationOrder,
      },
    });
    moduleCount += 1;
  }

  let positionCount = 0;
  for (const position of GAMING_POSITIONS) {
    await prisma.enterprisePosition.upsert({
      where: { organizationId_positionCode: { organizationId, positionCode: position.positionCode } },
      update: {
        labelFr: position.labelFr,
        labelEn: position.labelEn,
        hierarchyLevel: position.hierarchyLevel,
        permissionsJson: [...position.permissions],
        isActive: true,
        isKeyPosition: position.isKeyPosition,
      },
      create: {
        organizationId,
        sectorId: organization.sectorId,
        positionCode: position.positionCode,
        labelFr: position.labelFr,
        labelEn: position.labelEn,
        departmentId: null,
        hierarchyLevel: position.hierarchyLevel,
        descriptionFr: `Poste recommandé pour le sous-secteur ${GAMING_BUSINESS_SUBTYPE_CODE}.`,
        descriptionEn: `Recommended position for the ${GAMING_BUSINESS_SUBTYPE_CODE} business subtype.`,
        permissionsJson: [...position.permissions],
        isActive: true,
        isKeyPosition: position.isKeyPosition,
        sourceTemplateId: null,
      },
    });
    positionCount += 1;
  }

  let activityBlockCount = 0;
  for (const block of GAMING_ACTIVITY_BLOCKS) {
    await prisma.enterpriseActivityBlock.upsert({
      where: { organizationId_blockCode: { organizationId, blockCode: block.blockCode } },
      update: {
        sectorId: organization.sectorId,
        labelFr: block.labelFr,
        labelEn: block.labelEn,
        descriptionFr: block.descriptionFr,
        descriptionEn: block.descriptionEn,
        icon: block.icon,
        targetModuleCode: block.targetModuleCode,
        isEnabled: true,
        sortOrder: block.sortOrder,
      },
      create: {
        organizationId,
        sectorId: organization.sectorId,
        blockCode: block.blockCode,
        labelFr: block.labelFr,
        labelEn: block.labelEn,
        descriptionFr: block.descriptionFr,
        descriptionEn: block.descriptionEn,
        icon: block.icon,
        targetModuleCode: block.targetModuleCode,
        isEnabled: true,
        sortOrder: block.sortOrder,
        sourceTemplateId: null,
      },
    });
    activityBlockCount += 1;
  }

  return { enabled: true, moduleCount, disabledModuleCount: 0, positionCount, activityBlockCount, disabledActivityBlockCount: 0 };
}
