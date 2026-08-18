import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canAccessGroupInSessionWithSubscription } from "@/lib/collaboration";
import {
  claimCollaborationCallDbReconciliation,
  getCollaborationCallToastSettings,
  humanCallEventMessage,
  readCollaborationCallEventInbox,
  type CollaborationCallInboxEvent,
} from "@/lib/collaboration-call-event-inbox";
import { expireMissedCollaborationCalls } from "@/lib/collaboration-calls";
import { prisma } from "@/lib/prisma";

const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

function participantEvent(eventType: string) {
  return ["CALL_JOINED", "CALL_LEFT", "USER_JOINED", "USER_LEFT", "PARTICIPANT_MUTED", "PARTICIPANT_UNMUTED"].includes(eventType);
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursorParam = url.searchParams.get("cursor");
  const cursorDate = cursorParam ? new Date(cursorParam) : new Date(Date.now() - MAX_EVENT_AGE_MS);
  const since = Number.isNaN(cursorDate.getTime()) ? new Date(Date.now() - MAX_EVENT_AGE_MS) : cursorDate;

  const [inbox, settingsResult] = await Promise.all([
    readCollaborationCallEventInbox(session.userId, since),
    getCollaborationCallToastSettings(session.userId),
  ]);
  const reconciliation = inbox.mode === "REDIS"
    ? await claimCollaborationCallDbReconciliation(session.userId)
    : { mode: "FALLBACK" as const, due: true };

  let responseEvents: CollaborationCallInboxEvent[] = inbox.events;
  const shouldReadDatabase = inbox.mode === "FALLBACK" || reconciliation.due;

  if (shouldReadDatabase) {
    const groups = await prisma.collaborationGroup.findMany({
      where: { status: "ACTIVE", members: { some: { userId: session.userId, status: "ACTIVE" } } },
      select: { id: true, name: true, organizationId: true, groupType: true },
      take: 200,
    });
    const visibleGroupChecks = await Promise.all(groups.map(async (group) => ({
      group,
      visible: await canAccessGroupInSessionWithSubscription(group, session),
    })));
    const visibleGroups = visibleGroupChecks.filter((item) => item.visible).map((item) => item.group);
    const groupIds = visibleGroups.map((group) => group.id);

    if (groupIds.length) {
      await expireMissedCollaborationCalls(groupIds);
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
      const databaseEvents: CollaborationCallInboxEvent[] = events.map((event) => ({
        id: event.id,
        callId: event.callId,
        groupId: event.groupId,
        meetingId: event.meetingId,
        groupName: groupNameById.get(event.groupId) || "Groupe DTSC",
        callType: event.call.callType === "VIDEO" ? "VIDEO" : "AUDIO",
        eventType: event.eventType,
        actorName: null,
        message: humanCallEventMessage(event.eventType, event.message, event.call.callType),
        createdAt: event.createdAt.toISOString(),
        canJoin: event.call.status === "RINGING" || event.call.status === "ACTIVE",
        actionUrl: `/collaborators?groupId=${encodeURIComponent(event.groupId)}&joinCall=${encodeURIComponent(event.callId)}`,
      }));
      const merged = new Map(responseEvents.map((event) => [event.id, event]));
      for (const event of databaseEvents) merged.set(event.id, event);
      responseEvents = [...merged.values()]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-20);
    }
  }

  const settings = settingsResult.settings;
  const filteredEvents = responseEvents.filter((event) => !participantEvent(event.eventType) || settings.participantEventAlertsEnabled !== false);

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: {
      callEventInbox: inbox.mode,
      dbReconciled: shouldReadDatabase,
      settingsCache: settingsResult.redisMode,
    },
  });
  return NextResponse.json({
    events: filteredEvents,
    cursor: new Date().toISOString(),
    settings,
  });
}
