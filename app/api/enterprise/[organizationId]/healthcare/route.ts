import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule, canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseHealthcareRecordSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

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

type HealthcareRecordInput = z.infer<typeof enterpriseHealthcareRecordSchema>;

function compactHealthcarePayload(data: HealthcareRecordInput): Prisma.InputJsonValue {
  return {
    sex: data.sex || null,
    birthDateOrAge: data.birthDateOrAge || null,
    address: data.address || null,
    emergencyContact: data.emergencyContact || null,
    emergencyPhone: data.emergencyPhone || null,
    email: data.email || null,
    profession: data.profession || null,
    maritalStatus: data.maritalStatus || null,
    bloodGroup: data.bloodGroup || null,
    allergies: data.allergies || null,
    medicalHistory: data.medicalHistory || null,
    patientRecordId: data.patientRecordId || null,
    appointmentRecordId: data.appointmentRecordId || null,
    consultationRecordId: data.consultationRecordId || null,
    departmentId: data.departmentId || null,
    positionId: data.positionId || null,
    patientCode: data.patientCode || null,
    patientName: data.patientName || null,
    contactPhone: data.contactPhone || null,
    linkedRecordId: data.linkedRecordId || null,
    healthProfessional: data.healthProfessional || null,
    appointmentDate: data.appointmentDate || null,
    appointmentType: data.appointmentType || null,
    careTeam: data.careTeam || null,
    vitalSigns: data.vitalSigns || null,
    symptoms: data.symptoms || null,
    clinicalExam: data.clinicalExam || null,
    provisionalDiagnosis: data.provisionalDiagnosis || null,
    finalDiagnosis: data.finalDiagnosis || null,
    treatmentPlan: data.treatmentPlan || null,
    prescription: data.prescription || null,
    requestedExams: data.requestedExams || null,
    recommendations: data.recommendations || null,
    incidentType: data.incidentType || null,
    severity: data.severity,
    service: data.service || null,
    amountRequested: data.amountRequested || null,
    amountApproved: data.amountApproved || null,
    invoiceLines: data.invoiceLines || null,
    totalAmount: data.totalAmount || null,
    paymentMethod: data.paymentMethod || null,
    stockQuantity: data.stockQuantity || null,
    stockThreshold: data.stockThreshold || null,
    expiryDate: data.expiryDate || null,
    documentType: data.documentType || null,
    fileReference: data.fileReference || null,
    settingKey: data.settingKey || null,
    settingValue: data.settingValue || null,
    confidentialityLevel: data.confidentialityLevel,
    insuranceProvider: data.insuranceProvider || null,
    notes: data.notes || null,
  };
}

function isConsistentHealthcareRecord(moduleCode: string, recordType: string) {
  return HEALTHCARE_RECORD_TYPES[moduleCode] === recordType;
}

function permissionModuleCode(moduleCode: string) {
  return moduleCode;
}

async function assertHealthcareOrganization(organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      id: organizationId,
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      sectorCode: HEALTHCARE_SECTOR_CODE,
    },
    select: { id: true, name: true },
  });
}

async function validateHealthcareReferences(organizationId: string, data: Partial<HealthcareRecordInput>) {
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

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const organization = await assertHealthcareOrganization(organizationId);
  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Cette entreprise n'utilise pas le modèle santé actif." }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const moduleCode = searchParams.get("moduleCode") || undefined;
  const status = searchParams.get("status") || undefined;
  const q = (searchParams.get("q") || "").trim();

  const records = await prisma.enterpriseSectorRecord.findMany({
    where: {
      organizationId,
      sectorCode: HEALTHCARE_SECTOR_CODE,
      deletedAt: null,
      ...(moduleCode ? { moduleCode } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ organization, records });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_healthcare_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-healthcare:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions santé sur une courte période." }, { status: 429 });
  }

  const { organizationId } = await params;
  const organization = await assertHealthcareOrganization(organizationId);
  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Cette entreprise n'utilise pas le modèle santé actif." }, { status: 404 });
  }

  const parsed = enterpriseHealthcareRecordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isConsistentHealthcareRecord(parsed.success ? parsed.data.moduleCode : "", parsed.success ? parsed.data.recordType : "")) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations du sous-module santé sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  if (data.moduleCode === "PATIENTS" || data.moduleCode === "APPOINTMENTS" || data.moduleCode === "CONSULTATIONS" || data.moduleCode === "MEDICAL_RECORDS" || data.moduleCode === "CARE_TEAM") {
    return NextResponse.json({ error: "Dedicated module", message: "Utilisez le formulaire dédié de ce sous-module Santé." }, { status: 409 });
  }
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, permissionModuleCode(data.moduleCode), "write"))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à gérer ce sous-module santé." }, { status: 403 });
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

  const record = await prisma.enterpriseSectorRecord.create({
    data: {
      organizationId,
      sectorCode: HEALTHCARE_SECTOR_CODE,
      moduleCode: data.moduleCode,
      recordType: data.recordType,
      title: data.title,
      summary: data.summary || null,
      status: data.status,
      priority: data.priority,
      assignedToUserId: data.assignedToUserId || null,
      createdById: session.userId,
      payloadJson: compactHealthcarePayload(data),
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  if (record.assignedToUserId && record.assignedToUserId !== session.userId) {
    await prisma.notification
      .create({
        data: {
          userId: record.assignedToUserId,
          organizationId,
          title: "Nouvel élément santé",
          body: record.title,
          type: "ENTERPRISE_HEALTHCARE",
          targetUrl: "/enterprise-admin",
        },
      })
      .catch(() => null);
  }
  if (record.moduleCode === "QUALITY_INCIDENTS" && (record.priority === "CRITICAL" || data.severity === "CRITICAL")) {
    const managers = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        removedAt: null,
        role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] },
        userId: { not: session.userId },
      },
      select: { userId: true },
      take: 30,
    });
    if (managers.length) {
      await prisma.notification
        .createMany({
          data: managers.map((member) => ({
            userId: member.userId,
            organizationId,
            title: "Incident santé critique",
            body: record.title,
            type: "ENTERPRISE_HEALTHCARE_CRITICAL",
            targetUrl: "/enterprise-admin",
          })),
          skipDuplicates: true,
        })
        .catch(() => null);
    }
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_HEALTHCARE_RECORD_CREATED",
    entity: "EnterpriseSectorRecord",
    entityId: record.id,
    request: req,
    metadata: { organizationId, moduleCode: data.moduleCode, recordType: data.recordType },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, record }, { status: 201 });
}
