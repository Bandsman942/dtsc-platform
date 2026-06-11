import { createHash } from "node:crypto";
import type { z } from "zod";
import type { pharmacyDocumentMetadataSchema } from "@/lib/pharmacy-document-validators";
import { prisma } from "@/lib/prisma";
import { uploadPharmacyDocumentToSupabase } from "@/lib/supabase-storage";

type DocumentInput = z.infer<typeof pharmacyDocumentMetadataSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;
const activeDocumentStatuses = ["DRAFT", "ACTIVE", "TO_VERIFY", "VALIDATED", "TO_RENEW"];
const ruleDefinitions = [
  ["SUPPLIER_COMPLIANCE", "Conformité fournisseur active", "PharmacySupplier", "SUPPLIER_COMPLIANCE", "HIGH"],
  ["RECEIPT_DELIVERY_NOTE", "Bon de livraison de réception validée", "PharmacyReceipt", "DELIVERY_NOTE", "HIGH"],
  ["DESTRUCTION_MINUTES", "Procès-verbal de destruction", "PharmacyReturnLossEvent", "DESTRUCTION_MINUTES", "CRITICAL"],
  ["CRITICAL_INCIDENT_PROOF", "Preuve d'incident qualité critique", "PharmacyQualityIncident", "QUALITY_INCIDENT_REPORT", "CRITICAL"],
  ["RECALLED_BATCH_PROOF", "Document de rappel de lot", "PharmacyBatch", "RECALL_DOCUMENT", "CRITICAL"],
] as const;

export async function ensurePharmacyDocumentRules(organizationId: string) {
  await prisma.$transaction(ruleDefinitions.map(([ruleCode, label, entityType, documentType]) => prisma.pharmacyDocumentComplianceRule.upsert({ where: { organizationId_ruleCode: { organizationId, ruleCode } }, create: { organizationId, ruleCode, label, entityType, documentType, defaultConfidentialityLevel: entityType === "PharmacyQualityIncident" ? "QUALITY_ONLY" : "INTERNAL" }, update: {} })));
}

async function entityExists(organizationId: string, entityType: string, entityId: string) {
  if (entityType === "PharmacyProduct") return Boolean(await prisma.pharmacyProduct.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyBatch") return Boolean(await prisma.pharmacyBatch.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacySupplier") return Boolean(await prisma.pharmacySupplier.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyPurchaseOrder") return Boolean(await prisma.pharmacyPurchaseOrder.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyReceipt") return Boolean(await prisma.pharmacyReceipt.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacySale") return Boolean(await prisma.pharmacySale.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyPayment") return Boolean(await prisma.pharmacyPayment.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyInvoice") return Boolean(await prisma.pharmacyInvoice.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyPrescription") return Boolean(await prisma.pharmacyPrescription.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyInventorySession") return Boolean(await prisma.pharmacyInventorySession.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyReturnLossEvent") return Boolean(await prisma.pharmacyReturnLossEvent.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyQualityIncident") return Boolean(await prisma.pharmacyQualityIncident.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyAlert") return Boolean(await prisma.pharmacyAlert.findFirst({ where: { id: entityId, organizationId } }));
  if (entityType === "PharmacyCashSession") return Boolean(await prisma.pharmacyCashSession.findFirst({ where: { id: entityId, organizationId } }));
  return false;
}

export async function validatePharmacyDocumentReference(organizationId: string, entityType?: string, entityId?: string) {
  if (!entityType && !entityId) return null;
  if (!entityType || !entityId || !(await entityExists(organizationId, entityType, entityId))) return "L'objet métier lié est invalide ou appartient à une autre organisation.";
  return null;
}

export async function createPharmacyDocument(organizationId: string, userId: string, data: DocumentInput, file?: File | null) {
  const count = await prisma.pharmacyDocument.count({ where: { organizationId } });
  const document = await prisma.pharmacyDocument.create({ data: {
    organizationId, documentNumber: data.documentNumber || `DOC-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`, title: data.title, description: nil(data.description),
    documentType: data.documentType, category: data.category, subcategory: nil(data.subcategory), moduleSource: nil(data.moduleSource), sourceEntityType: nil(data.sourceEntityType), sourceEntityId: nil(data.sourceEntityId),
    reference: nil(data.reference), documentDate: data.documentDate ? new Date(data.documentDate) : null, issuer: nil(data.issuer), language: nil(data.language), tagsJson: data.tags ? data.tags.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
    importance: data.importance, confidentialityLevel: data.confidentialityLevel, downloadRequiresPermission: data.downloadRequiresPermission, sensitiveDownloadAudit: data.sensitiveDownloadAudit || data.confidentialityLevel === "VERY_CONFIDENTIAL",
    visibleInActivities: data.visibleInActivities, complianceRequired: data.complianceRequired, complianceStatus: data.complianceStatus, expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    renewalRequired: data.renewalRequired, renewalDueDate: data.renewalDueDate ? new Date(data.renewalDueDate) : null, verificationRequired: data.verificationRequired, notes: nil(data.notes), createdById: userId, updatedById: userId,
  } });
  if (data.linkEntityType && data.linkEntityId) await prisma.pharmacyDocumentLink.create({ data: { organizationId, documentId: document.id, entityType: data.linkEntityType, entityId: data.linkEntityId, linkRole: data.linkRole || "PRIMARY", createdById: userId } });
  if (!file) return document;
  const upload = await uploadPharmacyDocumentToSupabase({ organizationId, documentId: document.id, file }); const checksum = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  return prisma.$transaction(async (transaction) => {
    await transaction.pharmacyDocumentVersion.create({ data: { organizationId, documentId: document.id, versionNumber: 1, storageKey: upload.path, filename: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, checksum, uploadedById: userId, isCurrent: true } });
    return transaction.pharmacyDocument.update({ where: { id: document.id }, data: { storageKey: upload.path, fileUrl: `/api/enterprise/${organizationId}/pharmacy/documents/${document.id}/download`, filename: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, checksum } });
  });
}

export async function detectPharmacyDocumentCompliance(organizationId: string, userId?: string) {
  await ensurePharmacyDocumentRules(organizationId);
  const now = new Date(); const soon = new Date(now.getTime() + 30 * 86400000);
  const documents = await prisma.pharmacyDocument.findMany({ where: { organizationId, status: { in: activeDocumentStatuses } }, include: { links: true } });
  for (const document of documents) {
    const complianceStatus = document.expiryDate && document.expiryDate < now ? "EXPIRED" : document.expiryDate && document.expiryDate <= soon ? "TO_RENEW" : document.complianceStatus;
    if (complianceStatus !== document.complianceStatus) await prisma.pharmacyDocument.update({ where: { id: document.id }, data: { complianceStatus, status: complianceStatus === "EXPIRED" ? "EXPIRED" : document.status, updatedById: userId } });
    if (["EXPIRED", "TO_RENEW"].includes(complianceStatus)) {
      const alertType = complianceStatus === "EXPIRED" ? "DOCUMENT_EXPIRED" : "DOCUMENT_EXPIRING_SOON"; const deduplicationKey = `${alertType}:PharmacyDocument:${document.id}`;
      await prisma.pharmacyAlert.upsert({ where: { organizationId_deduplicationKey: { organizationId, deduplicationKey } }, create: { organizationId, alertNumber: `ALT-DOC-${String(await prisma.pharmacyAlert.count({ where: { organizationId } }) + 1).padStart(6, "0")}`, deduplicationKey, alertType, category: "DOCUMENT", title: `${complianceStatus === "EXPIRED" ? "Document expiré" : "Document à renouveler"} : ${document.title}`, message: "Une action documentaire est requise.", criticality: document.importance === "CRITICAL" ? "CRITICAL" : "HIGH", sourceModule: "PHARMACY_DOCUMENTS", sourceEntityType: "PharmacyDocument", sourceEntityId: document.id, recommendedAction: "Renouveler ou archiver le document.", createdById: userId }, update: { status: "OPEN", lastDetectedAt: new Date(), detectedCount: { increment: 1 }, updatedById: userId } });
    }
  }
  await detectMissingRequiredDocuments(organizationId);
  return documents.length;
}

export async function detectMissingRequiredDocuments(organizationId: string) {
  await ensurePharmacyDocumentRules(organizationId);
  const [rules, suppliers, receipts, destructions, incidents, batches, documents] = await Promise.all([
    prisma.pharmacyDocumentComplianceRule.findMany({ where: { organizationId, enabled: true, required: true } }),
    prisma.pharmacySupplier.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true } }),
    prisma.pharmacyReceipt.findMany({ where: { organizationId, status: { in: ["VALIDATED", "PARTIALLY_VALIDATED"] } }, select: { id: true } }),
    prisma.pharmacyReturnLossEvent.findMany({ where: { organizationId, eventType: "DESTRUCTION", status: "VALIDATED" }, select: { id: true } }),
    prisma.pharmacyQualityIncident.findMany({ where: { organizationId, criticality: "CRITICAL", status: { notIn: ["REJECTED", "CANCELLED", "ARCHIVED"] } }, select: { id: true } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId, OR: [{ recall: true }, { status: "RECALLED" }] }, select: { id: true } }),
    prisma.pharmacyDocument.findMany({ where: { organizationId, status: { notIn: ["ARCHIVED", "DELETED", "REJECTED"] } }, include: { links: true } }),
  ]);
  const sources: Record<string, Array<{ id: string }>> = { PharmacySupplier: suppliers, PharmacyReceipt: receipts, PharmacyReturnLossEvent: destructions, PharmacyQualityIncident: incidents, PharmacyBatch: batches };
  for (const rule of rules) for (const source of sources[rule.entityType] || []) {
    const found = documents.some((document) => document.documentType === rule.documentType && document.links.some((link) => link.entityType === rule.entityType && link.entityId === source.id));
    const key = { organizationId_entityType_entityId_expectedDocumentType: { organizationId, entityType: rule.entityType, entityId: source.id, expectedDocumentType: rule.documentType } };
    if (found) await prisma.pharmacyMissingDocument.updateMany({ where: { organizationId, entityType: rule.entityType, entityId: source.id, expectedDocumentType: rule.documentType, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    else await prisma.pharmacyMissingDocument.upsert({ where: key, create: { organizationId, ruleId: rule.id, entityType: rule.entityType, entityId: source.id, expectedDocumentType: rule.documentType, criticality: ruleDefinitions.find((item) => item[0] === rule.ruleCode)?.[4] || "MEDIUM" }, update: { status: "OPEN", resolvedAt: null } });
  }
}

export async function getPharmacyDocumentDataset(organizationId: string, includeAccessLogs: boolean) {
  await ensurePharmacyDocumentRules(organizationId); const now = new Date(); const month = new Date(now.getFullYear(), now.getMonth(), 1); const soon = new Date(now.getTime() + 30 * 86400000);
  const [documents, rules, missing, accessLogs, products, batches, suppliers, orders, receipts, sales, payments, invoices, prescriptions, inventories, returns, qualityIncidents, alerts, cashSessions, members, legacyCounts] = await Promise.all([
    prisma.pharmacyDocument.findMany({ where: { organizationId, status: { not: "DELETED" } }, orderBy: { updatedAt: "desc" }, include: { links: true, versions: { orderBy: { versionNumber: "desc" } }, accessLogs: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    prisma.pharmacyDocumentComplianceRule.findMany({ where: { organizationId }, orderBy: { label: "asc" } }), prisma.pharmacyMissingDocument.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    includeAccessLogs ? prisma.pharmacyDocumentAccessLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 500 }) : Promise.resolve([]),
    prisma.pharmacyProduct.findMany({ where: { organizationId }, select: { id: true, name: true } }), prisma.pharmacyBatch.findMany({ where: { organizationId }, select: { id: true, productId: true, batchNumber: true } }),
    prisma.pharmacySupplier.findMany({ where: { organizationId }, select: { id: true, name: true } }), prisma.pharmacyPurchaseOrder.findMany({ where: { organizationId }, select: { id: true, orderNumber: true } }),
    prisma.pharmacyReceipt.findMany({ where: { organizationId }, select: { id: true, receiptNumber: true } }), prisma.pharmacySale.findMany({ where: { organizationId }, select: { id: true, saleNumber: true } }),
    prisma.pharmacyPayment.findMany({ where: { organizationId }, select: { id: true, paymentNumber: true } }), prisma.pharmacyInvoice.findMany({ where: { organizationId }, select: { id: true, invoiceNumber: true } }),
    prisma.pharmacyPrescription.findMany({ where: { organizationId }, select: { id: true, prescriptionNumber: true } }), prisma.pharmacyInventorySession.findMany({ where: { organizationId }, select: { id: true, title: true } }),
    prisma.pharmacyReturnLossEvent.findMany({ where: { organizationId }, select: { id: true, eventNumber: true } }), prisma.pharmacyQualityIncident.findMany({ where: { organizationId }, select: { id: true, incidentNumber: true, title: true } }),
    prisma.pharmacyAlert.findMany({ where: { organizationId }, select: { id: true, alertNumber: true, title: true } }), prisma.pharmacyCashSession.findMany({ where: { organizationId }, select: { id: true, cashSessionNumber: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } } } }),
    Promise.all([prisma.pharmacySupplierDocument.count({ where: { organizationId } }), prisma.pharmacyReceiptDocument.count({ where: { organizationId } }), prisma.pharmacyPrescriptionDocument.count({ where: { organizationId } }), prisma.pharmacyReturnLossDocument.count({ where: { organizationId } }), prisma.pharmacyQualityDocument.count({ where: { organizationId } })]),
  ]);
  const metrics = { total: documents.length + legacyCounts.reduce((sum, value) => sum + value, 0), addedToday: documents.filter((item) => item.createdAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)).length, addedMonth: documents.filter((item) => item.createdAt >= month).length, sensitive: documents.filter((item) => item.confidentialityLevel !== "INTERNAL").length, veryConfidential: documents.filter((item) => item.confidentialityLevel === "VERY_CONFIDENTIAL").length, expired: documents.filter((item) => item.expiryDate && item.expiryDate < now).length, expiringSoon: documents.filter((item) => item.expiryDate && item.expiryDate >= now && item.expiryDate <= soon).length, missing: missing.filter((item) => item.status === "OPEN").length, suppliers: documents.filter((item) => item.moduleSource === "SUPPLIERS" || item.moduleSource === "PURCHASES").length + legacyCounts[0], prescriptions: documents.filter((item) => item.moduleSource === "PRESCRIPTIONS").length + legacyCounts[2], sales: documents.filter((item) => item.moduleSource === "SALES" || item.moduleSource === "CASH").length, quality: documents.filter((item) => item.moduleSource === "QUALITY").length + legacyCounts[4], batches: documents.filter((item) => item.moduleSource === "BATCHES").length, destruction: documents.filter((item) => item.documentType === "DESTRUCTION_MINUTES").length, administrative: documents.filter((item) => ["ADMINISTRATION", "COMPLIANCE"].includes(item.moduleSource || "")).length, sensitiveDownloads: accessLogs.filter((item) => item.action === "DOWNLOAD").length };
  return { metrics, documents, rules, missing, accessLogs, storageConfigured: Boolean(process.env.SUPABASE_STORAGE_URL && process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY), products, batches, suppliers, orders, receipts, sales, payments, invoices, prescriptions, inventories, returns, qualityIncidents, alerts, cashSessions, members: members.map((item) => item.user), legacyCounts };
}

export async function transitionPharmacyDocument(organizationId: string, documentId: string, userId: string, action: string, reason?: string, entityType?: string, entityId?: string, linkRole?: string) {
  const document = await prisma.pharmacyDocument.findFirst({ where: { id: documentId, organizationId } }); if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  if (["reject", "archive"].includes(action) && !reason?.trim()) throw new Error("REASON_REQUIRED");
  if (action === "link") { if (!entityType || !entityId || !(await entityExists(organizationId, entityType, entityId))) throw new Error("INVALID_REFERENCE"); return prisma.pharmacyDocumentLink.create({ data: { organizationId, documentId, entityType, entityId, linkRole: linkRole || "ANNEX", createdById: userId } }); }
  if (action === "unlink") { if (!entityType || !entityId) throw new Error("INVALID_REFERENCE"); return prisma.pharmacyDocumentLink.deleteMany({ where: { organizationId, documentId, entityType, entityId, linkRole: linkRole || "ANNEX" } }); }
  if (action === "renew") {
    const count = await prisma.pharmacyDocument.count({ where: { organizationId } });
    return prisma.$transaction(async (transaction) => {
      const renewed = await transaction.pharmacyDocument.create({ data: { organizationId, documentNumber: `DOC-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`, title: `${document.title} - renouvellement`, description: document.description, documentType: document.documentType, category: document.category, subcategory: document.subcategory, moduleSource: document.moduleSource, sourceEntityType: document.sourceEntityType, sourceEntityId: document.sourceEntityId, reference: document.reference, issuer: document.issuer, language: document.language, tagsJson: document.tagsJson ?? undefined, importance: document.importance, confidentialityLevel: document.confidentialityLevel, restrictedRolesJson: document.restrictedRolesJson ?? undefined, restrictedUsersJson: document.restrictedUsersJson ?? undefined, restrictedDepartmentsJson: document.restrictedDepartmentsJson ?? undefined, downloadRequiresPermission: document.downloadRequiresPermission, sensitiveDownloadAudit: document.sensitiveDownloadAudit, visibleInActivities: document.visibleInActivities, complianceRequired: document.complianceRequired, complianceStatus: document.complianceRequired ? "TO_VERIFY" : "NOT_REQUIRED", renewalRequired: document.renewalRequired, verificationRequired: document.verificationRequired, status: "DRAFT", notes: reason, createdById: userId, updatedById: userId } });
      await transaction.pharmacyDocumentLink.createMany({ data: (await transaction.pharmacyDocumentLink.findMany({ where: { organizationId, documentId: document.id } })).map((link) => ({ organizationId, documentId: renewed.id, entityType: link.entityType, entityId: link.entityId, linkRole: "RENEWAL", createdById: userId })) });
      await transaction.pharmacyDocument.update({ where: { id: document.id }, data: { renewedByDocumentId: renewed.id, complianceStatus: "TO_RENEW", updatedById: userId } });
      return renewed;
    });
  }
  const data = action === "validate" ? { status: "VALIDATED", complianceStatus: document.complianceRequired ? "COMPLIANT" : document.complianceStatus, verifiedById: userId, verifiedAt: new Date(), validationComment: reason, updatedById: userId } : action === "reject" ? { status: "REJECTED", complianceStatus: "REJECTED", rejectionReason: reason, updatedById: userId } : action === "archive" ? { status: "ARCHIVED", notes: [document.notes, reason].filter(Boolean).join("\n"), updatedById: userId } : action === "mark-not-applicable" ? { complianceStatus: "NOT_REQUIRED", renewalRequired: false, updatedById: userId } : null;
  if (!data) throw new Error("INVALID_ACTION"); return prisma.pharmacyDocument.update({ where: { id: document.id }, data });
}

export async function logPharmacyDocumentAccess(organizationId: string, documentId: string, actorId: string, action: string, ip?: string, userAgent?: string) {
  return prisma.pharmacyDocumentAccessLog.create({ data: { organizationId, documentId, actorId, action, ip, userAgent } });
}
