import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { enterpriseHealthcareRecordUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; recordId: string }> };

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

function isConsistentHealthcareRecord(moduleCode: string, recordType: string) {
  if (moduleCode === "PATIENTS") {
    return recordType === "PATIENT_PROFILE";
  }
  if (moduleCode === "APPOINTMENTS") {
    return recordType === "APPOINTMENT";
  }
  if (moduleCode === "QUALITY_INCIDENTS") {
    return recordType === "QUALITY_INCIDENT";
  }
  return false;
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Prisma.InputJsonObject;
  }
  return {};
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
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

  const parsed = enterpriseHealthcareRecordUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les modifications santé sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  const nextModuleCode = data.moduleCode || existingRecord.moduleCode;
  const nextRecordType = data.recordType || existingRecord.recordType;
  if (!isConsistentHealthcareRecord(nextModuleCode, nextRecordType)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Le type choisi ne correspond pas au sous-module santé." }, { status: 400 });
  }

  if (!(await canAccessEnterpriseModule(session.userId, organizationId, nextModuleCode, "write"))) {
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

  const previousPayload = jsonObject(existingRecord.payloadJson);
  const nextPayload: Prisma.InputJsonObject = {
    ...previousPayload,
    ...(data.patientCode !== undefined ? { patientCode: data.patientCode || null } : {}),
    ...(data.patientName !== undefined ? { patientName: data.patientName || null } : {}),
    ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone || null } : {}),
    ...(data.appointmentDate !== undefined ? { appointmentDate: data.appointmentDate || null } : {}),
    ...(data.appointmentType !== undefined ? { appointmentType: data.appointmentType || null } : {}),
    ...(data.careTeam !== undefined ? { careTeam: data.careTeam || null } : {}),
    ...(data.incidentType !== undefined ? { incidentType: data.incidentType || null } : {}),
    ...(data.severity !== undefined ? { severity: data.severity } : {}),
    ...(data.confidentialityLevel !== undefined ? { confidentialityLevel: data.confidentialityLevel } : {}),
    ...(data.insuranceProvider !== undefined ? { insuranceProvider: data.insuranceProvider || null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
  };

  const record = await prisma.enterpriseSectorRecord.update({
    where: { id: existingRecord.id },
    data: {
      moduleCode: nextModuleCode,
      recordType: nextRecordType,
      title: data.title ?? existingRecord.title,
      summary: data.summary !== undefined ? data.summary || null : existingRecord.summary,
      status: data.status ?? existingRecord.status,
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

  if (record.assignedToUserId && record.assignedToUserId !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: record.assignedToUserId,
        title: "Élément santé mis à jour",
        body: record.title,
        type: "ENTERPRISE_HEALTHCARE",
        targetUrl: "/enterprise-admin",
      },
    });
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

  if (!(await canAccessEnterpriseModule(session.userId, organizationId, existingRecord.moduleCode, "manage"))) {
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
