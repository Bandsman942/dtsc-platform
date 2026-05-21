import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  canManageCollaboratorCalendar,
  calendarEventInclude,
  detectCalendarConflicts,
  getCalendarContext,
  internalCalendarAccessWhere,
  notifyCalendarParticipants,
} from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { internalCalendarEventSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const url = new URL(req.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const collaboratorId = url.searchParams.get("collaboratorId") || "";
  const query = (url.searchParams.get("q") || "").trim();

  const where: Prisma.InternalCalendarEventWhereInput = {
    AND: [
      internalCalendarAccessWhere(context),
      startParam ? { endDateTime: { gte: new Date(startParam) } } : {},
      endParam ? { startDateTime: { lte: new Date(endParam) } } : {},
      collaboratorId
        ? {
            OR: [
              { ownerCollaboratorId: collaboratorId },
              { participants: { some: { collaboratorId, participantStatus: "Actif" } } },
            ],
          }
        : {},
      query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
              { eventType: { contains: query, mode: "insensitive" as const } },
              { status: { contains: query, mode: "insensitive" as const } },
              { priority: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {},
    ],
  };

  const [events, availabilities, collaborators] = await Promise.all([
    prisma.internalCalendarEvent.findMany({
      where,
      include: calendarEventInclude(),
      orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.collaboratorAvailability.findMany({
      where: context.canViewGlobal
        ? { deletedAt: null }
        : { deletedAt: null, collaboratorId: context.employee?.id || "__no_employee__" },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      take: 200,
    }),
    prisma.hrcfoEmployee.findMany({
      where: context.canViewGlobal || context.canManagePeople
        ? { status: { not: "EXITED" } }
        : { id: context.employee?.id || "__no_employee__" },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        departmentId: true,
        jobTitle: true,
        userId: true,
      },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
  ]);

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ events, availabilities, collaborators, context: { employeeId: context.employee?.id || null, canViewGlobal: context.canViewGlobal, canManagePeople: context.canManagePeople } });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const parsed = internalCalendarEventSchema.safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les données de l'événement sont invalides." }, { status: 400 });
  }

  const { participantIds, allowConflicts, ...data } = parsed.data;
  const ownerCollaboratorId = data.ownerCollaboratorId || context.employee?.id || "";
  if (!canManageCollaboratorCalendar(context, ownerCollaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier ce planning." }, { status: 403 });
  }

  const allParticipantIds = [...new Set([ownerCollaboratorId, ...participantIds].filter(Boolean))];
  const conflicts = await detectCalendarConflicts({
    participantIds: allParticipantIds,
    startDateTime: data.startDateTime,
    endDateTime: data.endDateTime,
  });
  const hasBlockingConflict = conflicts.some((conflict) => conflict.severity === "Bloquant");
  if ((hasBlockingConflict && !context.canOverrideConflicts) || (conflicts.length > 0 && !allowConflicts)) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
    return NextResponse.json({ error: "CALENDAR_CONFLICT", message: "Conflit de disponibilité détecté.", conflicts }, { status: 409 });
  }

  const event = await prisma.internalCalendarEvent.create({
    data: {
      ...data,
      ownerCollaboratorId: ownerCollaboratorId || null,
      departmentId: data.departmentId || context.employee?.departmentId || null,
      physicalLocation: data.physicalLocation || null,
      meetingLink: data.meetingLink || null,
      sourceModule: data.sourceModule || "CALENDAR",
      sourceEntityType: data.sourceEntityType || null,
      sourceEntityId: data.sourceEntityId || null,
      createdBy: session.userId,
      participants: {
        create: allParticipantIds.map((collaboratorId) => ({
          collaboratorId,
          role: collaboratorId === ownerCollaboratorId ? "Organisateur" : "Participant",
        })),
      },
      conflicts: {
        create: conflicts.map((conflict) => ({
          collaboratorId: conflict.collaboratorId,
          conflictType: conflict.conflictType,
          conflictWithEventId: conflict.conflictWithEventId || null,
          conflictWithAvailabilityId: conflict.conflictWithAvailabilityId || null,
          severity: conflict.severity,
          message: conflict.message,
        })),
      },
    },
    include: calendarEventInclude(),
  });

  await notifyCalendarParticipants({
    participantIds: allParticipantIds,
    title: "Nouvel événement calendrier",
    body: event.title,
    targetUrl: `/calendar?event=${event.id}`,
  });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_EVENT_CREATED", entity: "InternalCalendarEvent", entityId: event.id, request: req, metadata: { conflictCount: conflicts.length } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}
