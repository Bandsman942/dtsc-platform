import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canAccessGroupInSessionWithSubscription, touchUserPresence } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);

  const url = new URL(req.url);
  const cursorParam = url.searchParams.get("cursor");
  const cursorDate = cursorParam ? new Date(cursorParam) : new Date(Date.now() - MAX_EVENT_AGE_MS);
  const since = Number.isNaN(cursorDate.getTime()) ? new Date(Date.now() - MAX_EVENT_AGE_MS) : cursorDate;

  const [groups, user] = await Promise.all([
    prisma.collaborationGroup.findMany({
      where: { status: "ACTIVE", members: { some: { userId: session.userId, status: "ACTIVE" } } },
      select: { id: true, name: true, organizationId: true, groupType: true },
      take: 200,
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        callSoundsEnabled: true,
        callNotificationsEnabled: true,
        floatingCallAlertsEnabled: true,
        participantEventAlertsEnabled: true,
        callAlertSoundEnabled: true,
        connectionIssueSoundsEnabled: true,
        callAlertDisplayDuration: true,
        callSoundVolume: true,
      },
    }),
  ]);
  const visibleGroupChecks = await Promise.all(groups.map(async (group) => ({
    group,
    visible: await canAccessGroupInSessionWithSubscription(group, session),
  })));
  const visibleGroups = visibleGroupChecks.filter((item) => item.visible).map((item) => item.group);
  const groupIds = visibleGroups.map((group) => group.id);
  if (!groupIds.length) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ events: [], cursor: new Date().toISOString(), settings: user });
  }

  const events = await prisma.collaborationGroupCallEvent.findMany({
    where: {
      groupId: { in: groupIds },
      createdAt: { gt: since },
      OR: [{ userId: null }, { userId: { not: session.userId } }],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    include: {
      call: {
        select: {
          id: true,
          groupId: true,
          meetingId: true,
          callType: true,
          status: true,
          startedById: true,
        },
      },
    },
  });
  const groupNameById = new Map(visibleGroups.map((group) => [group.id, group.name]));
  const filteredEvents = events.filter((event) => {
    if (event.eventType === "CALL_JOINED" || event.eventType === "CALL_LEFT" || event.eventType === "USER_JOINED" || event.eventType === "USER_LEFT" || event.eventType === "PARTICIPANT_MUTED" || event.eventType === "PARTICIPANT_UNMUTED") {
      return user?.participantEventAlertsEnabled !== false;
    }
    return true;
  });
  const responseEvents = filteredEvents.map((event) => ({
    id: event.id,
    callId: event.callId,
    groupId: event.groupId,
    meetingId: event.meetingId,
    groupName: groupNameById.get(event.groupId) || "Groupe DTSC",
    callType: event.call.callType,
    eventType: event.eventType,
    actorName: null,
    message: humanCallEventMessage(event.eventType, event.message, event.call.callType),
    createdAt: event.createdAt.toISOString(),
    canJoin: event.call.status === "RINGING" || event.call.status === "ACTIVE",
    actionUrl: `/collaborators?groupId=${encodeURIComponent(event.groupId)}&joinCall=${encodeURIComponent(event.callId)}`,
  }));

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    events: responseEvents,
    cursor: new Date().toISOString(),
    settings: {
      callSoundsEnabled: user?.callSoundsEnabled ?? true,
      callNotificationsEnabled: user?.callNotificationsEnabled ?? true,
      floatingCallAlertsEnabled: user?.floatingCallAlertsEnabled ?? true,
      participantEventAlertsEnabled: user?.participantEventAlertsEnabled ?? true,
      callAlertSoundEnabled: user?.callAlertSoundEnabled ?? true,
      connectionIssueSoundsEnabled: user?.connectionIssueSoundsEnabled ?? true,
      callAlertDisplayDuration: user?.callAlertDisplayDuration ?? 6000,
      callSoundVolume: user?.callSoundVolume ?? 45,
    },
  });
}

function humanCallEventMessage(eventType: string, storedMessage: string, callType: string) {
  if (eventType === "CALL_STARTED") {
    return callType === "VIDEO" ? "Appel vidéo lancé" : "Appel audio lancé";
  }
  if (eventType === "CALL_ENDED") {
    return "L'appel est terminé";
  }
  if (eventType === "CALL_JOINED" || eventType === "USER_JOINED") {
    return storedMessage || "Un collaborateur a rejoint l'appel";
  }
  if (eventType === "CALL_LEFT" || eventType === "USER_LEFT") {
    return storedMessage || "Un collaborateur a quitté l'appel";
  }
  if (eventType === "CALL_INTERRUPTED") {
    return "Connexion instable dans l'appel";
  }
  if (eventType === "CALL_RECONNECTED") {
    return "L'appel a repris";
  }
  if (eventType === "PARTICIPANT_MUTED") {
    return storedMessage || "Un collaborateur a coupé son micro";
  }
  if (eventType === "PARTICIPANT_UNMUTED") {
    return storedMessage || "Un collaborateur a réactivé son micro";
  }
  return "Événement d'appel";
}
