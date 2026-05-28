import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule, canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { enterpriseHealthcareRecordSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";

type HealthcareRecordInput = z.infer<typeof enterpriseHealthcareRecordSchema>;

function compactHealthcarePayload(data: HealthcareRecordInput): Prisma.InputJsonValue {
  return {
    patientCode: data.patientCode || null,
    patientName: data.patientName || null,
    contactPhone: data.contactPhone || null,
    appointmentDate: data.appointmentDate || null,
    appointmentType: data.appointmentType || null,
    careTeam: data.careTeam || null,
    incidentType: data.incidentType || null,
    severity: data.severity,
    confidentialityLevel: data.confidentialityLevel,
    insuranceProvider: data.insuranceProvider || null,
    notes: data.notes || null,
  };
}

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
    take: 120,
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
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, data.moduleCode, "write"))) {
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
    await prisma.notification.create({
      data: {
        userId: record.assignedToUserId,
        title: "Nouvel élément santé",
        body: record.title,
        type: "ENTERPRISE_HEALTHCARE",
        targetUrl: "/enterprise-admin",
      },
    });
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
