import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthConsultationAccess } from "@/lib/health-consultation-access";
import { healthConsultationCreateSchema } from "@/lib/health-consultation-validators";
import { createHealthConsultation, maskHealthConsultationSensitive, validateHealthConsultationReferences } from "@/lib/health-consultations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthConsultationAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status") || undefined;
  const priority = url.searchParams.get("priority") || undefined;
  const consultationType = url.searchParams.get("consultationType") || undefined;
  const professionalId = url.searchParams.get("professionalId") || undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const [consultations, patients, appointments, members, departments] = await Promise.all([
    prisma.healthConsultation.findMany({
      where: {
        organizationId, ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(consultationType ? { consultationType } : {}), ...(professionalId ? { professionalId } : {}),
        ...(dateFrom || dateTo ? { consultationDate: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}) } } : {}),
        ...(q ? { OR: [{ consultationNumber: { contains: q, mode: "insensitive" } }, { chiefComplaint: { contains: q, mode: "insensitive" } }, { patient: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { patientNumber: { contains: q, mode: "insensitive" } }] } }] } : {}),
      },
      orderBy: [{ consultationDate: "desc" }, { createdAt: "desc" }], take: 500,
      include: { patient: { select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true, knownAllergies: true, chronicTreatments: true } }, appointment: { select: { id: true, appointmentNumber: true, appointmentDate: true } }, professional: { select: { id: true, name: true } }, department: { select: { id: true, labelFr: true } }, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
    }),
    prisma.healthPatient.findMany({ where: { organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, orderBy: { fullName: "asc" }, select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true, knownAllergies: access.canViewSensitive, chronicTreatments: access.canViewSensitive } }),
    prisma.healthAppointment.findMany({ where: { organizationId, convertedConsultationId: null, status: { notIn: ["CANCELLED", "NO_SHOW"] } }, orderBy: { appointmentDate: "desc" }, take: 300, select: { id: true, appointmentNumber: true, patientId: true, professionalId: true, departmentId: true, appointmentDate: true, reason: true, appointmentType: true, priority: true, administrativeNotes: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } }, role: true } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, orderBy: { labelFr: "asc" }, select: { id: true, labelFr: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "CONSULTATIONS" } });
  return NextResponse.json({ consultations: consultations.map((item) => maskHealthConsultationSensitive(item, access.canViewSensitive)), patients, appointments, members: members.map((item) => ({ ...item.user, role: item.role })), departments, permissions: { canCreate: access.canCreate, canUpdate: access.canUpdate, canClose: access.canClose, canReopen: access.canReopen, canCancel: access.canCancel, canViewSensitive: access.canViewSensitive } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-consultations:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de consultations créées sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const access = await getHealthConsultationAccess({ session, organizationId, action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de créer une consultation." }, { status: 403 });
  const parsed = healthConsultationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez le patient, le professionnel et le motif de consultation." }, { status: 400 });
  const references = await validateHealthConsultationReferences(organizationId, parsed.data);
  if (references.error) return NextResponse.json({ error: "Invalid reference", message: references.error }, { status: 400 });
  try {
    const consultation = await createHealthConsultation(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "HEALTH_CONSULTATION_CREATED", entity: "HealthConsultation", entityId: consultation.id, request: req, metadata: { organizationId, consultationNumber: consultation.consultationNumber } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "CONSULTATIONS" } });
    return NextResponse.json({ ok: true, consultation }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Create failed", message: "Impossible de créer la consultation. Vérifiez que le rendez-vous n’a pas déjà été converti." }, { status: 409 });
  }
}
