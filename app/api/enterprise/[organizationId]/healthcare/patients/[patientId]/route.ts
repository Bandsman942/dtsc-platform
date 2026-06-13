import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthPatientAccess } from "@/lib/health-patient-access";
import { getHealthPharmacyAccess } from "@/lib/health-pharmacy-access";
import { healthPatientUpdateSchema } from "@/lib/health-patient-validators";
import { maskHealthPatientSensitive, updateHealthPatient } from "@/lib/health-patients";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; patientId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, patientId } = await params;
  const access = await getHealthPatientAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const patient = await prisma.healthPatient.findFirst({
    where: { id: patientId, organizationId },
    include: {
      createdBy: { select: { name: true } }, updatedBy: { select: { name: true } },
      events: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } },
    },
  });
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pharmacyAccess = await getHealthPharmacyAccess({ session, organizationId, action: "read" });
  const [related, dispensations] = await Promise.all([patient.legacyRecordId ? prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: "HEALTH_CARE", moduleCode: { in: ["APPOINTMENTS", "CONSULTATIONS", "LABORATORY", "MEDICAL_BILLING", "MEDICAL_DOCUMENTS", "INSURANCE_COVERAGE", "QUALITY_INCIDENTS", "MEDICAL_RECORDS"] }, deletedAt: null, payloadJson: { path: ["patientRecordId"], equals: patient.legacyRecordId } },
    orderBy: { updatedAt: "desc" }, take: 60,
    select: { id: true, moduleCode: true, title: true, summary: true, status: true, updatedAt: true },
  }) : Promise.resolve([]), pharmacyAccess ? prisma.healthPharmacyDispensation.findMany({ where: { organizationId, patientId, ...(pharmacyAccess.canViewSensitive ? {} : { product: { isSensitive: false } }) }, orderBy: { dispensedAt: "desc" }, take: 20, select: { id: true, quantity: true, dispensedAt: true, billingStatus: true, product: { select: { name: true, productCode: true, unit: true } }, consultation: { select: { consultationNumber: true } }, dispensedBy: { select: { name: true } } } }) : Promise.resolve([])]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "PATIENTS" } });
  return NextResponse.json({ patient: maskHealthPatientSensitive(patient, access.canViewSensitive), related: related.map((item) => access.canViewSensitive ? item : { ...item, summary: null }), dispensations: dispensations.map((item) => ({ ...item, quantity: Number(item.quantity) })), permissions: { canUpdate: access.canUpdate, canArchive: access.canArchive, canViewSensitive: access.canViewSensitive } });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-patient-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, patientId } = await params;
  const access = await getHealthPatientAccess({ session, organizationId, action: "write" });
  if (!access?.canUpdate) return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à modifier ce patient." }, { status: 403 });
  const existing = await prisma.healthPatient.findFirst({ where: { id: patientId, organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = healthPatientUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les modifications du patient sont invalides." }, { status: 400 });
  const data = parsed.data;
  if (existing.status === "ARCHIVED" && data.status !== "ACTIVE") return NextResponse.json({ error: "Archived patient", message: "Réactivez d’abord le patient archivé avant de modifier ses informations." }, { status: 409 });
  if ((data.status === "DECEASED" || data.status === "ARCHIVED") && !data.actionReason) return NextResponse.json({ error: "Reason required", message: "Un motif est obligatoire pour ce changement de statut." }, { status: 400 });
  const patient = await updateHealthPatient(organizationId, patientId, session.userId, data);
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAuditLog({ userId: session.userId, action: "HEALTH_PATIENT_UPDATED", entity: "HealthPatient", entityId: patient.id, request: req, metadata: { organizationId, fromStatus: existing.status, toStatus: patient.status } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "PATIENTS" } });
  return NextResponse.json({ ok: true, patient: maskHealthPatientSensitive(patient, access.canViewSensitive) });
}
