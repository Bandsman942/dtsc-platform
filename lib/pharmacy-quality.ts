import type { z } from "zod";
import { notifyUsers } from "@/lib/notifications";
import type { pharmacyQualityCreateSchema, pharmacyQualityIncidentSchema } from "@/lib/pharmacy-quality-validators";
import { prisma } from "@/lib/prisma";
import { generatePharmacyEntityNumber, getEffectivePharmacySettings } from "@/lib/pharmacy-settings";

type IncidentInput = z.infer<typeof pharmacyQualityIncidentSchema>;
type RelatedInput = z.infer<typeof pharmacyQualityCreateSchema>;
const nil = <T>(value: T | "" | undefined) => value === "" || value === undefined ? null : value;
const activeStatuses = ["DRAFT", "REPORTED", "TRIAGE", "INVESTIGATION", "IMMEDIATE_ACTION", "CAPA_IN_PROGRESS", "WAITING_INFORMATION"];
const criticalTypes = ["SUSPECTED_COUNTERFEIT", "RECALLED_PRODUCT"];
const highTypes = ["SERIOUS_ADVERSE_REACTION", "WRONG_PRODUCT", "EXPIRED_DISPENSED"];

function normalizedCriticality(data: IncidentInput) {
  if (criticalTypes.includes(data.incidentType) || data.productCondition === "RECALLED") return "CRITICAL";
  if (highTypes.includes(data.incidentType) || (data.incidentType === "ADVERSE_REACTION" && data.patientImpact === "SERIOUS")) return data.criticality === "CRITICAL" ? "CRITICAL" : "HIGH";
  return data.criticality;
}

async function activeMember(organizationId: string, userId: string | null | undefined) {
  if (!userId) return true;
  return Boolean(await prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } }));
}

export async function validateQualityReferences(organizationId: string, data: IncidentInput) {
  const [reporter, assignee, department, location, product, batch, sale, saleLine, prescription, receipt, returnEvent, supplier, alert] = await Promise.all([
    activeMember(organizationId, data.reportedById), activeMember(organizationId, data.assignedToId),
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId }, select: { id: true } }) : null,
    data.locationId ? prisma.pharmacyStockLocation.findFirst({ where: { id: data.locationId, organizationId, status: "ACTIVE" }, select: { id: true } }) : null,
    data.productId ? prisma.pharmacyProduct.findFirst({ where: { id: data.productId, organizationId, status: { not: "ARCHIVED" } }, select: { id: true } }) : null,
    data.batchId ? prisma.pharmacyBatch.findFirst({ where: { id: data.batchId, organizationId }, select: { id: true, productId: true } }) : null,
    data.saleId ? prisma.pharmacySale.findFirst({ where: { id: data.saleId, organizationId }, select: { id: true, prescriptionId: true } }) : null,
    data.saleLineId ? prisma.pharmacySaleLine.findFirst({ where: { id: data.saleLineId, organizationId }, select: { id: true, saleId: true, productId: true, batchId: true } }) : null,
    data.prescriptionId ? prisma.pharmacyPrescription.findFirst({ where: { id: data.prescriptionId, organizationId }, select: { id: true } }) : null,
    data.receiptId ? prisma.pharmacyReceipt.findFirst({ where: { id: data.receiptId, organizationId }, select: { id: true } }) : null,
    data.returnEntityId ? prisma.pharmacyReturnLossEvent.findFirst({ where: { id: data.returnEntityId, organizationId }, select: { id: true } }) : null,
    data.supplierId ? prisma.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId }, select: { id: true } }) : null,
    data.alertId ? prisma.pharmacyAlert.findFirst({ where: { id: data.alertId, organizationId }, select: { id: true } }) : null,
  ]);
  if (!reporter || !assignee) return "Le déclarant ou le responsable sélectionné n'appartient pas à cette organisation.";
  if (data.departmentId && !department) return "Le département sélectionné est invalide.";
  if (data.locationId && !location) return "L'emplacement sélectionné est invalide.";
  if (data.productId && !product) return "Le produit sélectionné est invalide.";
  if (data.batchId && (!batch || (data.productId && batch.productId !== data.productId))) return "Le lot sélectionné ne correspond pas au produit.";
  if (data.saleId && !sale) return "La vente sélectionnée est invalide.";
  if (data.saleLineId && (!saleLine || (data.saleId && saleLine.saleId !== data.saleId) || (data.productId && saleLine.productId !== data.productId) || (data.batchId && saleLine.batchId !== data.batchId))) return "La ligne de vente sélectionnée est invalide.";
  if (data.prescriptionId && (!prescription || (sale?.prescriptionId && sale.prescriptionId !== data.prescriptionId))) return "L'ordonnance sélectionnée est invalide.";
  if (data.receiptId && !receipt) return "La réception sélectionnée est invalide.";
  if (data.returnEntityId && !returnEvent) return "Le retour ou la perte sélectionné est invalide.";
  if (data.supplierId && !supplier) return "Le fournisseur sélectionné est invalide.";
  if (data.alertId && !alert) return "L'alerte sélectionnée est invalide.";
  return null;
}

export async function createQualityIncident(organizationId: string, userId: string, data: IncidentInput) {
  const criticality = normalizedCriticality(data);
  const incident = await prisma.pharmacyQualityIncident.create({ data: {
    organizationId, incidentNumber: data.incidentNumber || await generatePharmacyEntityNumber(organizationId, "QUALITY_INCIDENT"),
    title: data.title, incidentType: data.incidentType, category: data.category, criticality, priority: criticality === "CRITICAL" ? "URGENT" : data.priority,
    incidentDate: new Date(data.incidentDate), reportedById: data.reportedById, reportingSource: data.reportingSource,
    departmentId: nil(data.departmentId), locationId: nil(data.locationId), sourceModule: nil(data.sourceModule), sourceEntityType: nil(data.sourceEntityType), sourceEntityId: nil(data.sourceEntityId),
    productId: nil(data.productId), batchId: nil(data.batchId), saleId: nil(data.saleId), saleLineId: nil(data.saleLineId), prescriptionId: nil(data.prescriptionId),
    receiptId: nil(data.receiptId), returnEntityId: nil(data.returnEntityId), supplierId: nil(data.supplierId), alertId: nil(data.alertId),
    customerPatientName: nil(data.customerPatientName), customerPatientContact: nil(data.customerPatientContact),
    quantityAffected: data.quantityAffected === "" || data.quantityAffected === undefined ? null : Number(data.quantityAffected),
    unit: nil(data.unit), productCondition: nil(data.productCondition), productStillAvailable: data.productStillAvailable, recallRequired: data.recallRequired,
    description: data.description, patientImpact: nil(data.patientImpact), immediateActionRequired: criticality === "CRITICAL",
    immediateActionTaken: data.immediateActionTaken, immediateAction: nil(data.immediateAction), immediateActionAt: data.immediateActionTaken ? new Date() : null,
    immediateActionById: data.immediateActionTaken ? userId : null, investigationRequired: criticality === "HIGH" || criticality === "CRITICAL",
    assignedToId: nil(data.assignedToId), dueAt: data.dueAt ? new Date(data.dueAt) : null, createdById: userId, updatedById: userId,
  } });
  await prisma.pharmacyQualityEvent.create({ data: { organizationId, incidentId: incident.id, actorId: userId, eventType: "CREATED", newStatus: incident.status } });
  if (criticality === "CRITICAL") await notifyQualityManagers(organizationId, `Incident qualité critique ${incident.incidentNumber}`, incident.title);
  return incident;
}

async function notifyQualityManagers(organizationId: string, title: string, body: string) {
  const members = await prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] } }, select: { userId: true } });
  await notifyUsers({ userIds: members.map((item) => item.userId), organizationId, type: "PHARMACY_QUALITY", title, body, targetUrl: "/enterprise-admin" });
}

export async function getPharmacyQualityDataset(organizationId: string) {
  const [incidents, investigations, capaActions, adverseReactions, complaints, documents, events, products, batches, sales, prescriptions, receipts, returns, suppliers, alerts, members, departments, locations] = await Promise.all([
    prisma.pharmacyQualityIncident.findMany({ where: { organizationId }, orderBy: { reportedAt: "desc" }, include: { investigations: true, capaActions: true, adverseReactions: true, complaints: true, documents: true, events: { orderBy: { createdAt: "desc" }, take: 50 } } }),
    prisma.pharmacyQualityInvestigation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyQualityCapaAction.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyAdverseReactionReport.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyCustomerComplaint.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyQualityDocument.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.pharmacyQualityEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.pharmacyProduct.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, stockUnit: true } }),
    prisma.pharmacyBatch.findMany({ where: { organizationId }, select: { id: true, productId: true, batchNumber: true, status: true, quarantine: true, recall: true } }),
    prisma.pharmacySale.findMany({ where: { organizationId }, select: { id: true, saleNumber: true, customerName: true, prescriptionId: true } }),
    prisma.pharmacyPrescription.findMany({ where: { organizationId }, select: { id: true, prescriptionNumber: true, patientName: true } }),
    prisma.pharmacyReceipt.findMany({ where: { organizationId }, select: { id: true, receiptNumber: true } }),
    prisma.pharmacyReturnLossEvent.findMany({ where: { organizationId }, select: { id: true, eventNumber: true } }),
    prisma.pharmacySupplier.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.pharmacyAlert.findMany({ where: { organizationId }, select: { id: true, alertNumber: true, title: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, select: { user: { select: { id: true, name: true } } } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId }, select: { id: true, labelFr: true } }),
    prisma.pharmacyStockLocation.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true, code: true } }),
  ]);
  const now = new Date(); const today = now.toISOString().slice(0, 10); const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const closedThisMonth = incidents.filter((item) => item.closedAt && item.closedAt >= month); const resolvedDurations = closedThisMonth.map((item) => item.closedAt ? (item.closedAt.getTime() - item.reportedAt.getTime()) / 3600000 : 0);
  const open = incidents.filter((item) => activeStatuses.includes(item.status));
  const metrics = { open: open.length, critical: open.filter((item) => item.criticality === "CRITICAL").length, high: open.filter((item) => item.criticality === "HIGH").length, medium: open.filter((item) => item.criticality === "MEDIUM").length, low: open.filter((item) => item.criticality === "LOW").length, today: incidents.filter((item) => item.reportedAt.toISOString().slice(0, 10) === today).length, month: incidents.filter((item) => item.reportedAt >= month).length, dispensingErrors: incidents.filter((item) => item.category === "DISPENSING").length, adverseReactions: adverseReactions.length, suspectProducts: incidents.filter((item) => ["SUSPECT_PRODUCT", "SUSPECTED_COUNTERFEIT", "NON_COMPLIANT_PRODUCT"].includes(item.incidentType)).length, batches: new Set(incidents.map((item) => item.batchId).filter(Boolean)).size, quarantinedBatches: batches.filter((item) => item.quarantine).length, openComplaints: complaints.filter((item) => item.status === "OPEN").length, pendingCapa: capaActions.filter((item) => !["VALIDATED", "CANCELLED"].includes(item.status)).length, investigations: investigations.filter((item) => item.status !== "COMPLETED").length, overdue: open.filter((item) => item.dueAt && item.dueAt < now).length, closedMonth: closedThisMonth.length, averageResolutionHours: resolvedDurations.length ? Math.round(resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length) : 0 };
  return { metrics, incidents, investigations, capaActions, adverseReactions, complaints, documents, events, products, batches, sales, prescriptions, receipts, returns, suppliers, alerts, members: members.map((item) => item.user), departments, locations };
}

export async function createQualityRelated(organizationId: string, userId: string, data: RelatedInput) {
  const incident = await prisma.pharmacyQualityIncident.findFirst({ where: { id: data.incidentId, organizationId } }); if (!incident) throw new Error("INCIDENT_NOT_FOUND");
  if (!(await activeMember(organizationId, data.responsibleId))) throw new Error("ASSIGNEE_INVALID");
  if (data.entityType === "investigation") return prisma.pharmacyQualityInvestigation.create({ data: { organizationId, incidentId: incident.id, title: data.title || `Investigation ${incident.incidentNumber}`, leadUserId: nil(data.responsibleId), method: nil(data.method), rootCause: nil(data.rootCause), findings: nil(data.findings), conclusion: nil(data.conclusion), dueAt: data.dueAt ? new Date(data.dueAt) : null, createdById: userId } });
  if (data.entityType === "capa") return prisma.pharmacyQualityCapaAction.create({ data: { organizationId, incidentId: incident.id, actionType: data.actionType || "CORRECTIVE", title: data.title || "Action corrective", description: data.description || "Action à préciser", required: data.required ?? true, responsibleId: nil(data.responsibleId), dueAt: data.dueAt ? new Date(data.dueAt) : null, createdById: userId } });
  if (data.entityType === "adverse-reaction") return prisma.pharmacyAdverseReactionReport.create({ data: { organizationId, incidentId: incident.id, seriousness: data.seriousness || "NON_SERIOUS", reactionDescription: data.reactionDescription || data.description || "Effet indésirable rapporté", onsetAt: data.onsetAt ? new Date(data.onsetAt) : null, outcome: nil(data.outcome), actionTaken: nil(data.actionTaken), reporterType: nil(data.reporterType), createdById: userId } });
  const count = await prisma.pharmacyCustomerComplaint.count({ where: { organizationId } });
  return prisma.pharmacyCustomerComplaint.create({ data: { organizationId, incidentId: incident.id, complaintNumber: `PL-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, channel: data.channel || "COUNTER", customerName: nil(data.customerName), customerContact: nil(data.customerContact), description: data.description || incident.description, requestedOutcome: nil(data.requestedOutcome), assignedToId: nil(data.responsibleId), createdById: userId } });
}

async function createQualityAlert(organizationId: string, incidentId: string, userId: string) {
  const incident = await prisma.pharmacyQualityIncident.findFirst({ where: { id: incidentId, organizationId } }); if (!incident) throw new Error("INCIDENT_NOT_FOUND");
  const deduplicationKey = `QUALITY:${incident.id}`; const existing = await prisma.pharmacyAlert.findUnique({ where: { organizationId_deduplicationKey: { organizationId, deduplicationKey } } });
  if (existing) return existing;
  const count = await prisma.pharmacyAlert.count({ where: { organizationId } });
  return prisma.pharmacyAlert.create({ data: { organizationId, alertNumber: `ALT-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`, deduplicationKey, alertType: "QUALITY_INCIDENT_CRITICAL", category: "QUALITY", title: incident.title, message: incident.description, criticality: incident.criticality, sourceModule: "QUALITY_PHARMACOVIGILANCE", sourceEntityType: "PharmacyQualityIncident", sourceEntityId: incident.id, productId: incident.productId, batchId: incident.batchId, saleId: incident.saleId, supplierId: incident.supplierId, recommendedAction: incident.immediateAction || "Traiter immédiatement l'incident qualité.", createdById: userId } });
}

export async function transitionQualityEntity(organizationId: string, entity: string, id: string, userId: string, action: string, comment?: string, assignedToId?: string) {
  if (entity === "investigation") {
    const investigation = await prisma.pharmacyQualityInvestigation.findFirst({ where: { id, organizationId } }); if (!investigation) throw new Error("INCIDENT_NOT_FOUND");
    if (action === "complete") return prisma.pharmacyQualityInvestigation.update({ where: { id }, data: { status: "COMPLETED", conclusion: comment, completedAt: new Date(), updatedById: userId } });
  }
  if (entity === "capa") {
    const capa = await prisma.pharmacyQualityCapaAction.findFirst({ where: { id, organizationId } }); if (!capa) throw new Error("INCIDENT_NOT_FOUND");
    if (action === "complete") return prisma.pharmacyQualityCapaAction.update({ where: { id }, data: { status: "COMPLETED", effectiveness: comment, completedAt: new Date(), updatedById: userId } });
    if (action === "validate") return prisma.pharmacyQualityCapaAction.update({ where: { id }, data: { status: "VALIDATED", validationNotes: comment, validatedById: userId, validatedAt: new Date(), updatedById: userId } });
    if (action === "reject-capa") { if (!comment) throw new Error("COMMENT_REQUIRED"); return prisma.pharmacyQualityCapaAction.update({ where: { id }, data: { status: "REJECTED", rejectedReason: comment, updatedById: userId } }); }
  }
  const incident = await prisma.pharmacyQualityIncident.findFirst({ where: { id, organizationId }, include: { investigations: true, capaActions: true } }); if (!incident) throw new Error("INCIDENT_NOT_FOUND");
  if (assignedToId && !(await activeMember(organizationId, assignedToId))) throw new Error("ASSIGNEE_INVALID");
  if (action === "submit" && incident.immediateActionRequired && !incident.immediateActionTaken && !incident.immediateAction?.trim()) throw new Error("IMMEDIATE_ACTION_REQUIRED");
  if (action === "close") {
    const qualitySettings = (await getEffectivePharmacySettings(organizationId, userId)).sections.quality;
    if (incident.criticality === "CRITICAL" && !incident.resolutionSummary?.trim() && !comment?.trim()) throw new Error("RESOLUTION_REQUIRED");
    if (incident.investigationRequired && !incident.investigations.some((item) => item.status === "COMPLETED")) throw new Error("INVESTIGATION_REQUIRED");
    if (qualitySettings.criticalIncidentRequiresCapa && incident.criticality === "CRITICAL" && !incident.capaActions.some((item) => item.required)) throw new Error("CAPA_OPEN");
    if (incident.capaActions.some((item) => item.required && item.status !== "VALIDATED")) throw new Error("CAPA_OPEN");
  }
  if (["reject", "cancel", "resolve", "close"].includes(action) && !comment?.trim() && action !== "close") throw new Error("COMMENT_REQUIRED");
  if (action === "quarantine-batch" || action === "block-batch") {
    if (!incident.batchId || !comment?.trim()) throw new Error("BATCH_REASON_REQUIRED");
    const batch = await prisma.pharmacyBatch.findFirst({ where: { id: incident.batchId, organizationId } }); if (!batch) throw new Error("BATCH_NOT_FOUND");
    const quarantine = action === "quarantine-batch";
    await prisma.$transaction([prisma.pharmacyBatch.update({ where: { id: batch.id }, data: { status: quarantine ? "QUARANTINED" : "BLOCKED", quarantine: quarantine || batch.quarantine, quarantineReason: quarantine ? comment : batch.quarantineReason, statusReason: comment, decisionResponsibleId: userId, updatedById: userId } }), prisma.pharmacyStockMovement.create({ data: { organizationId, productId: batch.productId, batchId: batch.id, movementType: quarantine ? "QUARANTINE" : "QUALITY_BLOCK", quantity: 0, quantityBefore: batch.availableQuantity, quantityAfter: batch.availableQuantity, reason: comment, relatedEntityType: "PharmacyQualityIncident", relatedEntityId: incident.id, createdById: userId } })]);
  }
  if (action === "create-alert") await createQualityAlert(organizationId, incident.id, userId);
  const status = action === "submit" ? "REPORTED" : action === "triage" ? "TRIAGE" : action === "take" ? "INVESTIGATION" : action === "resolve" ? "RESOLVED" : action === "close" ? "CLOSED" : action === "reopen" ? "REPORTED" : action === "reject" ? "REJECTED" : action === "cancel" ? "CANCELLED" : incident.status;
  const updated = await prisma.pharmacyQualityIncident.update({ where: { id: incident.id }, data: { status, assignedToId: action === "take" ? userId : assignedToId || incident.assignedToId, resolutionSummary: action === "resolve" || action === "close" ? comment : incident.resolutionSummary, rejectionReason: action === "reject" ? comment : incident.rejectionReason, cancellationReason: action === "cancel" ? comment : incident.cancellationReason, resolvedAt: action === "resolve" ? new Date() : incident.resolvedAt, resolvedById: action === "resolve" ? userId : incident.resolvedById, closedAt: action === "close" ? new Date() : action === "reopen" ? null : incident.closedAt, closedById: action === "close" ? userId : action === "reopen" ? null : incident.closedById, updatedById: userId } });
  await prisma.pharmacyQualityEvent.create({ data: { organizationId, incidentId: incident.id, actorId: userId, eventType: action.toUpperCase().replaceAll("-", "_"), oldStatus: incident.status, newStatus: updated.status, comment } });
  return updated;
}
