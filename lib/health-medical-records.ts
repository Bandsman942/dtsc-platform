import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { healthMedicalRecordCreateSchema, healthMedicalRecordItemSchema } from "@/lib/health-medical-record-validators";

type RecordInput = z.infer<typeof healthMedicalRecordCreateSchema>;
type ItemInput = z.infer<typeof healthMedicalRecordItemSchema>;
const nil = (value?: string) => value?.trim() || null;
const recordNumber = () => `DM-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

export async function validateHealthMedicalRecordPatient(organizationId: string, patientId: string) {
  return prisma.healthPatient.findFirst({ where: { id: patientId, organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, select: { id: true, legacyRecordId: true, fullName: true, patientNumber: true } });
}

export async function createHealthMedicalRecord(organizationId: string, actorUserId: string, data: RecordInput) {
  const patient = await validateHealthMedicalRecordPatient(organizationId, data.patientId);
  if (!patient?.legacyRecordId) throw new Error("INVALID_PATIENT");
  return prisma.$transaction(async (tx) => {
    const number = recordNumber();
    const legacy = await tx.enterpriseSectorRecord.create({ data: {
      organizationId, sectorCode: "HEALTH_CARE", moduleCode: "MEDICAL_RECORDS", recordType: "MEDICAL_RECORD",
      title: `Dossier médical · ${patient.fullName}`, summary: nil(data.summary), status: "ACTIVE", priority: "NORMAL", createdById: actorUserId,
      payloadJson: { patientRecordId: patient.legacyRecordId, patientCode: patient.patientNumber, confidentialityLevel: data.confidentialityLevel },
    } });
    const record = await tx.healthMedicalRecord.create({ data: {
      organizationId, legacyRecordId: legacy.id, patientId: patient.id, recordNumber: number, createdById: actorUserId,
      summary: nil(data.summary), activeProblems: nil(data.activeProblems), riskFactors: nil(data.riskFactors), importantHistorySummary: nil(data.importantHistorySummary),
      mainAllergiesSummary: nil(data.mainAllergiesSummary), chronicTreatmentsSummary: nil(data.chronicTreatmentsSummary), generalRecommendations: nil(data.generalRecommendations),
      followUpNotes: nil(data.followUpNotes), confidentialityLevel: data.confidentialityLevel,
    } });
    await tx.healthMedicalRecordEvent.create({ data: { organizationId, medicalRecordId: record.id, eventType: "CREATED", summary: "Dossier médical créé.", actorUserId } });
    return record;
  });
}

export async function updateHealthMedicalRecord(organizationId: string, recordId: string, actorUserId: string, data: Partial<RecordInput>) {
  const existing = await prisma.healthMedicalRecord.findFirst({ where: { id: recordId, organizationId }, include: { patient: true } });
  if (!existing) return null;
  if (existing.status === "ARCHIVED") throw new Error("RECORD_LOCKED");
  if (data.patientId && data.patientId !== existing.patientId) throw new Error("PATIENT_IMMUTABLE");
  return prisma.$transaction(async (tx) => {
    const record = await tx.healthMedicalRecord.update({ where: { id: existing.id }, data: { ...data, updatedById: actorUserId } });
    if (existing.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: existing.legacyRecordId }, data: { summary: nil(record.summary || undefined), updatedById: actorUserId, payloadJson: { patientRecordId: existing.patient.legacyRecordId, patientCode: existing.patient.patientNumber, confidentialityLevel: record.confidentialityLevel } } });
    await tx.healthMedicalRecordEvent.create({ data: { organizationId, medicalRecordId: record.id, eventType: "UPDATED", summary: "Synthèse du dossier médical mise à jour.", actorUserId } });
    return record;
  });
}

export async function transitionHealthMedicalRecord(organizationId: string, recordId: string, actorUserId: string, action: "archive" | "reactivate", reason?: string) {
  const existing = await prisma.healthMedicalRecord.findFirst({ where: { id: recordId, organizationId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (!reason?.trim()) throw new Error("REASON_REQUIRED");
  const status = action === "archive" ? "ARCHIVED" : "ACTIVE";
  return prisma.$transaction(async (tx) => {
    const record = await tx.healthMedicalRecord.update({ where: { id: existing.id }, data: { status, archivedAt: action === "archive" ? new Date() : null, archivedById: action === "archive" ? actorUserId : null, archiveReason: action === "archive" ? reason : null, updatedById: actorUserId } });
    if (existing.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: existing.legacyRecordId }, data: { status, updatedById: actorUserId } });
    await tx.healthMedicalRecordEvent.create({ data: { organizationId, medicalRecordId: record.id, eventType: action.toUpperCase(), summary: reason, actorUserId } });
    return record;
  });
}

export async function createHealthMedicalRecordItem(organizationId: string, recordId: string, actorUserId: string, data: ItemInput) {
  const record = await prisma.healthMedicalRecord.findFirst({ where: { id: recordId, organizationId, status: "ACTIVE" }, select: { id: true, patientId: true } });
  if (!record) throw new Error("NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    let item: unknown;
    if (data.entity === "history") item = await tx.healthMedicalHistoryItem.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, category: data.category, label: data.label, description: nil(data.description), occurredAt: data.occurredAt, createdById: actorUserId } });
    if (data.entity === "allergy") {
      item = await tx.healthAllergy.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, allergen: data.allergen, allergyType: data.allergyType, reaction: nil(data.reaction), severity: data.severity, createdById: actorUserId } });
      if (data.severity === "SEVERE" || data.severity === "LIFE_THREATENING") await tx.healthMedicalAlert.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, alertType: "ALLERGY", title: `Allergie grave : ${data.allergen}`, description: nil(data.reaction), severity: data.severity === "LIFE_THREATENING" ? "CRITICAL" : "HIGH", createdById: actorUserId } });
    }
    if (data.entity === "treatment") item = await tx.healthCurrentTreatment.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, medicationName: data.medicationName, dosage: nil(data.dosage), frequency: nil(data.frequency), route: nil(data.route), indication: nil(data.indication), startedAt: data.startedAt, endedAt: data.endedAt, createdById: actorUserId } });
    if (data.entity === "alert") item = await tx.healthMedicalAlert.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, alertType: data.alertType, title: data.title, description: nil(data.description), severity: data.severity, createdById: actorUserId } });
    if (data.entity === "confidential_note") item = await tx.healthConfidentialNote.create({ data: { organizationId, medicalRecordId: record.id, patientId: record.patientId, title: data.title, content: data.content, visibility: data.visibility, createdById: actorUserId } });
    await tx.healthMedicalRecordEvent.create({ data: { organizationId, medicalRecordId: record.id, eventType: `${data.entity.toUpperCase()}_CREATED`, summary: "Élément structuré ajouté au dossier médical.", actorUserId } });
    return item;
  });
}

export async function transitionHealthMedicalRecordItem(organizationId: string, recordId: string, actorUserId: string, entity: string, itemId: string, action: string, reason?: string) {
  const where = { id: itemId, organizationId, medicalRecordId: recordId };
  if (entity === "alert") {
    if (action !== "resolve" || !reason?.trim()) throw new Error("REASON_REQUIRED");
    return prisma.healthMedicalAlert.updateMany({ where, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actorUserId, resolutionNotes: reason } });
  }
  const status = action === "reactivate" ? "ACTIVE" : "ARCHIVED";
  if (entity === "history") return prisma.healthMedicalHistoryItem.updateMany({ where, data: { status } });
  if (entity === "allergy") return prisma.healthAllergy.updateMany({ where, data: { status } });
  if (entity === "treatment") return prisma.healthCurrentTreatment.updateMany({ where, data: { status, endedAt: status === "ARCHIVED" ? new Date() : null } });
  throw new Error("INVALID_ENTITY");
}

export function medicalRecordAdministrativeView<T extends Record<string, unknown>>(record: T) {
  return { id: record.id, recordNumber: record.recordNumber, patientId: record.patientId, status: record.status, confidentialityLevel: record.confidentialityLevel, createdAt: record.createdAt, updatedAt: record.updatedAt, patient: record.patient, activeAlertCount: record.activeAlertCount };
}
