import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getHealthAppointmentAccess } from "@/lib/health-appointment-access";
import { healthAppointmentUpdateSchema } from "@/lib/health-appointment-validators";
import { updateHealthAppointment, validateHealthAppointmentReferences } from "@/lib/health-appointments";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; appointmentId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, appointmentId } = await params;
  const access = await getHealthAppointmentAccess({ session, organizationId, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const appointment = await prisma.healthAppointment.findFirst({
    where: { id: appointmentId, organizationId },
    include: { patient: { select: { id: true, legacyRecordId: true, patientNumber: true, fullName: true, phonePrimary: true, sex: true, birthDate: true } }, professional: { select: { id: true, name: true } }, department: { select: { id: true, labelFr: true } }, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } }, events: { orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } } },
  });
  if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "APPOINTMENTS" } });
  return NextResponse.json({ appointment: access.canViewSensitive ? appointment : { ...appointment, internalNotes: null }, permissions: { canUpdate: access.canUpdate, canTransition: access.canTransition, canCancel: access.canCancel, canConvert: access.canConvert, canViewSensitive: access.canViewSensitive } });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `health-appointment-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, appointmentId } = await params;
  const access = await getHealthAppointmentAccess({ session, organizationId, action: "write" });
  if (!access?.canUpdate) return NextResponse.json({ error: "Forbidden", message: "Vous n’avez pas la permission de modifier ce rendez-vous." }, { status: 403 });
  const parsed = healthAppointmentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les modifications du rendez-vous sont invalides." }, { status: 400 });
  const data = parsed.data;
  const references = await validateHealthAppointmentReferences(organizationId, data);
  if (references.error) return NextResponse.json({ error: "Invalid reference", message: references.error }, { status: 400 });
  try {
    const appointment = await updateHealthAppointment(organizationId, appointmentId, session.userId, data);
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeAuditLog({ userId: session.userId, action: "HEALTH_APPOINTMENT_UPDATED", entity: "HealthAppointment", entityId: appointment.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: "APPOINTMENTS" } });
    return NextResponse.json({ ok: true, appointment });
  } catch (error) {
    const message = error instanceof Error && error.message === "APPOINTMENT_LOCKED" ? "Un rendez-vous réalisé, annulé ou converti ne peut plus être modifié librement." : "Modification du rendez-vous impossible.";
    return NextResponse.json({ error: "Update failed", message }, { status: 409 });
  }
}
