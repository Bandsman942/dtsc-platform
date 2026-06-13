/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const nil = (value?: string) => value?.trim() || null;
const incidentNumber = () => `IQ-${new Date().getFullYear()}-${randomUUID().slice(0, 7).toUpperCase()}`;

export async function validateHealthQualityReferences(organizationId: string, data: any) {
  const refs = await Promise.all([
    data.departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true } }) : null,
    data.patientId ? prisma.healthPatient.findFirst({ where: { id: data.patientId, organizationId } }) : null,
    data.appointmentId ? prisma.healthAppointment.findFirst({ where: { id: data.appointmentId, organizationId } }) : null,
    data.consultationId ? prisma.healthConsultation.findFirst({ where: { id: data.consultationId, organizationId } }) : null,
    data.medicalRecordId ? prisma.healthMedicalRecord.findFirst({ where: { id: data.medicalRecordId, organizationId } }) : null,
    data.labRequestId ? prisma.healthLabRequest.findFirst({ where: { id: data.labRequestId, organizationId } }) : null,
    data.pharmacyDispensationId ? prisma.healthPharmacyDispensation.findFirst({ where: { id: data.pharmacyDispensationId, organizationId } }) : null,
    data.pharmacyStockMovementId ? prisma.healthPharmacyStockMovement.findFirst({ where: { id: data.pharmacyStockMovementId, organizationId } }) : null,
    data.invoiceId ? prisma.healthMedicalInvoice.findFirst({ where: { id: data.invoiceId, organizationId } }) : null,
    data.coverageRequestId ? prisma.healthCoverageRequest.findFirst({ where: { id: data.coverageRequestId, organizationId } }) : null,
    data.staffAssignmentId ? prisma.healthStaffAssignment.findFirst({ where: { id: data.staffAssignmentId, organizationId, status: "ACTIVE" } }) : null,
    data.assignedToId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: data.assignedToId, status: "ACTIVE", removedAt: null } }) : null,
  ]);
  const keys = ["departmentId", "patientId", "appointmentId", "consultationId", "medicalRecordId", "labRequestId", "pharmacyDispensationId", "pharmacyStockMovementId", "invoiceId", "coverageRequestId", "staffAssignmentId", "assignedToId"];
  keys.forEach((key, index) => { if (data[key] && !refs[index]) throw new Error(`INVALID_${key.toUpperCase()}`); });
  const patientId = data.patientId;
  for (const ref of refs.slice(2, 10)) if (patientId && ref && "patientId" in ref && ref.patientId && ref.patientId !== patientId) throw new Error("PATIENT_MISMATCH");
}

export async function createHealthQualityIncident(organizationId: string, userId: string, data: any) {
  await validateHealthQualityReferences(organizationId, data);
  return prisma.healthQualityIncident.create({ data: {
    organizationId, incidentNumber: incidentNumber(), title: data.title, incidentType: data.incidentType, description: data.description, occurredAt: data.occurredAt,
    reportedById: userId, anonymousReport: data.anonymousReport, departmentId: nil(data.departmentId), patientId: nil(data.patientId), appointmentId: nil(data.appointmentId),
    consultationId: nil(data.consultationId), medicalRecordId: nil(data.medicalRecordId), labRequestId: nil(data.labRequestId), pharmacyDispensationId: nil(data.pharmacyDispensationId),
    pharmacyStockMovementId: nil(data.pharmacyStockMovementId), invoiceId: nil(data.invoiceId), coverageRequestId: nil(data.coverageRequestId), staffAssignmentId: nil(data.staffAssignmentId),
    initialSeverity: data.initialSeverity, initialCriticality: data.initialCriticality, patientImpact: data.patientImpact, organizationalImpact: data.organizationalImpact,
    recurrenceProbability: data.recurrenceProbability, detectability: data.detectability, urgency: data.urgency, patientInformed: data.patientInformed,
    immediateSupervisorInformed: data.immediateSupervisorInformed, observedConsequences: nil(data.observedConsequences), immediateActions: nil(data.immediateActions),
    witnesses: nil(data.witnesses), internalNotes: nil(data.internalNotes), confidentialityLevel: data.confidentialityLevel, containsSensitiveMedicalData: data.containsSensitiveMedicalData,
    confidentialityIncident: data.confidentialityIncident, restrictedAccess: data.restrictedAccess, confidentialityReason: nil(data.confidentialityReason), status: "REPORTED", createdById: userId,
    events: { create: { eventType: "REPORTED", summary: "Incident qualité signalé.", toStatus: "REPORTED", actorUserId: userId } },
  }, include: { correctiveActions: true, events: true } });
}

export async function updateHealthQualityIncident(organizationId: string, incidentId: string, userId: string, data: any) {
  const existing = await prisma.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (["CLOSED", "ARCHIVED"].includes(existing.status)) throw new Error("LOCKED");
  await validateHealthQualityReferences(organizationId, data);
  const sensitive = data.patientId !== undefined || data.confidentialityLevel !== undefined || data.restrictedAccess !== undefined;
  if (sensitive && !data.reason) throw new Error("REASON_REQUIRED");
  const { reason, ...changes } = data;
  return prisma.healthQualityIncident.update({ where: { id: existing.id }, data: { ...changes, updatedById: userId, events: { create: { eventType: "UPDATED", summary: "Incident qualité mis à jour.", reason, actorUserId: userId } } } });
}

export async function healthQualityIncidentAction(organizationId: string, incidentId: string, userId: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId }, include: { correctiveActions: true } });
    if (!incident) throw new Error("NOT_FOUND");
    if (incident.status === "ARCHIVED" && data.action !== "reopen") throw new Error("LOCKED");
    let status = incident.status;
    let changes: any = {};
    let summary = "";
    if (data.action === "qualify") {
      if (["CLOSED", "ARCHIVED"].includes(status)) throw new Error("LOCKED");
      await validateHealthQualityReferences(organizationId, data);
      status = "IN_INVESTIGATION"; summary = "Incident qualifié et transmis en investigation.";
      changes = { confirmedSeverity: data.confirmedSeverity, confirmedCriticality: data.confirmedCriticality, patientImpact: data.patientImpact, organizationalImpact: data.organizationalImpact, recurrenceProbability: data.recurrenceProbability, escalationRequired: data.escalationRequired, assignedToId: data.assignedToId, dueDate: data.dueDate, qualificationNotes: data.notes, qualifiedById: userId, qualifiedAt: new Date() };
    } else if (data.action === "assign") {
      await validateHealthQualityReferences(organizationId, data); summary = "Responsable de traitement assigné."; changes = { assignedToId: data.assignedToId, dueDate: data.dueDate };
    } else if (data.action === "investigate") {
      if (["CLOSED", "ARCHIVED"].includes(status)) throw new Error("LOCKED");
      status = incident.correctiveActions.length ? "CORRECTIVE_ACTION_IN_PROGRESS" : "CORRECTIVE_ACTION_REQUIRED"; summary = "Investigation enregistrée.";
      changes = { investigationSummary: data.investigationSummary, immediateCause: nil(data.immediateCause), rootCause: nil(data.rootCause), contributingFactors: nil(data.contributingFactors), investigationConclusion: data.investigationConclusion, recommendations: nil(data.recommendations), investigatedById: userId, investigatedAt: new Date() };
    } else if (data.action === "close") {
      const openActions = incident.correctiveActions.filter((item) => !["VALIDATED", "CANCELLED"].includes(item.status));
      if ((incident.confirmedCriticality === "CRITICAL" || incident.initialCriticality === "CRITICAL") && !data.finalConclusion) throw new Error("CONCLUSION_REQUIRED");
      if (openActions.length && !data.openActionsJustification) throw new Error("OPEN_ACTIONS");
      status = "CLOSED"; summary = "Incident clôturé.";
      changes = { finalConclusion: data.finalConclusion, residualRisk: data.residualRisk, lessonsLearned: nil(data.lessonsLearned), procedureUpdated: data.procedureUpdated, closureNotes: nil(data.closureNotes) || nil(data.openActionsJustification), closedById: userId, closedAt: new Date() };
    } else if (data.action === "reopen") {
      if (status !== "CLOSED" && status !== "ARCHIVED") throw new Error("INVALID_TRANSITION");
      status = "IN_INVESTIGATION"; summary = "Incident rouvert."; changes = { reopenedById: userId, reopenedAt: new Date(), reopenReason: data.reason, archivedAt: null, archivedById: null };
    } else if (data.action === "archive") {
      if (status !== "CLOSED") throw new Error("INVALID_TRANSITION");
      status = "ARCHIVED"; summary = "Incident archivé."; changes = { archivedById: userId, archivedAt: new Date(), archiveReason: data.reason };
    }
    return tx.healthQualityIncident.update({ where: { id: incident.id }, data: { status, ...changes, updatedById: userId, events: { create: { eventType: data.action.toUpperCase(), summary, fromStatus: incident.status, toStatus: status, reason: data.reason || data.notes || data.closureNotes, actorUserId: userId } } } });
  });
}

export async function createHealthQualityCorrectiveAction(organizationId: string, incidentId: string, userId: string, data: any) {
  await validateHealthQualityReferences(organizationId, { assignedToId: data.responsibleUserId, staffAssignmentId: data.responsibleStaffId });
  const incident = await prisma.healthQualityIncident.findFirst({ where: { id: incidentId, organizationId } });
  if (!incident || ["CLOSED", "ARCHIVED"].includes(incident.status)) throw new Error(incident ? "LOCKED" : "NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const action = await tx.healthQualityCorrectiveAction.create({ data: { organizationId, incidentId, title: data.title, description: data.description, actionType: data.actionType, responsibleUserId: data.responsibleUserId, responsibleStaffId: nil(data.responsibleStaffId), dueDate: data.dueDate, priority: data.priority, createdById: userId } });
    await tx.healthQualityIncident.update({ where: { id: incident.id }, data: { status: "CORRECTIVE_ACTION_IN_PROGRESS", events: { create: { eventType: "CORRECTIVE_ACTION_CREATED", summary: `Action corrective ajoutée : ${data.title}`, actorUserId: userId } } } });
    return action;
  });
}

export async function healthQualityCorrectiveAction(organizationId: string, actionId: string, userId: string, data: any) {
  const action = await prisma.healthQualityCorrectiveAction.findFirst({ where: { id: actionId, organizationId } });
  if (!action) throw new Error("NOT_FOUND");
  if (["VALIDATED", "CANCELLED"].includes(action.status)) throw new Error("LOCKED");
  const now = new Date(); let status = action.status; let changes: any = {}; let summary = "";
  if (data.action === "start") { status = "IN_PROGRESS"; summary = "Action corrective démarrée."; }
  if (data.action === "complete") { status = "WAITING_VALIDATION"; summary = "Action corrective soumise à validation."; changes = { completionComment: data.completionComment, evidenceUrl: nil(data.evidenceUrl), completedById: userId, completedAt: now }; }
  if (data.action === "validate") { if (status !== "WAITING_VALIDATION") throw new Error("INVALID_TRANSITION"); status = "VALIDATED"; summary = "Action corrective validée."; changes = { validationComment: nil(data.validationComment), validatedById: userId, validatedAt: now }; }
  if (data.action === "reject") { if (status !== "WAITING_VALIDATION") throw new Error("INVALID_TRANSITION"); status = "REJECTED"; summary = "Action corrective rejetée."; changes = { rejectionReason: data.rejectionReason }; }
  if (data.action === "cancel") { status = "CANCELLED"; summary = "Action corrective annulée."; changes = { cancellationReason: data.reason, cancelledById: userId, cancelledAt: now }; }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.healthQualityCorrectiveAction.update({ where: { id: action.id }, data: { status, ...changes, updatedById: userId } });
    await tx.healthQualityIncidentEvent.create({ data: { organizationId, incidentId: action.incidentId, eventType: `ACTION_${data.action.toUpperCase()}`, summary, reason: data.rejectionReason || data.reason || data.validationComment || data.completionComment, actorUserId: userId } });
    return updated;
  });
}
