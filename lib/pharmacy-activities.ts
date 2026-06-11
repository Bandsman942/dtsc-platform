import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { getPharmacyActivityAccess } from "@/lib/pharmacy-activity-access";
import type { pharmacyActivityCreateSchema } from "@/lib/pharmacy-activity-validators";
import { calculateCashSessionTotals } from "@/lib/pharmacy-cash";
import { notifyUsers } from "@/lib/notifications";
import { generatePharmacyEntityNumber, getDefaultPharmacySettingsForOrganization } from "@/lib/pharmacy-settings";
import { prisma } from "@/lib/prisma";

type ActivityInput = z.infer<typeof pharmacyActivityCreateSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;
const activeActivityStatuses = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "PENDING_VALIDATION"];
const linkedEntityTypes: Record<ActivityInput["activityType"], string | null> = {
  REPLENISHMENT_REQUEST: "PharmacyReplenishmentRequest",
  STOCKOUT_SIGNAL: "PharmacyAlert",
  NEAR_EXPIRY_SIGNAL: "PharmacyAlert",
  INVENTORY_SUBMISSION: "PharmacyInventoryLine",
  STOCK_ADJUSTMENT_REQUEST: "PharmacyStockAdjustment",
  CASH_REPORT: "PharmacyCashSession",
  SALE_ANOMALY: "PharmacySaleAnomaly",
  QUALITY_INCIDENT_SIGNAL: "PharmacyQualityIncident",
  PHARMACIST_ADVICE_REQUEST: "PharmacyPharmacistAdviceRequest",
  DOCUMENT_REQUEST: null,
  ALERT_ACTION: null,
  WORKFLOW_ACTION: null,
  TASK_ACTION: null,
  OTHER: null,
};

async function member(organizationId: string, userId: string | null | undefined) {
  if (!userId) return null;
  return prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { userId: true, role: true } });
}

async function nextNumber(organizationId: string, prefix: string, model: "activity" | "advice") {
  const count = model === "activity" ? await prisma.pharmacyActivityItem.count({ where: { organizationId } }) : await prisma.pharmacyPharmacistAdviceRequest.count({ where: { organizationId } });
  return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;
}

async function references(organizationId: string, data: ActivityInput) {
  const [product, batch, supplier, sale, saleLine, prescription, inventory, inventoryLine, cash, alert, location, assignee, pharmacist, department] = await Promise.all([
    data.productId ? prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } }, select: { id: true, stockUnit: true } }) : null,
    data.batchId ? prisma.pharmacyBatch.findFirst({ where: { id: data.batchId, organizationId }, select: { id: true, productId: true, expiryDate: true, availableQuantity: true } }) : null,
    data.supplierId ? prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId }, select: { id: true } }) : null,
    data.saleId ? prisma.pharmacySale.findFirst({ where: { id: data.saleId, organizationId }, select: { id: true } }) : null,
    data.saleLineId ? prisma.pharmacySaleLine.findFirst({ where: { id: data.saleLineId, organizationId }, select: { id: true, saleId: true } }) : null,
    data.prescriptionId ? prisma.pharmacyPrescription.findFirst({ where: { id: data.prescriptionId, organizationId }, select: { id: true } }) : null,
    data.inventorySessionId ? prisma.pharmacyInventorySession.findFirst({ where: { id: data.inventorySessionId, organizationId }, select: { id: true, responsibleUserId: true, status: true } }) : null,
    data.inventoryLineId ? prisma.pharmacyInventoryLine.findFirst({ where: { id: data.inventoryLineId, organizationId }, select: { id: true, inventorySessionId: true, systemQuantity: true } }) : null,
    data.cashSessionId ? prisma.pharmacyCashSession.findFirst({ where: { id: data.cashSessionId, organizationId }, select: { id: true, cashierId: true, status: true } }) : null,
    data.alertId ? prisma.pharmacyAlert.findFirst({ where: { id: data.alertId, organizationId }, select: { id: true } }) : null,
    data.locationId ? prisma.pharmacyStockLocation.findFirst({ where: { id: data.locationId, organizationId }, select: { id: true } }) : null,
    member(organizationId, data.assignedToId), member(organizationId, data.pharmacistId),
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } }) : null,
  ]);
  if (data.productId && !product) throw new Error("Le produit sélectionné n'appartient pas à cette pharmacie.");
  if (data.batchId && (!batch || (data.productId && batch.productId !== data.productId))) throw new Error("Le lot sélectionné ne correspond pas au produit.");
  if (data.supplierId && !supplier) throw new Error("Le fournisseur sélectionné est invalide.");
  if (data.saleId && !sale) throw new Error("La vente sélectionnée est invalide.");
  if (data.saleLineId && (!saleLine || (data.saleId && saleLine.saleId !== data.saleId))) throw new Error("La ligne de vente sélectionnée est invalide.");
  if (data.prescriptionId && !prescription) throw new Error("L'ordonnance sélectionnée est invalide.");
  if (data.inventorySessionId && !inventory) throw new Error("La session d'inventaire sélectionnée est invalide.");
  if (data.inventoryLineId && (!inventoryLine || (data.inventorySessionId && inventoryLine.inventorySessionId !== data.inventorySessionId))) throw new Error("La ligne d'inventaire sélectionnée est invalide.");
  if (data.cashSessionId && !cash) throw new Error("La session de caisse sélectionnée est invalide.");
  if (data.alertId && !alert) throw new Error("L'alerte sélectionnée est invalide.");
  if (data.locationId && !location) throw new Error("L'emplacement sélectionné est invalide.");
  if (data.assignedToId && !assignee) throw new Error("Le responsable sélectionné n'est pas un collaborateur actif.");
  if (data.pharmacistId && !pharmacist) throw new Error("Le pharmacien sélectionné n'est pas un collaborateur actif.");
  if (data.departmentId && !department) throw new Error("Le département sélectionné est invalide.");
  return { product, batch, inventory, inventoryLine, cash };
}

async function linkedEntity(organizationId: string, userId: string, data: ActivityInput, refs: Awaited<ReturnType<typeof references>>) {
  if (data.activityType === "REPLENISHMENT_REQUEST") {
    if (!data.productId || !data.quantity || !data.reason) throw new Error("Produit, quantité et motif sont obligatoires.");
    return prisma.pharmacyReplenishmentRequest.create({ data: { organizationId, requestNumber: await generatePharmacyEntityNumber(organizationId, "REPLENISHMENT_REQUEST"), productId: data.productId, requestedQuantity: Number(data.quantity), unit: data.unit || refs.product?.stockUnit || "unité", source: data.source || "MANUAL", reason: data.reason, priority: data.priority, suggestedSupplierId: nil(data.supplierId), requestedById: userId, departmentId: nil(data.departmentId), desiredDate: data.desiredDate ? new Date(data.desiredDate) : null, status: "SUBMITTED", notes: data.description } });
  }
  if (data.activityType === "STOCKOUT_SIGNAL" || data.activityType === "NEAR_EXPIRY_SIGNAL") {
    if (!data.productId) throw new Error("Le produit est obligatoire.");
    const deduplicationKey = `${data.activityType}:${data.productId}:${data.batchId || data.locationId || "GLOBAL"}`;
    return prisma.pharmacyAlert.upsert({
      where: { organizationId_deduplicationKey: { organizationId, deduplicationKey } },
      create: { organizationId, alertNumber: await generatePharmacyEntityNumber(organizationId, "ALERT"), deduplicationKey, alertType: data.activityType, category: data.activityType === "STOCKOUT_SIGNAL" ? "STOCK" : "EXPIRY", title: data.title, message: data.description, criticality: data.criticality || (data.activityType === "STOCKOUT_SIGNAL" ? "HIGH" : "MEDIUM"), sourceModule: data.activityType === "STOCKOUT_SIGNAL" ? "STOCK_INVENTORY" : "BATCH_EXPIRY", productId: data.productId, batchId: nil(data.batchId), recommendedAction: data.actionRequested || "Vérifier et traiter le signalement.", assignedToId: nil(data.assignedToId), createdById: userId, updatedById: userId },
      update: { message: data.description, criticality: data.criticality || undefined, lastDetectedAt: new Date(), detectedCount: { increment: 1 }, status: "OPEN", updatedById: userId },
    });
  }
  if (data.activityType === "INVENTORY_SUBMISSION") {
    if (!refs.inventoryLine || data.countedQuantity === "" || data.countedQuantity === undefined) throw new Error("La ligne d'inventaire et la quantité comptée sont obligatoires.");
    if (!refs.inventory || !["DRAFT", "PLANNED", "IN_PROGRESS", "SUBMITTED"].includes(refs.inventory.status)) throw new Error("Cette session d'inventaire ne peut plus être modifiée.");
    const counted = Number(data.countedQuantity); const variance = counted - Number(refs.inventoryLine.systemQuantity);
    await prisma.pharmacyInventorySession.update({ where: { id: refs.inventory.id }, data: { status: "SUBMITTED", submittedAt: new Date(), updatedById: userId } });
    return prisma.pharmacyInventoryLine.update({ where: { id: refs.inventoryLine.id }, data: { countedQuantity: counted, variance, varianceType: variance === 0 ? "MATCH" : variance > 0 ? "SURPLUS" : "SHORTAGE", varianceReason: nil(data.reason), countedById: userId, countedAt: new Date(), status: "SUBMITTED", notes: data.description } });
  }
  if (data.activityType === "STOCK_ADJUSTMENT_REQUEST") {
    if (!data.productId || !data.batchId || !data.quantity || !data.reason) throw new Error("Produit, lot, quantité et motif sont obligatoires.");
    return prisma.pharmacyStockAdjustment.create({ data: { organizationId, productId: data.productId, batchId: data.batchId, inventorySessionId: nil(data.inventorySessionId), inventoryLineId: nil(data.inventoryLineId), adjustmentType: data.adjustmentType || "OTHER", direction: data.direction === "IN" ? "IN" : "OUT", quantity: Number(data.quantity), reason: data.reason, status: "SUBMITTED", requestedById: userId, notes: data.description } });
  }
  if (data.activityType === "CASH_REPORT") {
    if (!refs.cash || data.countedCashAmount === "" || data.countedCashAmount === undefined) throw new Error("La session et le montant cash compté sont obligatoires.");
    if (refs.cash.cashierId !== userId || refs.cash.status !== "OPEN") throw new Error("Seul le caissier peut soumettre sa caisse ouverte.");
    const totals = await calculateCashSessionTotals(organizationId, refs.cash.id); const counted = Number(data.countedCashAmount); const variance = counted - totals.theoreticalCashAmount;
    return prisma.pharmacyCashSession.update({ where: { id: refs.cash.id }, data: { ...totals, countedCashAmount: counted, varianceAmount: variance, varianceCriticity: Math.abs(variance) >= 100 ? "CRITICAL" : Math.abs(variance) > 0 ? "HIGH" : "LOW", varianceJustification: nil(data.reason), submittedAt: new Date(), status: "PENDING_VALIDATION", updatedById: userId } });
  }
  if (data.activityType === "SALE_ANOMALY") {
    if (!data.saleId || !data.anomalyType) throw new Error("La vente et le type d'anomalie sont obligatoires.");
    return prisma.pharmacySaleAnomaly.create({ data: { organizationId, saleId: data.saleId, saleLineId: nil(data.saleLineId), productId: nil(data.productId), batchId: nil(data.batchId), anomalyType: data.anomalyType, description: data.description, criticality: data.criticality || "MEDIUM", responsibleUserId: nil(data.assignedToId), proposedAction: nil(data.actionRequested), createdById: userId, updatedById: userId } });
  }
  if (data.activityType === "QUALITY_INCIDENT_SIGNAL") {
    const incidentNumber = await generatePharmacyEntityNumber(organizationId, "QUALITY_INCIDENT");
    return prisma.pharmacyQualityIncident.create({ data: { organizationId, incidentNumber, title: data.title, incidentType: data.requestType || "OTHER", category: "ACTIVITY_SIGNAL", criticality: data.criticality || "MEDIUM", priority: data.priority === "CRITICAL" ? "URGENT" : data.priority === "HIGH" ? "HIGH" : "NORMAL", status: "REPORTED", incidentDate: new Date(), reportedById: userId, reportingSource: "PHARMACY_ACTIVITIES", sourceModule: "PHARMACY_ACTIVITIES", productId: nil(data.productId), batchId: nil(data.batchId), saleId: nil(data.saleId), saleLineId: nil(data.saleLineId), prescriptionId: nil(data.prescriptionId), description: data.description, immediateActionTaken: Boolean(data.immediateAction), immediateAction: nil(data.immediateAction), assignedToId: nil(data.assignedToId), createdById: userId, updatedById: userId } });
  }
  if (data.activityType === "PHARMACIST_ADVICE_REQUEST") {
    return prisma.pharmacyPharmacistAdviceRequest.create({ data: { organizationId, requestNumber: await nextNumber(organizationId, "AVP", "advice"), subject: data.title, requestType: data.requestType || "DISPENSATION", saleId: nil(data.saleId), prescriptionId: nil(data.prescriptionId), productId: nil(data.productId), batchId: nil(data.batchId), requestedById: userId, pharmacistId: nil(data.pharmacistId || data.assignedToId), urgency: data.urgency || data.priority, description: data.description } });
  }
  return null;
}

export async function createPharmacyActivityRequest(organizationId: string, userId: string, data: ActivityInput) {
  const access = await getPharmacyActivityAccess(userId, organizationId); if (!access) throw new Error("Accès Activités pharmacie refusé.");
  await getDefaultPharmacySettingsForOrganization(organizationId, userId);
  const refs = await references(organizationId, data); const result = await linkedEntity(organizationId, userId, data, refs);
  const resultEntityType = result ? linkedEntityTypes[data.activityType] : null; const resultEntityId = result && "id" in result ? String(result.id) : null;
  const activity = await prisma.pharmacyActivityItem.create({ data: { organizationId, activityNumber: await nextNumber(organizationId, "ACT", "activity"), activityType: data.activityType, title: data.title, description: data.description, sourceModule: "PHARMACY_ACTIVITIES", sourceEntityType: data.activityType, sourceEntityId: resultEntityId, requestedById: userId, assignedToId: nil(data.assignedToId || data.pharmacistId), departmentId: nil(data.departmentId), priority: data.priority, criticality: data.criticality || null, status: data.assignedToId || data.pharmacistId ? "ASSIGNED" : "SUBMITTED", dueAt: data.dueAt ? new Date(data.dueAt) : null, resultEntityType, resultEntityId, metadataJson: data as unknown as Prisma.InputJsonValue, createdById: userId, updatedById: userId } });
  await prisma.pharmacyActivityEvent.create({ data: { organizationId, activityId: activity.id, actorId: userId, eventType: "CREATED", newStatus: activity.status } });
  const recipients = activity.assignedToId ? [activity.assignedToId] : (await prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] }, userId: { not: userId } }, select: { userId: true }, take: 20 })).map((item) => item.userId);
  if (recipients.length) await notifyUsers({ userIds: recipients, organizationId, type: "PHARMACY_ACTIVITY", title: data.title, body: `Nouvelle activité pharmacie ${activity.activityNumber}`, targetUrl: "/enterprise-activities" });
  return activity;
}

export async function getPharmacyActivityDashboard(organizationId: string, userId: string) {
  const access = await getPharmacyActivityAccess(userId, organizationId); if (!access) throw new Error("Accès Activités pharmacie refusé.");
  const own = access.canViewAll ? { organizationId } : { organizationId, OR: [{ requestedById: userId }, { assignedToId: userId }] };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [activities, alerts, sales, cashSessions, inventories, documents, workflows, products, batches, suppliers, prescriptions, locations, members, departments, advice, events] = await Promise.all([
    prisma.pharmacyActivityItem.findMany({ where: own, orderBy: { updatedAt: "desc" }, take: 300 }),
    prisma.pharmacyAlert.findMany({ where: { organizationId, ...(access.canViewAll ? {} : { assignedToId: userId }) }, orderBy: { lastDetectedAt: "desc" }, take: 100 }),
    prisma.pharmacySale.findMany({ where: { organizationId, ...(access.canViewAll ? {} : { OR: [{ createdById: userId }, { cashierId: userId }, { pharmacistId: userId }] }), saleDate: { gte: today } }, orderBy: { saleDate: "desc" }, take: 100 }),
    prisma.pharmacyCashSession.findMany({ where: { organizationId, ...(access.canViewAll ? {} : { cashierId: userId }) }, orderBy: { openedAt: "desc" }, take: 40 }),
    prisma.pharmacyInventorySession.findMany({ where: { organizationId, ...(access.canViewAll ? {} : { responsibleUserId: userId }) }, orderBy: { inventoryDate: "desc" }, include: { lines: { where: access.canViewAll ? {} : { OR: [{ countedById: userId }, { countedById: null }] }, take: 100 } }, take: 50 }),
    prisma.pharmacyDocument.findMany({ where: { organizationId, visibleInActivities: true, status: { in: ["VALIDATED", "ACTIVE"] }, ...(access.canViewSensitive ? {} : { confidentialityLevel: { in: ["PUBLIC", "INTERNAL"] } }) }, orderBy: { updatedAt: "desc" }, take: 60 }),
    prisma.enterpriseWorkflow.findMany({ where: { organizationId, isEnabled: true }, orderBy: { labelFr: "asc" }, take: 80 }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, stockUnit: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.pharmacyBatch.findMany({ where: { organizationId }, select: { id: true, productId: true, batchNumber: true, expiryDate: true, availableQuantity: true }, orderBy: { expiryDate: "asc" }, take: 500 }),
    prisma.pharmacySupplier.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    prisma.pharmacyPrescription.findMany({ where: { organizationId }, select: { id: true, prescriptionNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.pharmacyStockLocation.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { role: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, select: { id: true, labelFr: true }, orderBy: { labelFr: "asc" } }),
    prisma.pharmacyPharmacistAdviceRequest.findMany({ where: access.canViewAll ? { organizationId } : { organizationId, OR: [{ requestedById: userId }, { pharmacistId: userId }] }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.pharmacyActivityEvent.findMany({ where: { organizationId, actorId: userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const visibleActivityIds = activities.map((item) => item.id);
  const activityComments = visibleActivityIds.length ? await prisma.pharmacyActivityComment.findMany({ where: { organizationId, activityId: { in: visibleActivityIds } }, orderBy: { createdAt: "asc" }, take: 500 }) : [];
  const metrics = { openTasks: activities.filter((item) => item.assignedToId === userId && activeActivityStatuses.includes(item.status)).length, pendingValidations: activities.filter((item) => item.status === "PENDING_VALIDATION").length, criticalAlerts: alerts.filter((item) => item.criticality === "CRITICAL" && activeActivityStatuses.includes(item.status)).length, submitted: activities.filter((item) => item.requestedById === userId).length, approved: activities.filter((item) => item.status === "VALIDATED").length, rejected: activities.filter((item) => item.status === "REJECTED").length, salesToday: sales.length, openCash: cashSessions.filter((item) => item.status === "OPEN").length, qualitySignals: activities.filter((item) => item.activityType === "QUALITY_INCIDENT_SIGNAL").length, inventoriesToSubmit: inventories.filter((item) => ["DRAFT", "PLANNED", "IN_PROGRESS"].includes(item.status)).length, recentDocuments: documents.length, workflows: workflows.length };
  return { metrics, activities, alerts, sales: sales.map((item) => ({ ...item, totalAmount: access.canViewFinancial ? item.totalAmount : null, paidAmount: access.canViewFinancial ? item.paidAmount : null })), cashSessions: cashSessions.map((item) => ({ ...item, openingAmount: access.canViewFinancial || item.cashierId === userId ? item.openingAmount : null })), inventories, documents, workflows, advice, comments: activityComments, events, products, batches, suppliers, prescriptions, locations, members: members.map((item) => ({ ...item.user, role: item.role })), departments, permissions: access };
}

export async function resolvePharmacyActivityAction(organizationId: string, userId: string, activityId: string, action: string, comment?: string, assignedToId?: string, response?: string, documentId?: string) {
  const access = await getPharmacyActivityAccess(userId, organizationId); if (!access) throw new Error("Accès refusé.");
  const activity = await prisma.pharmacyActivityItem.findFirst({ where: { id: activityId, organizationId } }); if (!activity) throw new Error("Activité introuvable.");
  const involved = activity.requestedById === userId || activity.assignedToId === userId || access.canViewAll; if (!involved) throw new Error("Cette activité ne vous concerne pas.");
  if (action === "comment") { if (!comment?.trim()) throw new Error("Le commentaire est obligatoire."); return prisma.pharmacyActivityComment.create({ data: { organizationId, activityId, authorId: userId, comment } }); }
  if (action === "attach-document") {
    if (!documentId) throw new Error("Sélectionnez un document.");
    const document = await prisma.pharmacyDocument.findFirst({ where: { id: documentId, organizationId, visibleInActivities: true, status: { in: ["VALIDATED", "ACTIVE"] }, ...(access.canViewSensitive ? {} : { confidentialityLevel: { in: ["PUBLIC", "INTERNAL"] } }) } });
    if (!document) throw new Error("Ce document n'est pas disponible dans les activités.");
    await prisma.pharmacyActivityDocument.create({ data: { organizationId, activityId, documentId: document.id, fileUrl: document.fileUrl, documentType: document.documentType, title: document.title, uploadedById: userId } });
    await prisma.pharmacyActivityEvent.create({ data: { organizationId, activityId, actorId: userId, eventType: "DOCUMENT_ATTACHED", oldStatus: activity.status, newStatus: activity.status, metadataJson: { documentId: document.id, documentNumber: document.documentNumber } } });
    return activity;
  }
  if (action === "assign" && !access.canAssign) throw new Error("Vous ne pouvez pas assigner cette activité.");
  if (["validate", "reject"].includes(action) && !access.canValidate) throw new Error("Vous ne pouvez pas traiter cette validation.");
  if (["reject", "cancel"].includes(action) && !comment?.trim()) throw new Error("Un motif est obligatoire.");
  if (action === "respond-advice" || action === "close-advice") {
    const advice = await prisma.pharmacyPharmacistAdviceRequest.findFirst({ where: { id: activity.resultEntityId || "", organizationId } }); if (!advice) throw new Error("Demande d'avis introuvable.");
    if (advice.pharmacistId !== userId && !access.canValidate) throw new Error("Seul le pharmacien destinataire ou un responsable autorisé peut répondre.");
    if (action === "respond-advice" && !response?.trim()) throw new Error("La réponse est obligatoire.");
    await prisma.pharmacyPharmacistAdviceRequest.update({ where: { id: advice.id }, data: action === "respond-advice" ? { response, respondedById: userId, respondedAt: new Date(), status: "RESPONDED" } : { status: "CLOSED" } });
  }
  const status = action === "start" ? "IN_PROGRESS" : action === "complete" ? "PENDING_VALIDATION" : action === "cancel" ? "CANCELLED" : action === "validate" ? "VALIDATED" : action === "reject" ? "REJECTED" : action === "assign" ? "ASSIGNED" : activity.status;
  const updated = await prisma.pharmacyActivityItem.update({ where: { id: activity.id }, data: { status, assignedToId: action === "assign" ? assignedToId || null : activity.assignedToId, completedAt: action === "complete" ? new Date() : activity.completedAt, validatedById: action === "validate" ? userId : activity.validatedById, validatedAt: action === "validate" ? new Date() : activity.validatedAt, rejectionReason: action === "reject" ? comment : activity.rejectionReason, updatedById: userId } });
  await prisma.pharmacyActivityEvent.create({ data: { organizationId, activityId, actorId: userId, eventType: action.toUpperCase().replaceAll("-", "_"), oldStatus: activity.status, newStatus: updated.status, comment } });
  return updated;
}
