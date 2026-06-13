import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthMedicalRecordAccess } from "@/lib/health-medical-record-access";
import { getHealthPharmacyAccess } from "@/lib/health-pharmacy-access";
import { healthMedicalRecordActionSchema, healthMedicalRecordUpdateSchema } from "@/lib/health-medical-record-validators";
import { transitionHealthMedicalRecord, updateHealthMedicalRecord } from "@/lib/health-medical-records";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; recordId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, recordId } = await params;
  const access = await getHealthMedicalRecordAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access.canViewSensitive) {
    const record = await prisma.healthMedicalRecord.findFirst({ where: { id: recordId, organizationId }, select: {
      id: true, recordNumber: true, patientId: true, status: true, confidentialityLevel: true, createdAt: true, updatedAt: true,
      patient: { select: { id: true, patientNumber: true, fullName: true, phonePrimary: true } },
      _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
    } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ record: { ...record, activeAlertCount: record._count.alerts }, consultations: [], permissions: { canUpdate: false, canArchive: false, canManageStructuredItems: false, canManageConfidentialNotes: false } });
  }
  const record = await prisma.healthMedicalRecord.findFirst({ where: { id: recordId, organizationId }, include: {
    patient: { select: { id: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true, bloodGroup: true } },
    historyItems: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    allergies: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    currentTreatments: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    alerts: { orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { createdBy: { select: { name: true } }, resolvedBy: { select: { name: true } } } },
    confidentialNotes: access.canManageConfidentialNotes ? { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } } : false,
    events: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } },
  } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pharmacyAccess = await getHealthPharmacyAccess({ session, organizationId, action: "read" });
  const [consultations,labRequests,pharmacyDispensations] = await Promise.all([
    prisma.healthConsultation.findMany({ where: { organizationId, patientId: record.patientId }, orderBy: { consultationDate: "desc" }, take: 30, select: { id: true, consultationNumber: true, consultationDate: true, consultationType: true, status: true, priority: true, chiefComplaint: true, finalDiagnosis: true, professional: { select: { name: true } } } }),
    prisma.healthLabRequest.findMany({where:{organizationId,patientId:record.patientId},orderBy:{requestedAt:"desc"},take:30,select:{id:true,labRequestNumber:true,testLabel:true,status:true,priority:true,requestedAt:true,abnormalityLevel:true,resultText:true,validatedAt:true}}),
    pharmacyAccess ? prisma.healthPharmacyDispensation.findMany({ where: { organizationId, patientId: record.patientId, ...(pharmacyAccess.canViewSensitive ? {} : { product: { isSensitive: false } }) }, orderBy: { dispensedAt: "desc" }, take: 30, select: { id: true, quantity: true, dispensedAt: true, billingStatus: true, product: { select: { name: true, productCode: true, unit: true } }, consultation: { select: { consultationNumber: true } }, dispensedBy: { select: { name: true } } } }) : Promise.resolve([]),
  ]);
  return NextResponse.json({ record, consultations, labRequests, pharmacyDispensations: pharmacyDispensations.map((item) => ({ ...item, quantity: Number(item.quantity) })), permissions: { canUpdate: access.canUpdate, canArchive: access.canArchive, canManageStructuredItems: access.canManageStructuredItems, canManageConfidentialNotes: access.canManageConfidentialNotes } });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-medical-record-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, recordId } = await params;
  const access = await getHealthMedicalRecordAccess({ session, organizationId, action: "write" });
  if (!access?.canUpdate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = await req.json().catch(() => null);
  const actionParsed = healthMedicalRecordActionSchema.safeParse(payload);
  try {
    const record = actionParsed.success
      ? await transitionHealthMedicalRecord(organizationId, recordId, session.userId, actionParsed.data.action, actionParsed.data.reason)
      : await updateHealthMedicalRecord(organizationId, recordId, session.userId, healthMedicalRecordUpdateSchema.parse(payload));
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeAuditLog({ userId: session.userId, action: actionParsed.success ? `HEALTH_MEDICAL_RECORD_${actionParsed.data.action.toUpperCase()}` : "HEALTH_MEDICAL_RECORD_UPDATED", entity: "HealthMedicalRecord", entityId: recordId, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UPDATE_FAILED";
    const message = code === "REASON_REQUIRED" ? "Un motif est obligatoire." : code === "RECORD_LOCKED" ? "Réactivez le dossier avant de le modifier." : "Modification du dossier médical impossible.";
    return NextResponse.json({ error: code, message }, { status: 409 });
  }
}
