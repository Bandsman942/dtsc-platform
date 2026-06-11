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

  const [records, products, batches, qualityIncidents] = await Promise.all([prisma.enterpriseSectorRecord.findMany({
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
  }) : Promise.resolve([]), allowedModuleCodes.includes("BATCH_EXPIRY") ? prisma.pharmacyBatch.findMany({
    where: { organizationId },
    orderBy: { expiryDate: "asc" },
    include: { product: { select: { name: true } }, createdBy: { select: { name: true, email: true } } },
    take: 500,
  }) : Promise.resolve([]), allowedModuleCodes.includes("QUALITY_PHARMACOVIGILANCE") ? prisma.pharmacyQualityIncident.findMany({
    where: { organizationId },
    orderBy: { reportedAt: "desc" },
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
  const batchRecords = batches.map((batch) => ({
    id: batch.id,
    organizationId,
    sectorCode: PHARMACY_SECTOR_CODE,
    moduleCode: "BATCH_EXPIRY",
    recordType: "PHARMACY_BATCH",
    title: `${batch.product.name} · lot ${batch.batchNumber}`,
    summary: batch.notes,
    status: batch.status,
    priority: batch.recall || batch.quarantine ? "CRITICAL" : "NORMAL",
    assignedToUserId: batch.decisionResponsibleId,
    payloadJson: { productId: batch.productId, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate.toISOString().slice(0, 10), availableQuantity: Number(batch.availableQuantity), unit: batch.unit, location: batch.location },
    createdById: batch.createdById,
    updatedById: batch.updatedById,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    deletedAt: null,
    createdBy: batch.createdBy,
    assignedTo: null,
  }));
  const qualityRecords = qualityIncidents.map((incident) => ({
    id: incident.id, organizationId, sectorCode: PHARMACY_SECTOR_CODE, moduleCode: "QUALITY_PHARMACOVIGILANCE", recordType: "PHARMACY_QUALITY_INCIDENT",
    title: incident.title, summary: incident.description, status: incident.status, priority: incident.priority, assignedToUserId: incident.assignedToId,
    payloadJson: { incidentNumber: incident.incidentNumber, incidentType: incident.incidentType, category: incident.category, criticality: incident.criticality, productId: incident.productId, batchId: incident.batchId },
    createdById: incident.createdById, updatedById: incident.updatedById, createdAt: incident.createdAt, updatedAt: incident.updatedAt, deletedAt: null, createdBy: { name: null, email: "" }, assignedTo: null,
  }));
  return [...productRecords, ...batchRecords, ...qualityRecords, ...records.filter((record) => !["MEDICINES_PRODUCTS", "BATCH_EXPIRY", "STOCK_RECEIPTS", "SALES_DISPENSATION", "PRESCRIPTIONS", "SUPPLIERS_ORDERS", "CASH_INVOICES_PAYMENTS", "RETURNS_ADJUSTMENTS_LOSSES", "ALERTS_EXPIRY_LOW_STOCK", "QUALITY_PHARMACOVIGILANCE", "PHARMACY_DOCUMENTS", "PHARMACY_REPORTS", "PHARMACY_SETTINGS"].includes(record.moduleCode))];
}
