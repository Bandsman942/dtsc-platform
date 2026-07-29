import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, canUseInternalCalendarFeature, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { internalCalendarAvailabilitySchema, internalCalendarAvailabilityUpdateSchema } from "@/lib/validators";
import {
  dateOnlyToUtcDate,
  dtscWeeklyAvailabilitySchema,
  dtscWeeklyAvailabilityUpdateSchema,
  ensureNoWeeklyAvailabilityOverlap,
  isDtscWeeklyAvailability,
  isPastDateKey,
  serializeWeeklyAvailability,
  todayDateKey,
  yesterdayOfDateKey,
} from "@/lib/work-schedule";

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
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const status = calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status });
  }

  const availability = await prisma.collaboratorAvailability.findFirst({
    where: { AND: [collaboratorAvailabilityWhere(context), { id }] },
  });
  if (!availability) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ availability: context.dtscInternal && isDtscWeeklyAvailability(availability) ? serializeWeeklyAvailability(availability) : availability });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "calendar_availability_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `calendar-availability-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations calendrier sur une courte période." }, { status: 429 });
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
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const status = calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status });
  }

  const existing = await prisma.collaboratorAvailability.findFirst({
    where: { organizationId: context.activeOrganizationId, id, deletedAt: null },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rawPayload = await req.json().catch(() => null);

  if (context.dtscInternal) {
    if (existing.collaboratorId !== context.calendarCollaboratorId) {
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "work_availability_cross_update_denied", targetCollaboratorId: existing.collaboratorId } });
      return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement modifier votre propre planning." }, { status: 403 });
    }

    const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
    const timezone = userPreference?.timezone || "Africa/Kinshasa";
    const todayKey = todayDateKey(timezone);
    const existingSpecificDateKey = existing.specificDate?.toISOString().slice(0, 10) || null;
    if (existingSpecificDateKey && existingSpecificDateKey < todayKey) {
      return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Cette donnée appartient au passé et reste en lecture seule pour préserver l'historique." }, { status: 409 });
    }

    if (isDtscWeeklyAvailability(existing)) {
      const updateParsed = dtscWeeklyAvailabilityUpdateSchema.safeParse(rawPayload);
      if (!updateParsed.success) {
        return NextResponse.json({ error: "Invalid payload", message: "Utilisez Mon planning pour modifier cette disponibilité habituelle." }, { status: 400 });
      }
      if (updateParsed.data.collaboratorId && updateParsed.data.collaboratorId !== context.calendarCollaboratorId) {
        return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement modifier votre propre planning." }, { status: 403 });
      }
      const effectiveFromKey = updateParsed.data.effectiveFrom || existing.recurrenceStart?.toISOString().slice(0, 10) || todayKey;
      if (isPastDateKey(effectiveFromKey, timezone)) {
        return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "La nouvelle version du planning doit prendre effet aujourd'hui ou dans le futur." }, { status: 409 });
      }
      const merged = dtscWeeklyAvailabilitySchema.safeParse({
        dayOfWeek: updateParsed.data.dayOfWeek ?? existing.dayOfWeek,
        startTime: updateParsed.data.startTime ?? existing.startTime,
        endTime: updateParsed.data.endTime ?? existing.endTime,
        locationMode: updateParsed.data.locationMode ?? existing.locationMode,
        notes: updateParsed.data.notes ?? existing.notes ?? "",
        effectiveFrom: effectiveFromKey,
        effectiveUntil: updateParsed.data.effectiveUntil ?? existing.recurrenceUntil?.toISOString().slice(0, 10) ?? "",
      });
      if (!merged.success) {
        return NextResponse.json({ error: "Invalid payload", message: merged.error.issues[0]?.message || "La disponibilité est invalide." }, { status: 400 });
      }
      const effectiveFrom = dateOnlyToUtcDate(effectiveFromKey);
      const effectiveUntil = dateOnlyToUtcDate(merged.data.effectiveUntil || null);
      const overlap = await ensureNoWeeklyAvailabilityOverlap({
        organizationId: context.activeOrganizationId,
        collaboratorId: context.calendarCollaboratorId,
        dayOfWeek: merged.data.dayOfWeek,
        startTime: merged.data.startTime,
        endTime: merged.data.endTime,
        effectiveFrom,
        effectiveUntil,
        excludeId: existing.id,
      });
      if (overlap) {
        return NextResponse.json({ error: "WORK_AVAILABILITY_OVERLAP", message: `Cette plage chevauche déjà votre disponibilité de ${overlap.startTime} à ${overlap.endTime}.` }, { status: 409 });
      }

      const existingStartKey = existing.recurrenceStart?.toISOString().slice(0, 10) || null;
      const existingEndKey = existing.recurrenceUntil?.toISOString().slice(0, 10) || null;
      if (existingEndKey && existingEndKey < todayKey) {
        return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Cette version historique du planning ne peut plus être modifiée." }, { status: 409 });
      }
      const shouldVersion = !existingStartKey || existingStartKey < effectiveFromKey;
      const availability = shouldVersion
        ? await prisma.$transaction(async (tx) => {
            const historicalEnd = yesterdayOfDateKey(effectiveFromKey);
            if (!existingStartKey || historicalEnd >= existingStartKey) {
              await tx.collaboratorAvailability.update({ where: { id: existing.id }, data: { recurrenceUntil: dateOnlyToUtcDate(historicalEnd) } });
            } else {
              await tx.collaboratorAvailability.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
            }
            return tx.collaboratorAvailability.create({
              data: {
                organizationId: context.activeOrganizationId,
                collaboratorId: context.calendarCollaboratorId,
                dayOfWeek: merged.data.dayOfWeek,
                specificDate: null,
                startTime: merged.data.startTime,
                endTime: merged.data.endTime,
                availabilityStatus: "Disponible",
                recurrenceType: "Hebdomadaire",
                recurrenceStart: effectiveFrom,
                recurrenceUntil: effectiveUntil,
                recurrenceInterval: 1,
                locationMode: merged.data.locationMode,
                notes: merged.data.notes || null,
                createdBy: session.userId,
              },
            });
          })
        : await prisma.collaboratorAvailability.update({
            where: { id: existing.id },
            data: {
              dayOfWeek: merged.data.dayOfWeek,
              startTime: merged.data.startTime,
              endTime: merged.data.endTime,
              recurrenceStart: effectiveFrom,
              recurrenceUntil: effectiveUntil,
              locationMode: merged.data.locationMode,
              notes: merged.data.notes || null,
            },
          });

      await writeAuditLog({
        userId: session.userId,
        action: "WORK_AVAILABILITY_UPDATED",
        entity: "CollaboratorWeeklyAvailability",
        entityId: availability.id,
        request: req,
        metadata: { previousVersionId: shouldVersion ? existing.id : null, versioned: shouldVersion },
      });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
      return NextResponse.json({ ok: true, availability: serializeWeeklyAvailability(availability), versioned: shouldVersion });
    }

    const legacyParsed = internalCalendarAvailabilityUpdateSchema.safeParse(rawPayload);
    if (!legacyParsed.success) {
      return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
    }
    if (legacyParsed.data.collaboratorId && legacyParsed.data.collaboratorId !== context.calendarCollaboratorId) {
      return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement modifier votre propre planning." }, { status: 403 });
    }
    const mergedLegacy = internalCalendarAvailabilitySchema.safeParse({
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
      ...legacyParsed.data,
      collaboratorId: context.calendarCollaboratorId,
    });
    if (!mergedLegacy.success) {
      return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
    }
    const availability = await prisma.collaboratorAvailability.update({
      where: { id },
      data: {
        collaboratorId: context.calendarCollaboratorId,
        dayOfWeek: mergedLegacy.data.dayOfWeek ?? null,
        specificDate: mergedLegacy.data.specificDate || null,
        startTime: mergedLegacy.data.startTime,
        endTime: mergedLegacy.data.endTime,
        availabilityStatus: mergedLegacy.data.availabilityStatus,
        recurrenceType: mergedLegacy.data.recurrenceType,
        recurrenceStart: mergedLegacy.data.recurrenceStart || null,
        recurrenceUntil: mergedLegacy.data.recurrenceUntil || null,
        recurrenceInterval: mergedLegacy.data.recurrenceInterval || 1,
        locationMode: mergedLegacy.data.locationMode,
        notes: mergedLegacy.data.notes || null,
      },
    });
    await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_UPDATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req, metadata: { compatibilityMode: true } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, availability });
  }

  if (!canManageCollaboratorCalendar(context, existing.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  }
  const parsed = internalCalendarAvailabilityUpdateSchema.safeParse(rawPayload);
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
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "calendar_availability_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `calendar-availability-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations calendrier sur une courte période." }, { status: 429 });
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
  const calendarAccess = await canUseInternalCalendarFeature(context);
  if (!calendarAccess.allowed) {
    const status = calendarAccess.code === "PLAN_REQUIRED" || calendarAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: calendarAccess.code, message: calendarAccess.message }, { status });
  }

  const existing = await prisma.collaboratorAvailability.findFirst({
    where: { organizationId: context.activeOrganizationId, id, deletedAt: null },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (context.dtscInternal) {
    if (existing.collaboratorId !== context.calendarCollaboratorId) {
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "work_availability_cross_delete_denied", targetCollaboratorId: existing.collaboratorId } });
      return NextResponse.json({ error: "Forbidden", message: "Vous pouvez uniquement supprimer votre propre planning." }, { status: 403 });
    }
    const userPreference = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });
    const timezone = userPreference?.timezone || "Africa/Kinshasa";
    const todayKey = todayDateKey(timezone);
    const specificDateKey = existing.specificDate?.toISOString().slice(0, 10) || null;
    if (specificDateKey && specificDateKey < todayKey) {
      return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Une donnée passée reste en lecture seule pour préserver l'historique." }, { status: 409 });
    }

    if (isDtscWeeklyAvailability(existing)) {
      const existingStartKey = existing.recurrenceStart?.toISOString().slice(0, 10) || null;
      const existingEndKey = existing.recurrenceUntil?.toISOString().slice(0, 10) || null;
      if (existingEndKey && existingEndKey < todayKey) {
        return NextResponse.json({ error: "PAST_SCHEDULE_LOCKED", message: "Cette version historique du planning ne peut plus être supprimée." }, { status: 409 });
      }
      const historical = !existingStartKey || existingStartKey < todayKey;
      if (historical) {
        await prisma.collaboratorAvailability.update({
          where: { id },
          data: { recurrenceUntil: dateOnlyToUtcDate(yesterdayOfDateKey(todayKey)) },
        });
      } else {
        await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
      }
      await writeAuditLog({ userId: session.userId, action: "WORK_AVAILABILITY_DELETED", entity: "CollaboratorWeeklyAvailability", entityId: existing.id, request: req, metadata: { historicalClosure: historical } });
    } else {
      await prisma.collaboratorAvailability.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_DELETED", entity: "CollaboratorAvailability", entityId: existing.id, request: req, metadata: { compatibilityMode: true } });
    }
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true });
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
