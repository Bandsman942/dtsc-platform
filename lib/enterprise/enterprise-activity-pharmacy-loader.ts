import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

const PHARMACY_SECTOR_CODE = "PHARMACY";

export async function getEnterpriseActivityPharmacyRecords(organizationId: string, sectorCode: string | null | undefined) {
  if (sectorCode !== PHARMACY_SECTOR_CODE) {
    return [];
  }
  const entitlements = await getOrganizationEntitlements(organizationId);
  const allowedModuleCodes = (entitlements?.modules || []).filter((enterpriseModule) => enterpriseModule.allowed).map((enterpriseModule) => enterpriseModule.moduleCode);
  if (!allowedModuleCodes.length) {
    return [];
  }

  const [records, products] = await Promise.all([prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: { in: allowedModuleCodes }, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: { id: true, moduleCode: true, title: true, status: true, payloadJson: true },
  }), allowedModuleCodes.includes("MEDICINES_PRODUCTS") ? prisma.pharmacyProduct.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, internalCode: true, genericName: true },
    take: 500,
  }) : Promise.resolve([])]);
  return [
    ...products.map((product) => ({ id: product.id, moduleCode: "MEDICINES_PRODUCTS", title: product.name, status: product.status, payloadJson: { internalCode: product.internalCode, genericName: product.genericName } })),
    ...records.filter((record) => record.moduleCode !== "MEDICINES_PRODUCTS"),
  ];
}
