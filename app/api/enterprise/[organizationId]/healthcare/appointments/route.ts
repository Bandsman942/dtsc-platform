import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthAppointmentAccess } from "@/lib/health-appointment-access";
import { healthAppointmentCreateSchema } from "@/lib/health-appointment-validators";
import { createHealthAppointment, validateHealthAppointmentReferences } from "@/lib/health-appointments";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getHealthAppointmentAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status") || undefined;
  const priority = url.searchParams.get("priority") || undefined;
  const appointmentType = url.searchParams.get("appointmentType") || undefined;
  const professionalId = url.searchParams.get("professionalId") || undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const [appointments, patients, members, departments] = await Promise.all([
    prisma.healthAppointment.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(appointmentType ? { appointmentType } : {}), ...(professionalId ? { professionalId } : {}),
        ...(dateFrom || dateTo ? { appointmentDate: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}) } } : {}),
        ...(q ? { OR: [{ appointmentNumber: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }, { patient: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phonePrimary: { contains: q, mode: "insensitive" } }, { patientNumber: { contains: q, mode: "insensitive" } }] } }] } : {}),
      },
      orderBy: [{ appointmentDate: "asc" }, { createdAt: "desc" }],
      take: 500,
      include: { patient: { select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true } }, professional: { select: { id: true, name: true } }, department: { select: { id: true, labelFr: true } }, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
    }),
    prisma.healthPatient.findMany({ where: { organizationId, status: { notIn: ["ARCHIVED", "DECEASED"] } }, orderBy: { fullName: "asc" }, select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true } }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null }, orderBy: { user: { name: "asc" } }, select: { user: { select: { id: true, name: true } }, role: true } }),
    prisma.enterpriseDepartment.findMany({ where: { organizationId, isActive: true }, orderBy: { labelFr: "asc" }, select: { id: true, labelFr: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "APPOINTMENTS" } });
  return NextResponse.json({ appointments: appointments.map((item) => access.canViewSensitive ? item : { ...item, internalNotes: null }), patients, members: members.map((item) => ({ ...item.user, role: item.role })), departments, permissions: { canCreate: access.canCreate, canUpdate: access.canUpdate, canTransition: access.canTransition, canCancel: access.canCancel, canConvert: access.canConvert, canViewSensitive: access.canViewSensitive } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-appointments:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de rendez-vous créés sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const access = await getHealthAppointmentAccess({ session, organizationId, action: "submit" });
  if (!access?.canCreate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de créer un rendez-vous." }, { status: 403 });
  const parsed = healthAppointmentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez le patient, la date et le motif du rendez-vous." }, { status: 400 });
  const data = parsed.data;
  const references = await validateHealthAppointmentReferences(organizationId, data);
  if (references.error) return NextResponse.json({ error: "Invalid reference", message: references.error }, { status: 400 });
  const appointment = await createHealthAppointment(organizationId, session.userId, access.canViewSensitive ? data : { ...data, internalNotes: "" });
  await writeAuditLog({ userId: session.userId, action: "HEALTH_APPOINTMENT_CREATED", entity: "HealthAppointment", entityId: appointment.id, request: req, metadata: { organizationId, appointmentNumber: appointment.appointmentNumber } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "APPOINTMENTS" } });
  return NextResponse.json({ ok: true, appointment }, { status: 201 });
}
