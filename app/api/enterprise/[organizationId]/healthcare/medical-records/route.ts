import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthMedicalRecordAccess } from "@/lib/health-medical-record-access";
import { healthMedicalRecordCreateSchema } from "@/lib/health-medical-record-validators";
import { createHealthMedicalRecord, medicalRecordAdministrativeView, validateHealthMedicalRecordPatient } from "@/lib/health-medical-records";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthMedicalRecordAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [records, patients] = await Promise.all([
    prisma.healthMedicalRecord.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, include: {
      patient: { select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true } },
      _count: { select: { alerts: { where: { status: "ACTIVE" } }, allergies: { where: { status: "ACTIVE" } }, currentTreatments: { where: { status: "ACTIVE" } } } },
    } }),
    prisma.healthPatient.findMany({ where: { organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, orderBy: { fullName: "asc" }, select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true } }),
  ]);
  const items = records.map((record) => {
    const enriched = { ...record, activeAlertCount: record._count.alerts };
    return access.canViewSensitive ? enriched : medicalRecordAdministrativeView(enriched);
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "MEDICAL_RECORDS" } });
  return NextResponse.json({ records: items, patients, permissions: { canCreate: access.canCreate, canUpdate: access.canUpdate, canArchive: access.canArchive, canManageStructuredItems: access.canManageStructuredItems, canViewSensitive: access.canViewSensitive, canManageConfidentialNotes: access.canManageConfidentialNotes } });
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-medical-records:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getHealthMedicalRecordAccess({ session, organizationId, action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de créer un dossier médical." }, { status: 403 });
  const parsed = healthMedicalRecordCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez le patient et la synthèse du dossier médical." }, { status: 400 });
  if (!(await validateHealthMedicalRecordPatient(organizationId, parsed.data.patientId))) return NextResponse.json({ error: "Invalid patient", message: "Le patient sélectionné n’appartient pas à cette entreprise." }, { status: 400 });
  try {
    const record = await createHealthMedicalRecord(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_MEDICAL_RECORD_CREATED", entity: "HealthMedicalRecord", entityId: record.id, request: req, metadata: { organizationId } });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Create failed", message: "Ce patient possède déjà un dossier médical principal ou ne peut pas être relié." }, { status: 409 });
  }
}
