import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { internalCalendarAvailabilitySchema, internalCalendarAvailabilityUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const availability = await prisma.collaboratorAvailability.findFirst({
    where: { AND: [collaboratorAvailabilityWhere(context), { id }] },
  });
  if (!availability) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ availability });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.collaboratorAvailability.findFirst({
    where: { AND: [collaboratorAvailabilityWhere(context), { id }] },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageCollaboratorCalendar(context, existing.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  }

  const parsed = internalCalendarAvailabilityUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  }

  const merged = internalCalendarAvailabilitySchema.safeParse({
    collaboratorId: existing.collaboratorId,
    dayOfWeek: existing.dayOfWeek,
    specificDate: existing.specificDate,
    startTime: existing.startTime,
    endTime: existing.endTime,
    availabilityStatus: existing.availabilityStatus,
    recurrenceType: existing.recurrenceType,
    recurrenceStart: existing.recurrenceStart,
    recurrenceUntil: existing.recurrenceUntil,
    recurrenceInterval: existing.recurrenceInterval,
    locationMode: existing.locationMode,
    notes: existing.notes || "",
    ...parsed.data,
  });
  if (!merged.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  }
  if (!canManageCollaboratorCalendar(context, merged.data.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas déplacer cette disponibilité vers ce collaborateur." }, { status: 403 });
  }
  if (!(await validateCalendarCollaborators(context, [merged.data.collaboratorId]))) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid collaborator", message: "Ce collaborateur n'appartient pas à l'organisation active." }, { status: 400 });
  }

  const availability = await prisma.collaboratorAvailability.update({
    where: { id },
    data: {
      collaboratorId: merged.data.collaboratorId,
      dayOfWeek: merged.data.dayOfWeek ?? null,
      specificDate: merged.data.specificDate || null,
      startTime: merged.data.startTime,
      endTime: merged.data.endTime,
      availabilityStatus: merged.data.availabilityStatus,
      recurrenceType: merged.data.recurrenceType,
      recurrenceStart: merged.data.recurrenceStart || null,
      recurrenceUntil: merged.data.recurrenceUntil || null,
      recurrenceInterval: merged.data.recurrenceInterval || 1,
      locationMode: merged.data.locationMode,
      notes: merged.data.notes || null,
    },
  });

  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_UPDATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, availability });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.collaboratorAvailability.findFirst({
    where: { AND: [collaboratorAvailabilityWhere(context), { id }] },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageCollaboratorCalendar(context, existing.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas supprimer cette disponibilité." }, { status: 403 });
  }

  const availability = await prisma.collaboratorAvailability.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_DELETED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
