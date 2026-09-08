import {
  getBusinessSubtypeForSector,
  type BusinessSubtypeCode,
} from "@/lib/enterprise/business-subtype-registry";
import { RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";
import { getRetailBusinessProfile } from "@/lib/enterprise/retail/provisioning";
import { prisma } from "@/lib/prisma";

export const BUSINESS_SUBTYPE_SELECTION_VERSION = 1;

type BusinessSubtypeSelectionDb = Pick<
  typeof prisma,
  "organization" | "enterpriseBusinessSubtypeSelection"
>;

export type PersistBusinessSubtypeSelectionInput = {
  organizationId: string;
  sectorCode: string;
  businessSubtypeCode: BusinessSubtypeCode | null;
  actorUserId?: string | null;
  source?: "DTSC_ADMIN" | "SECTOR_TEMPLATE" | "COMPATIBILITY";
};

export async function persistBusinessSubtypeSelection({
  organizationId,
  sectorCode,
  businessSubtypeCode,
  actorUserId = null,
  source = "DTSC_ADMIN",
}: PersistBusinessSubtypeSelectionInput, db: BusinessSubtypeSelectionDb = prisma) {
  const normalizedSectorCode = sectorCode.trim().toUpperCase();
  if (!normalizedSectorCode) {
    throw new Error("BUSINESS_SUBTYPE_SECTOR_REQUIRED");
  }
  if (businessSubtypeCode && !getBusinessSubtypeForSector(normalizedSectorCode, businessSubtypeCode)) {
    throw new Error("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH");
  }

  const organization = await db.organization.findFirst({
    where: {
      id: organizationId,
      deletedAt: null,
      sectorCode: normalizedSectorCode,
    },
    select: { id: true },
  });
  if (!organization) {
    throw new Error("BUSINESS_SUBTYPE_ORGANIZATION_SECTOR_MISMATCH");
  }

  return db.enterpriseBusinessSubtypeSelection.upsert({
    where: { organizationId },
    update: {
      sectorCode: normalizedSectorCode,
      businessSubtypeCode,
      selectionVersion: BUSINESS_SUBTYPE_SELECTION_VERSION,
      source,
      selectedByUserId: actorUserId,
    },
    create: {
      organizationId,
      sectorCode: normalizedSectorCode,
      businessSubtypeCode,
      selectionVersion: BUSINESS_SUBTYPE_SELECTION_VERSION,
      source,
      selectedByUserId: actorUserId,
    },
  });
}

export async function getBusinessSubtypeSelection(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, sectorCode: true },
  });
  if (!organization?.sectorCode) {
    return null;
  }

  const persisted = await prisma.enterpriseBusinessSubtypeSelection.findUnique({
    where: { organizationId },
  });
  if (persisted && persisted.sectorCode === organization.sectorCode) {
    const subtype = persisted.businessSubtypeCode
      ? getBusinessSubtypeForSector(organization.sectorCode, persisted.businessSubtypeCode)
      : null;
    return {
      sectorCode: organization.sectorCode,
      businessSubtypeCode: subtype?.code || null,
      selectionVersion: persisted.selectionVersion,
      source: persisted.source,
      compatibilityFallback: false,
    };
  }

  // During the cutover, historical Retail tenants may not have the generic row
  // until the additive migration is deployed. Preserve their effective Shop/general
  // classification from the existing Retail compatibility contract.
  if (organization.sectorCode === RETAIL_SECTOR_CODE) {
    const profile = await getRetailBusinessProfile(organizationId);
    return {
      sectorCode: organization.sectorCode,
      businessSubtypeCode: profile?.businessSubtypeCode ?? null,
      selectionVersion: BUSINESS_SUBTYPE_SELECTION_VERSION,
      source: "RETAIL_COMPATIBILITY",
      compatibilityFallback: true,
    };
  }

  return {
    sectorCode: organization.sectorCode,
    businessSubtypeCode: null,
    selectionVersion: BUSINESS_SUBTYPE_SELECTION_VERSION,
    source: "SECTOR_DEFAULT",
    compatibilityFallback: true,
  };
}
