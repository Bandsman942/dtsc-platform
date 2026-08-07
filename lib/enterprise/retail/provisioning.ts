import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RETAIL_PROFILE_CODE, RETAIL_SECTOR_CODE } from "@/lib/enterprise/retail/constants";

export const RETAIL_DEFAULT_PROVIDERS = [
  { providerCode: "MPESA", label: "M-Pesa", providerType: "MOBILE_MONEY" },
  { providerCode: "ORANGE_MONEY", label: "Orange Money", providerType: "MOBILE_MONEY" },
  { providerCode: "AIRTEL_MONEY", label: "Airtel Money", providerType: "MOBILE_MONEY" },
  { providerCode: "AFRIMONEY", label: "Afrimoney", providerType: "MOBILE_MONEY" },
  { providerCode: "VODACOM", label: "Vodacom", providerType: "TELCO" },
  { providerCode: "ORANGE", label: "Orange", providerType: "TELCO" },
  { providerCode: "AIRTEL", label: "Airtel", providerType: "TELCO" },
  { providerCode: "AFRICELL", label: "Africell", providerType: "TELCO" },
] as const;

export type RetailOnboardingProvisioningResult = {
  organizationId: string;
  sectorCode: string | null;
  businessProfileCode: typeof RETAIL_PROFILE_CODE | null;
  configurationStatus: "ACTIVE" | "INACTIVE" | null;
  providerCodes: string[];
};

async function provisionRetailBusinessProfileTx(
  tx: Prisma.TransactionClient,
  {
    organizationId,
    sectorCode,
    actorUserId,
  }: {
    organizationId: string;
    sectorCode: string | null;
    actorUserId: string;
  },
): Promise<RetailOnboardingProvisioningResult> {
  if (sectorCode !== RETAIL_SECTOR_CODE) {
    const existingConfiguration = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { id: true } });
    if (existingConfiguration) {
      await tx.enterpriseRetailConfiguration.update({ where: { organizationId }, data: { status: "INACTIVE", updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await tx.enterpriseRetailProvider.updateMany({ where: { organizationId, isActive: true }, data: { isActive: false } });
    }
    return { organizationId, sectorCode, businessProfileCode: null, configurationStatus: existingConfiguration ? "INACTIVE" : null, providerCodes: [] };
  }

  await tx.enterpriseRetailConfiguration.upsert({
    where: { organizationId },
    update: { profileCode: RETAIL_PROFILE_CODE, status: "ACTIVE", updatedByUserId: actorUserId, revision: { increment: 1 } },
    create: { organizationId, profileCode: RETAIL_PROFILE_CODE, baseCurrencyCode: "CDF", status: "ACTIVE", createdByUserId: actorUserId },
  });

  for (const provider of RETAIL_DEFAULT_PROVIDERS) {
    await tx.enterpriseRetailProvider.upsert({
      where: { organizationId_providerCode: { organizationId, providerCode: provider.providerCode } },
      update: { label: provider.label, providerType: provider.providerType, isActive: true, revision: { increment: 1 } },
      create: { organizationId, providerCode: provider.providerCode, label: provider.label, providerType: provider.providerType, isActive: true },
    });
  }

  return { organizationId, sectorCode, businessProfileCode: RETAIL_PROFILE_CODE, configurationStatus: "ACTIVE", providerCodes: RETAIL_DEFAULT_PROVIDERS.map((provider) => provider.providerCode) };
}

export async function syncRetailOnboardingProvisioning({ organizationId, sectorCode, actorUserId }: { organizationId: string; sectorCode: string | null; actorUserId: string }) {
  return prisma.$transaction((tx) => provisionRetailBusinessProfileTx(tx, { organizationId, sectorCode, actorUserId }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getRetailBusinessProfile(organizationId: string) {
  const configuration = await prisma.enterpriseRetailConfiguration.findUnique({
    where: { organizationId },
    select: { profileCode: true, status: true, baseCurrencyCode: true, defaultSiteId: true, defaultWarehouseId: true, defaultStorageLocationId: true },
  });
  if (!configuration) return null;
  return {
    code: configuration.profileCode,
    status: configuration.status,
    baseCurrencyCode: configuration.baseCurrencyCode,
    defaults: { siteId: configuration.defaultSiteId, warehouseId: configuration.defaultWarehouseId, storageLocationId: configuration.defaultStorageLocationId },
  };
}
