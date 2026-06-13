import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseHealthcareRecordUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; recordId: string }> };
type HealthcareRecordUpdateInput = z.infer<typeof enterpriseHealthcareRecordUpdateSchema>;

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";
const HEALTHCARE_RECORD_TYPES: Record<string, string> = {
  PATIENTS: "PATIENT_PROFILE",
  APPOINTMENTS: "APPOINTMENT",
  CONSULTATIONS: "CONSULTATION",
  MEDICAL_RECORDS: "MEDICAL_RECORD",
  CARE_TEAM: "CARE_TEAM_MEMBER",
  LABORATORY: "LAB_REQUEST",
  INTERNAL_PHARMACY: "PHARMACY_ITEM",
  MEDICAL_BILLING: "MEDICAL_INVOICE",
  INSURANCE_COVERAGE: "INSURANCE_COVERAGE",
  QUALITY_INCIDENTS: "QUALITY_INCIDENT",
  MEDICAL_CONFIDENTIALITY: "CONFIDENTIALITY_RULE",
  MEDICAL_DOCUMENTS: "MEDICAL_DOCUMENT",
  HEALTH_SETTINGS: "HEALTH_SETTING",
  HEALTH_REPORTS: "HEALTH_REPORT",
};

const ACTION_STATUS: Record<string, string> = {
  confirm: "CONFIRMED",
  cancel: "CANCELLED",
  mark_absent: "NO_SHOW",
  convert_consultation: "CONVERTED",
  close: "CLOSED",
  reopen: "IN_PROGRESS",
  submit: "SUBMITTED",
  approve: "APPROVED",
  reject: "REJECTED",
  validate: "VALIDATED",
  stock_in: "STOCK_IN",
  stock_out: "STOCK_OUT",
  adjust: "ADJUSTED",
  resolve: "RESOLVED",
};

function isConsistentHealthcareRecord(moduleCode: string, recordType: string) {
  return HEALTHCARE_RECORD_TYPES[moduleCode] === recordType;
}

function permissionModuleCode(moduleCode: string) {
  return moduleCode;
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Prisma.InputJsonObject;
  }
  return {};
}

async function validateHealthcareReferences(organizationId: string, data: HealthcareRecordUpdateInput) {
  const checks = [
    data.patientRecordId ? { id: data.patientRecordId, moduleCode: "PATIENTS", message: "Le patient sélectionné n'appartient pas à cette entreprise." } : null,
    data.appointmentRecordId ? { id: data.appointmentRecordId, moduleCode: "APPOINTMENTS", message: "Le rendez-vous sélectionné n'appartient pas à cette entreprise." } : null,
    data.consultationRecordId ? { id: data.consultationRecordId, moduleCode: "CONSULTATIONS", message: "La consultation sélectionnée n'appartient pas à cette entreprise." } : null,
  ].filter((entry): entry is { id: string; moduleCode: string; message: string } => Boolean(entry));
  for (const check of checks) {
    const linkedRecord = await prisma.enterpriseSectorRecord.findFirst({
      where: { id: check.id, organizationId, sectorCode: HEALTHCARE_SECTOR_CODE, moduleCode: check.moduleCode, deletedAt: null },
      select: { id: true },
    });
    if (!linkedRecord) {
      return check.message;
    }
  }
  if (data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) {
      return "Le département sélectionné n'appartient pas à cette entreprise.";
    }
  }
  if (data.positionId) {
    const position = await prisma.enterprisePosition.findFirst({ where: { id: data.positionId, organizationId, isActive: true }, select: { id: true } });
    if (!position) {
      return "Le poste sélectionné n'appartient pas à cette entreprise.";
    }
  }
  return null;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_healthcare_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-healthcare-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications santé sur une courte période." }, { status: 429 });
  }

  const { organizationId, recordId } = await params;
  const existingRecord = await prisma.enterpriseSectorRecord.findFirst({
    where: {
      id: recordId,
      organizationId,
      sectorCode: HEALTHCARE_SECTOR_CODE,
      deletedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: HEALTHCARE_SECTOR_CODE },
    },
  });
  if (!existingRecord) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existingRecord.moduleCode === "PATIENTS" || existingRecord.moduleCode === "APPOINTMENTS" || existingRecord.moduleCode === "CONSULTATIONS" || existingRecord.moduleCode === "MEDICAL_RECORDS" || existingRecord.moduleCode === "CARE_TEAM" || existingRecord.moduleCode === "LABORATORY" || existingRecord.moduleCode === "INTERNAL_PHARMACY") {
    return NextResponse.json({ error: "Dedicated module", message: "Utilisez le module Santé dédié correspondant." }, { status: 409 });
  }

  const parsed = enterpriseHealthcareRecordUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les modifications santé sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  if ((existingRecord.status === "CLOSED" || existingRecord.status === "PAID" || existingRecord.status === "VALIDATED") && data.action !== "reopen") {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Locked record", message: "Cet élément santé est verrouillé. Une réouverture autorisée est nécessaire avant modification." }, { status: 409 });
  }
  const nextModuleCode = data.moduleCode || existingRecord.moduleCode;
  const nextRecordType = data.recordType || existingRecord.recordType;
  if (!isConsistentHealthcareRecord(nextModuleCode, nextRecordType)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Le type choisi ne correspond pas au sous-module santé." }, { status: 400 });
  }

  if (!(await canAccessEnterpriseModule(session.userId, organizationId, permissionModuleCode(nextModuleCode), "write"))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à modifier ce sous-module santé." }, { status: 403 });
  }

  if (data.assignedToUserId) {
    const assignedMember = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: data.assignedToUserId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!assignedMember) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid assignee", message: "Le responsable sélectionné n'appartient pas à cette entreprise." }, { status: 400 });
    }
  }
  const referenceError = await validateHealthcareReferences(organizationId, data);
  if (referenceError) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  }

  const previousPayload = jsonObject(existingRecord.payloadJson);
  const nextPayload: Prisma.InputJsonObject = {
    ...previousPayload,
    ...(data.sex !== undefined ? { sex: data.sex || null } : {}),
    ...(data.birthDateOrAge !== undefined ? { birthDateOrAge: data.birthDateOrAge || null } : {}),
    ...(data.address !== undefined ? { address: data.address || null } : {}),
    ...(data.emergencyContact !== undefined ? { emergencyContact: data.emergencyContact || null } : {}),
    ...(data.emergencyPhone !== undefined ? { emergencyPhone: data.emergencyPhone || null } : {}),
    ...(data.email !== undefined ? { email: data.email || null } : {}),
    ...(data.profession !== undefined ? { profession: data.profession || null } : {}),
    ...(data.maritalStatus !== undefined ? { maritalStatus: data.maritalStatus || null } : {}),
    ...(data.bloodGroup !== undefined ? { bloodGroup: data.bloodGroup || null } : {}),
    ...(data.allergies !== undefined ? { allergies: data.allergies || null } : {}),
    ...(data.medicalHistory !== undefined ? { medicalHistory: data.medicalHistory || null } : {}),
    ...(data.patientRecordId !== undefined ? { patientRecordId: data.patientRecordId || null } : {}),
    ...(data.appointmentRecordId !== undefined ? { appointmentRecordId: data.appointmentRecordId || null } : {}),
    ...(data.consultationRecordId !== undefined ? { consultationRecordId: data.consultationRecordId || null } : {}),
    ...(data.departmentId !== undefined ? { departmentId: data.departmentId || null } : {}),
    ...(data.positionId !== undefined ? { positionId: data.positionId || null } : {}),
    ...(data.patientCode !== undefined ? { patientCode: data.patientCode || null } : {}),
    ...(data.patientName !== undefined ? { patientName: data.patientName || null } : {}),
    ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone || null } : {}),
    ...(data.linkedRecordId !== undefined ? { linkedRecordId: data.linkedRecordId || null } : {}),
    ...(data.healthProfessional !== undefined ? { healthProfessional: data.healthProfessional || null } : {}),
    ...(data.appointmentDate !== undefined ? { appointmentDate: data.appointmentDate || null } : {}),
    ...(data.appointmentType !== undefined ? { appointmentType: data.appointmentType || null } : {}),
    ...(data.careTeam !== undefined ? { careTeam: data.careTeam || null } : {}),
    ...(data.vitalSigns !== undefined ? { vitalSigns: data.vitalSigns || null } : {}),
    ...(data.symptoms !== undefined ? { symptoms: data.symptoms || null } : {}),
    ...(data.clinicalExam !== undefined ? { clinicalExam: data.clinicalExam || null } : {}),
    ...(data.provisionalDiagnosis !== undefined ? { provisionalDiagnosis: data.provisionalDiagnosis || null } : {}),
    ...(data.finalDiagnosis !== undefined ? { finalDiagnosis: data.finalDiagnosis || null } : {}),
    ...(data.treatmentPlan !== undefined ? { treatmentPlan: data.treatmentPlan || null } : {}),
    ...(data.prescription !== undefined ? { prescription: data.prescription || null } : {}),
    ...(data.requestedExams !== undefined ? { requestedExams: data.requestedExams || null } : {}),
    ...(data.recommendations !== undefined ? { recommendations: data.recommendations || null } : {}),
    ...(data.incidentType !== undefined ? { incidentType: data.incidentType || null } : {}),
    ...(data.severity !== undefined ? { severity: data.severity } : {}),
    ...(data.service !== undefined ? { service: data.service || null } : {}),
    ...(data.amountRequested !== undefined ? { amountRequested: data.amountRequested || null } : {}),
    ...(data.amountApproved !== undefined ? { amountApproved: data.amountApproved || null } : {}),
    ...(data.invoiceLines !== undefined ? { invoiceLines: data.invoiceLines || null } : {}),
    ...(data.totalAmount !== undefined ? { totalAmount: data.totalAmount || null } : {}),
    ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod || null } : {}),
    ...(data.stockQuantity !== undefined ? { stockQuantity: data.stockQuantity || null } : {}),
    ...(data.stockThreshold !== undefined ? { stockThreshold: data.stockThreshold || null } : {}),
    ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate || null } : {}),
    ...(data.documentType !== undefined ? { documentType: data.documentType || null } : {}),
    ...(data.fileReference !== undefined ? { fileReference: data.fileReference || null } : {}),
    ...(data.settingKey !== undefined ? { settingKey: data.settingKey || null } : {}),
    ...(data.settingValue !== undefined ? { settingValue: data.settingValue || null } : {}),
    ...(data.confidentialityLevel !== undefined ? { confidentialityLevel: data.confidentialityLevel } : {}),
    ...(data.insuranceProvider !== undefined ? { insuranceProvider: data.insuranceProvider || null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    ...(data.action ? { lastAction: data.action, lastActionReason: data.actionReason || null, lastActionAt: new Date().toISOString() } : {}),
  };
  const nextStatus = data.action ? ACTION_STATUS[data.action] || existingRecord.status : data.status ?? existingRecord.status;

  const record = await prisma.enterpriseSectorRecord.update({
    where: { id: existingRecord.id },
    data: {
      moduleCode: nextModuleCode,
      recordType: nextRecordType,
      title: data.title ?? existingRecord.title,
      summary: data.summary !== undefined ? data.summary || null : existingRecord.summary,
      status: nextStatus,
      priority: data.priority ?? existingRecord.priority,
      assignedToUserId: data.assignedToUserId !== undefined ? data.assignedToUserId || null : existingRecord.assignedToUserId,
      updatedById: session.userId,
      payloadJson: nextPayload,
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  if (data.action === "convert_consultation" && existingRecord.moduleCode === "APPOINTMENTS") {
    await prisma.enterpriseSectorRecord.create({
      data: {
        organizationId,
        sectorCode: HEALTHCARE_SECTOR_CODE,
        moduleCode: "CONSULTATIONS",
        recordType: "CONSULTATION",
        title: `Consultation - ${record.title}`,
        summary: record.summary,
        status: "IN_PROGRESS",
        priority: record.priority,
        assignedToUserId: record.assignedToUserId,
        createdById: session.userId,
        payloadJson: {
          ...nextPayload,
          linkedRecordId: existingRecord.id,
          appointmentRecordId: existingRecord.id,
          patientRecordId: nextPayload.patientRecordId ?? null,
          convertedFromAppointmentId: existingRecord.id,
        },
      },
    });
  }

  if (record.assignedToUserId && record.assignedToUserId !== session.userId) {
    await prisma.notification
      .create({
        data: {
          userId: record.assignedToUserId,
          organizationId,
          title: "Élément santé mis à jour",
          body: record.title,
          type: "ENTERPRISE_HEALTHCARE",
          targetUrl: "/enterprise-admin",
        },
      })
      .catch(() => null);
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_HEALTHCARE_RECORD_UPDATED",
    entity: "EnterpriseSectorRecord",
    entityId: record.id,
    request: req,
    metadata: { organizationId, moduleCode: nextModuleCode, recordType: nextRecordType },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, record });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_healthcare_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-healthcare-delete:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de suppressions santé sur une courte période." }, { status: 429 });
  }

  const { organizationId, recordId } = await params;
  const existingRecord = await prisma.enterpriseSectorRecord.findFirst({
    where: {
      id: recordId,
      organizationId,
      sectorCode: HEALTHCARE_SECTOR_CODE,
      deletedAt: null,
      organization: { status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: HEALTHCARE_SECTOR_CODE },
    },
  });
  if (!existingRecord) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existingRecord.moduleCode === "PATIENTS" || existingRecord.moduleCode === "APPOINTMENTS" || existingRecord.moduleCode === "CONSULTATIONS" || existingRecord.moduleCode === "MEDICAL_RECORDS" || existingRecord.moduleCode === "CARE_TEAM" || existingRecord.moduleCode === "LABORATORY" || existingRecord.moduleCode === "INTERNAL_PHARMACY") {
    return NextResponse.json({ error: "Dedicated module", message: "Utilisez le module Santé dédié correspondant." }, { status: 409 });
  }

  if (!(await canAccessEnterpriseModule(session.userId, organizationId, permissionModuleCode(existingRecord.moduleCode), "manage"))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à archiver cet élément santé." }, { status: 403 });
  }

  const record = await prisma.enterpriseSectorRecord.update({
    where: { id: existingRecord.id },
    data: {
      status: "ARCHIVED",
      deletedAt: new Date(),
      updatedById: session.userId,
    },
    select: { id: true },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_HEALTHCARE_RECORD_ARCHIVED",
    entity: "EnterpriseSectorRecord",
    entityId: record.id,
    request: req,
    metadata: { organizationId, moduleCode: existingRecord.moduleCode, recordType: existingRecord.recordType },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
