import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type HealthAppointmentInput = {
  patientId: string;
  professionalId?: string;
  departmentId?: string;
  appointmentDate: Date;
  estimatedDurationMinutes?: number;
  reason: string;
  description?: string;
  appointmentType: string;
  priority: string;
  administrativeNotes?: string;
  internalNotes?: string;
};

const transitions: Record<string, string[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW", "CONVERTED"],
  CONFIRMED: ["WAITING", "IN_PROGRESS", "CANCELLED", "NO_SHOW", "CONVERTED"],
  WAITING: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["DONE", "CANCELLED", "CONVERTED"],
  DONE: ["CONVERTED"],
};

const actionStatus: Record<string, string> = {
  confirm: "CONFIRMED",
  wait: "WAITING",
  start: "IN_PROGRESS",
  complete: "DONE",
  cancel: "CANCELLED",
  mark_absent: "NO_SHOW",
  convert_consultation: "CONVERTED",
};

function nil(value: string | undefined) {
  return value?.trim() || null;
}

function appointmentNumber() {
  return `RDV-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function legacyPayload(data: HealthAppointmentInput, patientLegacyRecordId: string, number: string): Prisma.InputJsonObject {
  return {
    appointmentNumber: number,
    patientRecordId: patientLegacyRecordId,
    appointmentDate: data.appointmentDate.toISOString(),
    appointmentType: data.appointmentType,
    service: data.reason,
    departmentId: nil(data.departmentId),
  };
}

export async function validateHealthAppointmentReferences(organizationId: string, data: Partial<HealthAppointmentInput>) {
  const patientId = data.patientId;
  const professionalId = data.professionalId;
  const departmentId = data.departmentId;
  const [patient, professional, department] = await Promise.all([
    patientId ? prisma.healthPatient.findFirst({ where: { id: patientId, organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, select: { id: true, legacyRecordId: true, fullName: true } }) : null,
    professionalId ? prisma.organizationMember.findFirst({ where: { organizationId, userId: professionalId, status: "ACTIVE", removedAt: null }, select: { userId: true } }) : null,
    departmentId ? prisma.enterpriseDepartment.findFirst({ where: { id: departmentId, organizationId, isActive: true }, select: { id: true } }) : null,
  ]);
  if (patientId && !patient) return { error: "Ce patient n’appartient pas à cette entreprise ou n’est plus actif." };
  if (patientId && !patient?.legacyRecordId) return { error: "Ce patient ne peut pas encore être relié aux autres modules Santé." };
  if (professionalId && !professional) return { error: "Le professionnel sélectionné n’appartient pas à cette entreprise." };
  if (departmentId && !department) return { error: "Le service sélectionné n’appartient pas à cette entreprise." };
  return { patient };
}

export async function createHealthAppointment(organizationId: string, actorUserId: string, data: HealthAppointmentInput) {
  const references = await validateHealthAppointmentReferences(organizationId, data);
  if (references.error || !references.patient?.legacyRecordId) throw new Error("INVALID_REFERENCE");
  const patient = references.patient;
  const patientLegacyRecordId = patient.legacyRecordId;
  if (!patientLegacyRecordId) throw new Error("INVALID_REFERENCE");
  return prisma.$transaction(async (tx) => {
    const number = appointmentNumber();
    const endAt = data.estimatedDurationMinutes ? new Date(data.appointmentDate.getTime() + data.estimatedDurationMinutes * 60000) : null;
    const legacy = await tx.enterpriseSectorRecord.create({
      data: {
        organizationId,
        sectorCode: "HEALTH_CARE",
        moduleCode: "APPOINTMENTS",
        recordType: "APPOINTMENT",
        title: `${patient.fullName} · ${data.reason}`,
        summary: nil(data.description),
        status: "SCHEDULED",
        priority: data.priority,
        assignedToUserId: nil(data.professionalId),
        createdById: actorUserId,
        payloadJson: legacyPayload(data, patientLegacyRecordId, number),
      },
    });
    const appointment = await tx.healthAppointment.create({
      data: {
        organizationId,
        legacyRecordId: legacy.id,
        patientId: patient.id,
        appointmentNumber: number,
        professionalId: nil(data.professionalId),
        departmentId: nil(data.departmentId),
        appointmentDate: data.appointmentDate,
        endAt,
        estimatedDurationMinutes: data.estimatedDurationMinutes,
        reason: data.reason,
        description: nil(data.description),
        appointmentType: data.appointmentType,
        priority: data.priority,
        administrativeNotes: nil(data.administrativeNotes),
        internalNotes: nil(data.internalNotes),
        createdById: actorUserId,
      },
    });
    await tx.healthAppointmentEvent.create({ data: { organizationId, appointmentId: appointment.id, eventType: "CREATED", summary: "Rendez-vous créé.", toStatus: appointment.status, actorUserId } });
    return appointment;
  });
}

export async function updateHealthAppointment(organizationId: string, appointmentId: string, actorUserId: string, data: Partial<HealthAppointmentInput>) {
  const existing = await prisma.healthAppointment.findFirst({ where: { id: appointmentId, organizationId }, include: { patient: { select: { legacyRecordId: true, fullName: true } } } });
  if (!existing) return null;
  if (["DONE", "CANCELLED", "CONVERTED"].includes(existing.status)) throw new Error("APPOINTMENT_LOCKED");
  const references = await validateHealthAppointmentReferences(organizationId, { patientId: data.patientId || existing.patientId, professionalId: data.professionalId, departmentId: data.departmentId });
  if (references.error) throw new Error("INVALID_REFERENCE");
  return prisma.$transaction(async (tx) => {
    const appointmentDate = data.appointmentDate || existing.appointmentDate;
    const duration = data.estimatedDurationMinutes ?? existing.estimatedDurationMinutes;
    const appointment = await tx.healthAppointment.update({
      where: { id: existing.id },
      data: {
        ...data,
        professionalId: data.professionalId === "" ? null : data.professionalId,
        departmentId: data.departmentId === "" ? null : data.departmentId,
        description: data.description === "" ? null : data.description,
        administrativeNotes: data.administrativeNotes === "" ? null : data.administrativeNotes,
        internalNotes: data.internalNotes === "" ? null : data.internalNotes,
        endAt: duration ? new Date(appointmentDate.getTime() + duration * 60000) : null,
        updatedById: actorUserId,
      },
      include: { patient: { select: { legacyRecordId: true, fullName: true } } },
    });
    if (existing.legacyRecordId && appointment.patient.legacyRecordId) {
      await tx.enterpriseSectorRecord.update({
        where: { id: existing.legacyRecordId },
        data: {
          title: `${appointment.patient.fullName} · ${appointment.reason}`,
          summary: appointment.description,
          priority: appointment.priority,
          assignedToUserId: appointment.professionalId,
          updatedById: actorUserId,
          payloadJson: legacyPayload({
            patientId: appointment.patientId, professionalId: appointment.professionalId || undefined, departmentId: appointment.departmentId || undefined,
            appointmentDate: appointment.appointmentDate, estimatedDurationMinutes: appointment.estimatedDurationMinutes || undefined, reason: appointment.reason,
            description: appointment.description || undefined, appointmentType: appointment.appointmentType, priority: appointment.priority,
            administrativeNotes: appointment.administrativeNotes || undefined, internalNotes: appointment.internalNotes || undefined,
          }, appointment.patient.legacyRecordId, appointment.appointmentNumber),
        },
      });
    }
    await tx.healthAppointmentEvent.create({ data: { organizationId, appointmentId: appointment.id, eventType: "UPDATED", summary: "Rendez-vous modifié.", fromStatus: appointment.status, toStatus: appointment.status, actorUserId } });
    return appointment;
  });
}

export async function transitionHealthAppointment(organizationId: string, appointmentId: string, actorUserId: string, action: string, reason?: string) {
  const existing = await prisma.healthAppointment.findFirst({ where: { id: appointmentId, organizationId }, include: { patient: true } });
  if (!existing) throw new Error("APPOINTMENT_NOT_FOUND");
  const nextStatus = actionStatus[action];
  if (!nextStatus || !transitions[existing.status]?.includes(nextStatus)) throw new Error("INVALID_TRANSITION");
  if (action === "cancel" && !reason?.trim()) throw new Error("REASON_REQUIRED");
  if (action === "convert_consultation" && existing.convertedConsultationId) throw new Error("ALREADY_CONVERTED");
  return prisma.$transaction(async (tx) => {
    let consultationId = existing.convertedConsultationId;
    if (action === "convert_consultation") {
      const consultation = await tx.enterpriseSectorRecord.create({
        data: {
          organizationId,
          sectorCode: "HEALTH_CARE",
          moduleCode: "CONSULTATIONS",
          recordType: "CONSULTATION",
          title: `Consultation · ${existing.patient.fullName}`,
          summary: existing.reason,
          status: "IN_PROGRESS",
          priority: existing.priority,
          assignedToUserId: existing.professionalId,
          createdById: actorUserId,
          payloadJson: {
            patientRecordId: existing.patient.legacyRecordId,
            appointmentRecordId: existing.legacyRecordId,
            appointmentDate: existing.appointmentDate.toISOString(),
            appointmentType: existing.appointmentType,
            service: existing.reason,
            notes: existing.administrativeNotes,
          },
        },
      });
      consultationId = consultation.id;
    }
    const now = new Date();
    const appointment = await tx.healthAppointment.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        confirmedAt: action === "confirm" ? now : existing.confirmedAt,
        cancelledAt: action === "cancel" ? now : existing.cancelledAt,
        cancelledById: action === "cancel" ? actorUserId : existing.cancelledById,
        cancellationReason: action === "cancel" ? reason : existing.cancellationReason,
        markedAbsentAt: action === "mark_absent" ? now : existing.markedAbsentAt,
        convertedConsultationId: consultationId,
        updatedById: actorUserId,
      },
    });
    if (existing.legacyRecordId) await tx.enterpriseSectorRecord.update({ where: { id: existing.legacyRecordId }, data: { status: nextStatus, updatedById: actorUserId } });
    await tx.healthAppointmentEvent.create({
      data: { organizationId, appointmentId: appointment.id, eventType: action.toUpperCase(), summary: reason?.trim() || `Statut modifié : ${existing.status} → ${nextStatus}.`, fromStatus: existing.status, toStatus: nextStatus, actorUserId, metadataJson: consultationId ? { consultationId } : undefined },
    });
    return { appointment, consultationId };
  });
}
