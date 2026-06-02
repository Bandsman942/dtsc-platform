import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  canAccessInternalCalendar,
  canManageCollaboratorCalendar,
  calendarEventInclude,
  collaboratorAvailabilityWhere,
  detectCalendarConflicts,
  getCalendarCollaborators,
  getCalendarContext,
  internalCalendarAccessWhere,
  notifyCalendarParticipants,
  validateCalendarCollaborators,
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
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Aucun espace calendrier actif." }, { status: 403 });
  }
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
      where: collaboratorAvailabilityWhere(context),
      orderBy: [{ specificDate: "asc" }, { recurrenceStart: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
      take: 200,
    }),
    getCalendarCollaborators(context),
  ]);

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    events,
    availabilities,
    collaborators,
    context: {
      employeeId: context.calendarCollaboratorId || null,
      canViewGlobal: context.canViewGlobal,
      canViewPeopleAvailability: context.canViewPeopleAvailability,
      canManagePeople: context.canManagePeople,
    },
  });
}

export async function POST(req: Request) {
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

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Aucun espace calendrier actif." }, { status: 403 });
  }
  const parsed = internalCalendarEventSchema.safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les données de l'événement sont invalides." }, { status: 400 });
  }

  const { participantIds, allowConflicts, ...data } = parsed.data;
  const ownerCollaboratorId = data.ownerCollaboratorId || context.calendarCollaboratorId || "";
  if (!canManageCollaboratorCalendar(context, ownerCollaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier ce planning." }, { status: 403 });
  }

  const allParticipantIds = [...new Set([ownerCollaboratorId, ...participantIds].filter(Boolean))];
  if (!(await validateCalendarCollaborators(context, allParticipantIds))) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid participants", message: "Tous les collaborateurs doivent appartenir à l'organisation active." }, { status: 400 });
  }
  const conflicts = await detectCalendarConflicts({
    context,
    participantIds: allParticipantIds,
    startDateTime: data.startDateTime,
    endDateTime: data.endDateTime,
  });
  const hasBlockingConflict = conflicts.some((conflict) => conflict.severity === "Bloquant");
  if ((hasBlockingConflict && !context.canOverrideConflicts) || (conflicts.length > 0 && !allowConflicts)) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
    return NextResponse.json({ error: "CALENDAR_CONFLICT", message: "Conflit de disponibilité détecté.", conflicts }, { status: 409 });
  }

  const linkedSource = await createCalendarLinkedSource({
    context,
    data,
    ownerCollaboratorId,
    participantIds: allParticipantIds,
    createdById: session.userId,
  });

  const event = await prisma.internalCalendarEvent.create({
    data: {
      ...data,
      organizationId: context.activeOrganizationId,
      ownerCollaboratorId: ownerCollaboratorId || null,
      departmentId: data.departmentId || context.employee?.departmentId || null,
      physicalLocation: data.physicalLocation || null,
      meetingLink: data.meetingLink || null,
      sourceModule: linkedSource?.sourceModule || data.sourceModule || "CALENDAR",
      sourceEntityType: linkedSource?.sourceEntityType || data.sourceEntityType || null,
      sourceEntityId: linkedSource?.sourceEntityId || data.sourceEntityId || null,
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
    context,
    participantIds: allParticipantIds,
    title: "Nouvel événement calendrier",
    body: event.title,
    targetUrl: `/calendar?event=${event.id}`,
  });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_EVENT_CREATED", entity: "InternalCalendarEvent", entityId: event.id, request: req, metadata: { conflictCount: conflicts.length } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}

async function createCalendarLinkedSource({
  context,
  data,
  ownerCollaboratorId,
  participantIds,
  createdById,
}: {
  context: Awaited<ReturnType<typeof getCalendarContext>>;
  data: {
    title: string;
    description?: string | null;
    eventType: string;
    startDateTime: Date;
    endDateTime: Date;
    priority: string;
    locationMode: string;
    visibility: string;
    physicalLocation?: string | null;
  };
  ownerCollaboratorId: string;
  participantIds: string[];
  createdById: string;
}) {
  const priority = calendarPriorityToInternalPriority(data.priority);
  if (!context.dtscInternal) {
    const requestRecord = await prisma.enterpriseActivityRequest.create({
      data: {
        organizationId: context.activeOrganizationId || "",
        blockCode: "INTERNAL_CALENDAR",
        title: data.title,
        description: data.description || `${data.eventType} planifié depuis le calendrier interne de l'entreprise.`,
        priority,
        status: "SUBMITTED",
        createdById,
        assignedToUserId: null,
        targetModuleCode: "INTERNAL_CALENDAR",
        metadataJson: {
          eventType: data.eventType,
          startDateTime: data.startDateTime.toISOString(),
          endDateTime: data.endDateTime.toISOString(),
          locationMode: data.locationMode,
          visibility: data.visibility,
          participantIds,
        },
      },
    });
    return { sourceModule: "ENTERPRISE_CALENDAR", sourceEntityType: "EnterpriseActivityRequest", sourceEntityId: requestRecord.id };
  }

  const employees = await prisma.hrcfoEmployee.findMany({
    where: { id: { in: [...new Set([ownerCollaboratorId, ...participantIds].filter(Boolean))] } },
    select: { id: true, fullName: true, departmentId: true, department: true, userId: true },
  });
  const owner = employees.find((employee) => employee.id === ownerCollaboratorId) || employees[0];
  const participantNames = employees.map((employee) => employee.fullName).join(", ");
  const plannedTime = timeString(data.startDateTime);

  if (data.eventType === "Tâche") {
    const task = await prisma.cooTask.create({
      data: {
        title: data.title,
        description: data.description || "Tâche créée depuis le calendrier interne.",
        taskType: "ADMINISTRATIVE",
        departmentId: owner?.departmentId || null,
        departmentName: owner?.department || null,
        responsibleEmployeeId: owner?.id || null,
        responsibleName: owner?.fullName || null,
        assigneeEmployeeId: owner?.id || null,
        assigneeName: owner?.fullName || null,
        plannedDate: data.startDateTime,
        plannedStartTime: plannedTime,
        deadlineTime: timeString(data.endDateTime),
        priority,
        status: "TODO",
        createdById,
      },
    });
    return { sourceModule: "COO", sourceEntityType: "CooTask", sourceEntityId: task.id };
  }

  if (data.eventType === "Réunion") {
    const meeting = await prisma.cooMeeting.create({
      data: {
        title: data.title,
        meetingType: "COORDINATION",
        meetingMode: "COMMENTS_ONLY",
        meetingDate: data.startDateTime,
        meetingTime: plannedTime,
        departmentId: owner?.departmentId || null,
        departmentName: owner?.department || null,
        participants: participantNames,
        agenda: data.description || "Réunion créée depuis le calendrier interne.",
        reportOwnerEmployeeId: owner?.id || null,
        reportOwnerName: owner?.fullName || null,
        status: "PLANNED",
        sourceModule: "CALENDAR",
        linkedEntityType: "InternalCalendarEvent",
        confidentialityLevel: data.visibility === "Privé" ? "PRIVATE" : "INTERNAL",
        createdById,
      },
    });
    return { sourceModule: "COO", sourceEntityType: "CooMeeting", sourceEntityId: meeting.id };
  }

  if (data.eventType === "Blocage") {
    const blocker = await prisma.cooBlocker.create({
      data: {
        title: data.title,
        description: data.description || "Blocage créé depuis le calendrier interne.",
        sourceType: "CALENDAR",
        departmentId: owner?.departmentId || null,
        departmentName: owner?.department || null,
        responsibleEmployeeId: owner?.id || null,
        responsibleName: owner?.fullName || null,
        severity: priority === "CRITICAL" ? "CRITICAL" : "MEDIUM",
        status: "OPEN",
        declaredAt: data.startDateTime,
        createdById,
      },
    });
    return { sourceModule: "COO", sourceEntityType: "CooBlocker", sourceEntityId: blocker.id };
  }

  if (data.eventType === "Mission") {
    const mission = await prisma.scoLogisticsEvent.create({
      data: {
        title: data.title,
        missionType: "CALENDAR",
        location: data.physicalLocation || data.locationMode || "Non défini",
        eventDate: data.startDateTime,
        requesterName: owner?.fullName || null,
        departmentId: owner?.departmentId || null,
        departmentName: owner?.department || null,
        participants: participantNames,
        ownerName: owner?.fullName || "DTSC",
        status: "PLANNED",
        notes: data.description || "Mission créée depuis le calendrier interne.",
        createdById,
      },
    });
    return { sourceModule: "SCO", sourceEntityType: "ScoLogisticsEvent", sourceEntityId: mission.id };
  }

  if (data.eventType === "Appel audio" || data.eventType === "Appel vidéo") {
    const userIds = employees.map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId));
    const group = await prisma.collaborationGroup.create({
      data: {
        name: `${data.eventType} planifié - ${data.title}`.slice(0, 120),
        description: data.description || "Groupe créé depuis le calendrier interne pour préparer l'appel.",
        groupType: "meeting",
        autoCreated: true,
        ownerId: createdById,
        organizationId: context.activeOrganizationId,
        visibility: "PRIVATE",
        members: {
          create: [...new Set([createdById, ...userIds])].map((userId) => ({
            userId,
            role: userId === createdById ? "OWNER" : "MEMBER",
            status: "ACTIVE",
          })),
        },
        messages: {
          create: {
            authorId: createdById,
            content: `${data.eventType} planifié depuis le calendrier interne.`,
            messageType: "SYSTEM",
          },
        },
      },
    });
    return { sourceModule: "COLLABORATORS", sourceEntityType: "CollaborationGroup", sourceEntityId: group.id };
  }

  return null;
}

function timeString(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function calendarPriorityToInternalPriority(priority: string) {
  if (priority === "Critique") {
    return "CRITICAL";
  }
  if (priority === "Élevée") {
    return "HIGH";
  }
  if (priority === "Faible") {
    return "LOW";
  }
  return "NORMAL";
}
