import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthPatientAccess } from "@/lib/health-patient-access";
import { healthPatientCreateSchema } from "@/lib/health-patient-validators";
import { createHealthPatient, maskHealthPatientSensitive } from "@/lib/health-patients";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthPatientAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const sex = url.searchParams.get("sex") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const createdFrom = url.searchParams.get("createdFrom");
  const createdTo = url.searchParams.get("createdTo");
  const patients = await prisma.healthPatient.findMany({
    where: {
      organizationId,
      ...(sex ? { sex } : {}),
      ...(status ? { status } : {}),
      ...(createdFrom || createdTo ? { createdAt: { ...(createdFrom ? { gte: new Date(createdFrom) } : {}), ...(createdTo ? { lte: new Date(`${createdTo}T23:59:59.999Z`) } : {}) } } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phonePrimary: { contains: q, mode: "insensitive" } }, { patientNumber: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
  });
  const legacyIds = patients.flatMap((patient) => patient.legacyRecordId ? [patient.legacyRecordId] : []);
  const consultations = legacyIds.length ? await prisma.enterpriseSectorRecord.findMany({
    where: { organizationId, sectorCode: "HEALTH_CARE", moduleCode: "CONSULTATIONS", deletedAt: null, OR: legacyIds.map((legacyId) => ({ payloadJson: { path: ["patientRecordId"], equals: legacyId } })) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true, updatedAt: true, payloadJson: true },
  }).catch(() => []) : [];
  const lastConsultationByPatient = new Map<string, { id: string; title: string; status: string; updatedAt: Date }>();
  for (const consultation of consultations) {
    const payload = consultation.payloadJson && typeof consultation.payloadJson === "object" && !Array.isArray(consultation.payloadJson) ? consultation.payloadJson : {};
    const patientRecordId = typeof payload.patientRecordId === "string" ? payload.patientRecordId : null;
    if (patientRecordId && !lastConsultationByPatient.has(patientRecordId)) lastConsultationByPatient.set(patientRecordId, consultation);
  }
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "PATIENTS" } });
  return NextResponse.json({
    permissions: { canCreate: access.canCreate, canUpdate: access.canUpdate, canArchive: access.canArchive, canViewSensitive: access.canViewSensitive },
    patients: patients.map((patient) => maskHealthPatientSensitive({ ...patient, lastConsultation: patient.legacyRecordId ? lastConsultationByPatient.get(patient.legacyRecordId) || null : null }, access.canViewSensitive)),
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-patients:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d’enregistrements patients sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const access = await getHealthPatientAccess({ session, organizationId, action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = healthPatientCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez les informations obligatoires du patient." }, { status: 400 });
  const data = parsed.data;
  if (data.status === "ARCHIVED" || data.status === "DECEASED") {
    return NextResponse.json({ error: "Invalid initial status", message: "Un nouveau patient doit être enregistré actif ou inactif." }, { status: 400 });
  }
  const duplicate = await prisma.healthPatient.findFirst({ where: { organizationId, fullName: { equals: data.fullName, mode: "insensitive" }, phonePrimary: data.phonePrimary, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (duplicate) return NextResponse.json({ error: "Duplicate patient", message: "Un patient actif avec ce nom et ce téléphone existe déjà." }, { status: 409 });
  const patient = await createHealthPatient(organizationId, session.userId, access.canViewSensitive ? data : { ...data, bloodGroup: "", knownAllergies: "", importantHistory: "", chronicTreatments: "", medicalNotes: "" });
  await writeAuditLog({ userId: session.userId, action: "HEALTH_PATIENT_CREATED", entity: "HealthPatient", entityId: patient.id, request: req, metadata: { organizationId, patientNumber: patient.patientNumber } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "PATIENTS" } });
  return NextResponse.json({ ok: true, patient: maskHealthPatientSensitive(patient, access.canViewSensitive) }, { status: 201 });
}
