import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { calendarResourceReservationConflictWhere } from "@/lib/calendar-advanced";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const reservationSchema = z.object({
  resourceId: z.string().min(5).max(120),
  eventId: z.string().min(5).max(120),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
}).strict();

async function getContext() {
  const session = await getSession();
  if (!session || !canAccessInternalCalendar({ role: session.role }, session)) return null;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return null;
  const feature = await canUseInternalCalendarFeature(context);
  return feature.allowed ? { session, context } : null;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await getContext();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-resource-reservation:${auth.session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = reservationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "La réservation est invalide." }, { status: 400 });

  const [resource, event] = await Promise.all([
    prisma.calendarResource.findFirst({ where: { id: parsed.data.resourceId, organizationId: auth.context.activeOrganizationId || "", isActive: true, archivedAt: null } }),
    prisma.internalCalendarEvent.findFirst({ where: { id: parsed.data.eventId, organizationId: auth.context.activeOrganizationId || "", deletedAt: null } }),
  ]);
  if (!resource || !event) return NextResponse.json({ error: "Not found", message: "La ressource ou l'événement est introuvable." }, { status: 404 });
  if (event.createdBy !== auth.session.userId || event.ownerCollaboratorId !== auth.context.calendarCollaboratorId) {
    return NextResponse.json({ error: "Forbidden", message: "Seul le créateur responsable peut réserver une ressource pour cet événement." }, { status: 403 });
  }
  const conflict = await prisma.calendarResourceReservation.findFirst({
    where: calendarResourceReservationConflictWhere({ organizationId: auth.context.activeOrganizationId || "", resourceId: resource.id, startsAt: event.startDateTime, endsAt: event.endDateTime }),
  });
  if (conflict) {
    return NextResponse.json({ error: "RESOURCE_CONFLICT", message: "Cette ressource est déjà réservée sur ce créneau.", conflict: { startsAt: conflict.startsAt, endsAt: conflict.endsAt } }, { status: 409 });
  }

  const reservation = await prisma.calendarResourceReservation.upsert({
    where: { resourceId_eventId: { resourceId: resource.id, eventId: event.id } },
    update: { status: "CONFIRMED", canceledAt: null, startsAt: event.startDateTime, endsAt: event.endDateTime, notes: parsed.data.notes || null, requestedById: auth.session.userId },
    create: { organizationId: auth.context.activeOrganizationId || "", resourceId: resource.id, eventId: event.id, requestedById: auth.session.userId, startsAt: event.startDateTime, endsAt: event.endDateTime, notes: parsed.data.notes || null },
  });
  await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_RESOURCE_RESERVED", entity: "CalendarResourceReservation", entityId: reservation.id, request: req, metadata: { eventId: event.id, resourceId: resource.id } });
  await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, reservation }, { status: 201 });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await getContext();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ id: z.string().min(5).max(120) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const reservation = await prisma.calendarResourceReservation.findFirst({ where: { id: parsed.data.id, organizationId: auth.context.activeOrganizationId || "", status: "CONFIRMED", canceledAt: null } });
  if (!reservation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const event = await prisma.internalCalendarEvent.findFirst({ where: { id: reservation.eventId, organizationId: auth.context.activeOrganizationId || "", deletedAt: null } });
  if (!event || event.createdBy !== auth.session.userId || event.ownerCollaboratorId !== auth.context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const updated = await prisma.calendarResourceReservation.update({ where: { id: reservation.id }, data: { status: "CANCELED", canceledAt: new Date() } });
  await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_RESOURCE_RESERVATION_CANCELED", entity: "CalendarResourceReservation", entityId: updated.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, reservation: updated });
}
