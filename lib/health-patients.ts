import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PatientInput = {
  fullName: string;
  sex: string;
  birthDate?: Date | "";
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  address: string;
  city?: string;
  country?: string;
  emergencyContactName: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone: string;
  emergencyContactAddress?: string;
  profession?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  knownAllergies?: string;
  importantHistory?: string;
  chronicTreatments?: string;
  medicalNotes?: string;
  administrativeNotes?: string;
  insuranceKnown?: boolean;
  insuranceReference?: string;
  registrationSource: string;
  status: string;
};

function nil(value: string | undefined) {
  return value?.trim() || null;
}

function patientNumber() {
  return `PAT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function legacyPayload(data: PatientInput): Prisma.InputJsonObject {
  return {
    patientName: data.fullName,
    sex: data.sex,
    birthDateOrAge: data.birthDate instanceof Date ? data.birthDate.toISOString().slice(0, 10) : null,
    contactPhone: data.phonePrimary,
    address: data.address,
    emergencyContact: data.emergencyContactName,
    emergencyPhone: data.emergencyContactPhone,
    email: nil(data.email),
    profession: nil(data.profession),
    maritalStatus: nil(data.maritalStatus),
  };
}

export function maskHealthPatientSensitive<T extends Record<string, unknown>>(patient: T, canViewSensitive: boolean) {
  if (canViewSensitive) return patient;
  return {
    ...patient,
    bloodGroup: null,
    knownAllergies: null,
    importantHistory: null,
    chronicTreatments: null,
    medicalNotes: null,
  };
}

export async function createHealthPatient(organizationId: string, actorUserId: string, data: PatientInput) {
  return prisma.$transaction(async (tx) => {
    const number = patientNumber();
    const legacy = await tx.enterpriseSectorRecord.create({
      data: {
        organizationId,
        sectorCode: "HEALTH_CARE",
        moduleCode: "PATIENTS",
        recordType: "PATIENT_PROFILE",
        title: data.fullName,
        summary: null,
        status: data.status,
        priority: "NORMAL",
        createdById: actorUserId,
        payloadJson: { ...legacyPayload(data), patientCode: number },
      },
    });
    const patient = await tx.healthPatient.create({
      data: {
        organizationId,
        legacyRecordId: legacy.id,
        patientNumber: number,
        fullName: data.fullName,
        sex: data.sex,
        birthDate: data.birthDate instanceof Date ? data.birthDate : null,
        phonePrimary: data.phonePrimary,
        phoneSecondary: nil(data.phoneSecondary),
        email: nil(data.email),
        address: data.address,
        city: nil(data.city),
        country: nil(data.country),
        emergencyContactName: data.emergencyContactName,
        emergencyContactRelationship: nil(data.emergencyContactRelationship),
        emergencyContactPhone: data.emergencyContactPhone,
        emergencyContactAddress: nil(data.emergencyContactAddress),
        profession: nil(data.profession),
        maritalStatus: nil(data.maritalStatus),
        bloodGroup: nil(data.bloodGroup),
        knownAllergies: nil(data.knownAllergies),
        importantHistory: nil(data.importantHistory),
        chronicTreatments: nil(data.chronicTreatments),
        medicalNotes: nil(data.medicalNotes),
        administrativeNotes: nil(data.administrativeNotes),
        insuranceKnown: data.insuranceKnown || false,
        insuranceReference: nil(data.insuranceReference),
        registrationSource: data.registrationSource,
        status: data.status,
        createdById: actorUserId,
      },
    });
    await tx.healthPatientEvent.create({
      data: { organizationId, patientId: patient.id, eventType: "CREATED", summary: "Patient enregistré.", toStatus: patient.status, actorUserId },
    });
    return patient;
  });
}

export async function updateHealthPatient(organizationId: string, patientId: string, actorUserId: string, data: Partial<PatientInput> & { actionReason?: string }) {
  const existing = await prisma.healthPatient.findFirst({ where: { id: patientId, organizationId } });
  if (!existing) return null;
  const { actionReason, ...patientData } = data;
  return prisma.$transaction(async (tx) => {
    const nextStatus = patientData.status || existing.status;
    const patient = await tx.healthPatient.update({
      where: { id: existing.id },
      data: {
        ...patientData,
        birthDate: patientData.birthDate === "" ? null : patientData.birthDate,
        phoneSecondary: patientData.phoneSecondary === "" ? null : patientData.phoneSecondary,
        email: patientData.email === "" ? null : patientData.email,
        city: patientData.city === "" ? null : patientData.city,
        country: patientData.country === "" ? null : patientData.country,
        emergencyContactRelationship: patientData.emergencyContactRelationship === "" ? null : patientData.emergencyContactRelationship,
        emergencyContactAddress: patientData.emergencyContactAddress === "" ? null : patientData.emergencyContactAddress,
        profession: patientData.profession === "" ? null : patientData.profession,
        maritalStatus: patientData.maritalStatus === "" ? null : patientData.maritalStatus,
        bloodGroup: patientData.bloodGroup === "" ? null : patientData.bloodGroup,
        knownAllergies: patientData.knownAllergies === "" ? null : patientData.knownAllergies,
        importantHistory: patientData.importantHistory === "" ? null : patientData.importantHistory,
        chronicTreatments: patientData.chronicTreatments === "" ? null : patientData.chronicTreatments,
        medicalNotes: patientData.medicalNotes === "" ? null : patientData.medicalNotes,
        administrativeNotes: patientData.administrativeNotes === "" ? null : patientData.administrativeNotes,
        insuranceReference: patientData.insuranceReference === "" ? null : patientData.insuranceReference,
        archivedAt: nextStatus === "ARCHIVED" ? existing.archivedAt || new Date() : nextStatus !== "ARCHIVED" ? null : undefined,
        deceasedAt: nextStatus === "DECEASED" ? existing.deceasedAt || new Date() : nextStatus !== "DECEASED" ? null : undefined,
        updatedById: actorUserId,
      },
    });
    if (existing.legacyRecordId) {
      const payload = legacyPayload({
        fullName: patient.fullName, sex: patient.sex, birthDate: patient.birthDate || "",
        phonePrimary: patient.phonePrimary, phoneSecondary: patient.phoneSecondary || undefined, email: patient.email || undefined,
        address: patient.address, city: patient.city || undefined, country: patient.country || undefined,
        emergencyContactName: patient.emergencyContactName, emergencyContactRelationship: patient.emergencyContactRelationship || undefined,
        emergencyContactPhone: patient.emergencyContactPhone, emergencyContactAddress: patient.emergencyContactAddress || undefined,
        profession: patient.profession || undefined, maritalStatus: patient.maritalStatus || undefined, bloodGroup: patient.bloodGroup || undefined,
        knownAllergies: patient.knownAllergies || undefined, importantHistory: patient.importantHistory || undefined,
        chronicTreatments: patient.chronicTreatments || undefined, medicalNotes: patient.medicalNotes || undefined,
        administrativeNotes: patient.administrativeNotes || undefined, insuranceKnown: patient.insuranceKnown,
        insuranceReference: patient.insuranceReference || undefined, registrationSource: patient.registrationSource, status: patient.status,
      });
      await tx.enterpriseSectorRecord.update({
        where: { id: existing.legacyRecordId },
        data: { title: patient.fullName, summary: null, status: patient.status, payloadJson: { ...payload, patientCode: patient.patientNumber }, updatedById: actorUserId, deletedAt: patient.status === "ARCHIVED" ? patient.archivedAt : null },
      });
    }
    await tx.healthPatientEvent.create({
      data: {
        organizationId, patientId: patient.id, eventType: existing.status === patient.status ? "UPDATED" : "STATUS_CHANGED",
        summary: actionReason || (existing.status === patient.status ? "Informations patient mises à jour." : `Statut modifié : ${existing.status} → ${patient.status}.`),
        fromStatus: existing.status, toStatus: patient.status, actorUserId,
      },
    });
    return patient;
  });
}
