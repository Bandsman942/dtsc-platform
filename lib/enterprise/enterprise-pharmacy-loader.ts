import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

const PHARMACY_SECTOR_CODE = "PHARMACY";

export async function getEnterprisePharmacyDataset(organizationId: string, sectorCode: string | null | undefined) {
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
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  }), allowedModuleCodes.includes("MEDICINES_PRODUCTS") ? prisma.pharmacyProduct.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    include: { createdBy: { select: { name: true, email: true } } },
    take: 500,
  }) : Promise.resolve([])]);
  const productRecords = products.map((product) => ({
    id: product.id,
    organizationId,
    sectorCode: PHARMACY_SECTOR_CODE,
    moduleCode: "MEDICINES_PRODUCTS",
    recordType: "PHARMACY_PRODUCT",
    title: product.name,
    summary: product.genericName,
    status: product.status,
    priority: "NORMAL",
    assignedToUserId: null,
    payloadJson: { internalCode: product.internalCode, barcode: product.barcode, category: product.category, pharmaceuticalForm: product.pharmaceuticalForm, dosage: product.dosage },
    createdById: product.createdById,
    updatedById: product.updatedById,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    deletedAt: null,
    createdBy: product.createdBy,
    assignedTo: null,
  }));
  return [...productRecords, ...records.filter((record) => record.moduleCode !== "MEDICINES_PRODUCTS")];
}
