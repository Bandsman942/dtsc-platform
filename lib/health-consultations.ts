import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAssignableHealthProfessional } from "@/lib/health-staff";
import type { healthConsultationCreateSchema } from "@/lib/health-consultation-validators";

export type HealthConsultationInput = z.infer<typeof healthConsultationCreateSchema>;

const transitions: Record<string, string[]> = {
  DRAFT: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PENDING_EXAMS", "CLOSED", "CANCELLED"],
  PENDING_EXAMS: ["IN_PROGRESS", "REVIEW", "CANCELLED"],
  REVIEW: ["IN_PROGRESS", "CLOSED", "CANCELLED"],
  CLOSED: ["IN_PROGRESS"],
};
const actionStatus: Record<string, string> = { start: "IN_PROGRESS", wait_exams: "PENDING_EXAMS", resume: "IN_PROGRESS", review: "REVIEW", close: "CLOSED", reopen: "IN_PROGRESS", cancel: "CANCELLED" };

function nil(value: string | undefined) { return value?.trim() || null; }
function consultationNumber() { return `CNS-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function bmi(weight?: number, height?: number) { return weight && height ? Math.round((weight / (height * height)) * 10) / 10 : null; }
export function maskHealthConsultationSensitive<T extends Record<string, unknown>>(consultation: T, canViewSensitive: boolean) {
  if (canViewSensitive) return consultation;
  return {
    ...consultation,
    historyOfPresentIllness: null, symptoms: null, symptomDuration: null, aggravatingFactors: null, relievingFactors: null, relevantHistory: null,
    temperature: null, systolicBp: null, diastolicBp: null, heartRate: null, respiratoryRate: null, oxygenSaturation: null, weight: null, height: null, bmi: null, capillaryGlucose: null, painScore: null, vitalsNotes: null,
    generalCondition: null, cardiovascularExam: null, respiratoryExam: null, abdominalExam: null, neurologicalExam: null, entExam: null, dermatologicalExam: null, musculoskeletalExam: null, otherExamNotes: null, clinicalConclusion: null,
    provisionalDiagnosis: null, finalDiagnosis: null, differentialDiagnoses: null, diagnosisCertainty: null, diagnosisCode: null, diagnosisNotes: null,
    managementPlan: null, treatmentPlan: null, prescriptionText: null, requestedTests: null, referralNotes: null, patientAdvice: null, warningSigns: null, lifestyleRecommendations: null, returnInstructions: null,
  };
}
function legacyPayload(data: HealthConsultationInput, patientRecordId: string, appointmentRecordId: string | null, number: string): Prisma.InputJsonObject {
  return { consultationNumber: number, patientRecordId, appointmentRecordId, appointmentType: data.consultationType, appointmentDate: (data.consultationDate || new Date()).toISOString(), departmentId: nil(data.departmentId), service: data.reason };
}

export async function validateHealthConsultationReferences(organizationId: string, data: Partial<HealthConsultationInput>, existingPatientId?: string) {
  const patientId = data.patientId || existingPatientId;
  const appointmentId = data.appointmentId;
  const professionalId = data.professionalId;
  const departmentId = data.departmentId;
  const [patient, appointment, professional, department] = await Promise.all([
    patientId ? prisma.healthPatient.findFirst({ where: { id: patientId, organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, select: { id: true, legacyRecordId: true, fullName: true } }) : null,
    appointmentId ? prisma.healthAppointment.findFirst({ where: { id: appointmentId, organizationId }, select: { id: true, patientId: true, legacyRecordId: true, convertedConsultationId: true, professionalId: true, departmentId: true, reason: true, appointmentType: true, priority: true, appointmentDate: true, administrativeNotes: true } }) : null,
    professionalId ? validateAssignableHealthProfessional(organizationId, professionalId, true) : null,
    departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: departmentId, organizationId, isActive: true }, select: { id: true } }) : null,
  ]);
  if (!patient) return { error: "Patient introuvable ou non actif dans cette entreprise." };
  if (!patient.legacyRecordId) return { error: "Ce patient ne peut pas encore être relié aux autres modules Santé." };
  if (appointmentId && !appointment) return { error: "Le rendez-vous sélectionné n’appartient pas à cette entreprise." };
  if (appointment && appointment.patientId !== patient.id) return { error: "Le rendez-vous sélectionné ne concerne pas ce patient." };
  if (appointment?.convertedConsultationId) return { error: "Ce rendez-vous a déjà été converti en consultation." };
  if (professionalId && !professional) return { error: "Le professionnel sélectionné ne possède pas d’affectation clinique active ou n’est pas disponible." };
  if (departmentId && !department) return { error: "Le service sélectionné n’appartient pas à cette entreprise." };
  return { patient, appointment };
}

export async function createHealthConsultation(organizationId: string, actorUserId: string, data: HealthConsultationInput) {
  const references = await validateHealthConsultationReferences(organizationId, data);
  if (references.error || !references.patient?.legacyRecordId) throw new Error("INVALID_REFERENCE");
  const patient = references.patient;
  const appointment = references.appointment;
  return prisma.$transaction(async (tx) => {
    const number = consultationNumber();
    const legacy = await tx.enterpriseSectorRecord.create({ data: {
      organizationId, sectorCode: "HEALTH_CARE", moduleCode: "CONSULTATIONS", recordType: "CONSULTATION",
      title: `Consultation · ${patient.fullName}`, summary: data.chiefComplaint, status: "DRAFT", priority: data.priority,
      assignedToUserId: data.professionalId, createdById: actorUserId,
      payloadJson: legacyPayload(data, patient.legacyRecordId!, appointment?.legacyRecordId || null, number),
    } });
    const consultation = await tx.healthConsultation.create({ data: {
      ...data, appointmentId: nil(data.appointmentId), departmentId: nil(data.departmentId), consultationDate: data.consultationDate || new Date(),
      historyOfPresentIllness: nil(data.historyOfPresentIllness), symptoms: nil(data.symptoms), symptomDuration: nil(data.symptomDuration), aggravatingFactors: nil(data.aggravatingFactors), relievingFactors: nil(data.relievingFactors), relevantHistory: nil(data.relevantHistory),
      vitalsNotes: nil(data.vitalsNotes), generalCondition: nil(data.generalCondition), cardiovascularExam: nil(data.cardiovascularExam), respiratoryExam: nil(data.respiratoryExam), abdominalExam: nil(data.abdominalExam), neurologicalExam: nil(data.neurologicalExam), entExam: nil(data.entExam), dermatologicalExam: nil(data.dermatologicalExam), musculoskeletalExam: nil(data.musculoskeletalExam), otherExamNotes: nil(data.otherExamNotes), clinicalConclusion: nil(data.clinicalConclusion),
      provisionalDiagnosis: nil(data.provisionalDiagnosis), finalDiagnosis: nil(data.finalDiagnosis), differentialDiagnoses: nil(data.differentialDiagnoses), diagnosisCertainty: nil(data.diagnosisCertainty), diagnosisCode: nil(data.diagnosisCode), diagnosisNotes: nil(data.diagnosisNotes),
      managementPlan: nil(data.managementPlan), treatmentPlan: nil(data.treatmentPlan), prescriptionText: nil(data.prescriptionText), requestedTests: nil(data.requestedTests), referralNotes: nil(data.referralNotes), patientAdvice: nil(data.patientAdvice), warningSigns: nil(data.warningSigns), lifestyleRecommendations: nil(data.lifestyleRecommendations), returnInstructions: nil(data.returnInstructions),
      bmi: bmi(data.weight, data.height), organizationId, legacyRecordId: legacy.id, consultationNumber: number, patientId: patient.id, createdById: actorUserId,
    } });
    if (appointment) {
      await tx.healthAppointment.update({ where: { id: appointment.id }, data: { status: "CONVERTED", convertedConsultationId: consultation.id, updatedById: actorUserId } });
      if (appointment.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: appointment.legacyRecordId }, data: { status: "CONVERTED", updatedById: actorUserId } });
      await tx.healthAppointmentEvent.create({ data: { organizationId, appointmentId: appointment.id, eventType: "CONVERT_CONSULTATION", summary: "Rendez-vous converti en consultation.", fromStatus: "IN_PROGRESS", toStatus: "CONVERTED", actorUserId, metadataJson: { consultationId: consultation.id } } });
    }
    await tx.healthConsultationEvent.create({ data: { organizationId, consultationId: consultation.id, eventType: "CREATED", summary: "Consultation créée.", toStatus: consultation.status, actorUserId } });
    return consultation;
  });
}

export async function updateHealthConsultation(organizationId: string, consultationId: string, actorUserId: string, data: Partial<HealthConsultationInput>) {
  const existing = await prisma.healthConsultation.findFirst({ where: { id: consultationId, organizationId }, include: { patient: true, appointment: true } });
  if (!existing) return null;
  if (["CLOSED", "CANCELLED"].includes(existing.status)) throw new Error("CONSULTATION_LOCKED");
  const refs = await validateHealthConsultationReferences(organizationId, data, existing.patientId);
  if (refs.error) throw new Error("INVALID_REFERENCE");
  return prisma.$transaction(async (tx) => {
    const consultation = await tx.healthConsultation.update({ where: { id: existing.id }, data: {
      ...data, appointmentId: data.appointmentId === "" ? null : data.appointmentId, departmentId: data.departmentId === "" ? null : data.departmentId,
      bmi: bmi(data.weight ?? existing.weight ?? undefined, data.height ?? existing.height ?? undefined), updatedById: actorUserId,
    }, include: { patient: true, appointment: true } });
    if (existing.legacyRecordId && consultation.patient.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: existing.legacyRecordId }, data: {
      title: `Consultation · ${consultation.patient.fullName}`, summary: consultation.chiefComplaint, priority: consultation.priority, assignedToUserId: consultation.professionalId, updatedById: actorUserId,
      payloadJson: legacyPayload({ ...consultation, consultationDate: consultation.consultationDate } as HealthConsultationInput, consultation.patient.legacyRecordId, consultation.appointment?.legacyRecordId || null, consultation.consultationNumber),
    } });
    await tx.healthConsultationEvent.create({ data: { organizationId, consultationId: consultation.id, eventType: "UPDATED", summary: "Informations cliniques mises à jour.", fromStatus: consultation.status, toStatus: consultation.status, actorUserId } });
    return consultation;
  });
}

export async function transitionHealthConsultation(organizationId: string, consultationId: string, actorUserId: string, action: string, reason?: string) {
  const existing = await prisma.healthConsultation.findFirst({ where: { id: consultationId, organizationId } });
  if (!existing) throw new Error("CONSULTATION_NOT_FOUND");
  const nextStatus = actionStatus[action];
  if (!nextStatus || !transitions[existing.status]?.includes(nextStatus)) throw new Error("INVALID_TRANSITION");
  if ((action === "reopen" || action === "cancel") && !reason?.trim()) throw new Error("REASON_REQUIRED");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const consultation = await tx.healthConsultation.update({ where: { id: existing.id }, data: {
      status: nextStatus, updatedById: actorUserId,
      closedAt: action === "close" ? now : action === "reopen" ? null : existing.closedAt, closedById: action === "close" ? actorUserId : action === "reopen" ? null : existing.closedById,
      reopenedAt: action === "reopen" ? now : existing.reopenedAt, reopenedById: action === "reopen" ? actorUserId : existing.reopenedById, reopenReason: action === "reopen" ? reason : existing.reopenReason,
      cancelledAt: action === "cancel" ? now : existing.cancelledAt, cancelledById: action === "cancel" ? actorUserId : existing.cancelledById, cancellationReason: action === "cancel" ? reason : existing.cancellationReason,
    } });
    if (existing.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: existing.legacyRecordId }, data: { status: nextStatus, updatedById: actorUserId } });
    await tx.healthConsultationEvent.create({ data: { organizationId, consultationId, eventType: action.toUpperCase(), summary: reason?.trim() || `Statut modifié : ${existing.status} → ${nextStatus}.`, fromStatus: existing.status, toStatus: nextStatus, actorUserId } });
    return consultation;
  });
}
