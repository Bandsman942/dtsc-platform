import { publishCollaborationCallEvent } from "@/lib/collaboration-call-event-inbox";
import { prisma } from "@/lib/prisma";

export const COLLABORATION_CALL_RING_TIMEOUT_SECONDS = 45;

export async function expireMissedCollaborationCalls(groupIds?: string[]) {
  const now = new Date();
  const calls = await prisma.collaborationGroupCall.findMany({
    where: {
      status: "RINGING",
      ringExpiresAt: { lte: now },
      ...(groupIds?.length ? { groupId: { in: groupIds } } : {}),
    },
    select: { id: true, groupId: true, meetingId: true, startedById: true },
    take: 100,
  });
  const eventIds: string[] = [];
  for (const call of calls) {
    const eventId = await prisma.$transaction(async (tx) => {
      const updated = await tx.collaborationGroupCall.updateMany({
        where: { id: call.id, status: "RINGING" },
        data: { status: "MISSED", endedAt: now, durationSeconds: 0 },
      });
      if (!updated.count) return null;
      await tx.collaborationGroupCallParticipant.updateMany({
        where: { callId: call.id, status: { in: ["INVITED", "JOINED"] } },
        data: { status: "MISSED", leftAt: now },
      });
      const event = await tx.collaborationGroupCallEvent.create({
        data: {
          callId: call.id,
          groupId: call.groupId,
          meetingId: call.meetingId,
          userId: call.startedById,
          eventType: "CALL_MISSED",
          message: "Appel manqué : aucun participant n’a répondu dans le délai prévu.",
        },
        select: { id: true },
      });
      if (call.meetingId) {
        await tx.cooMeeting.updateMany({ where: { id: call.meetingId, activeCallId: call.id }, data: { activeCallId: null } });
      }
      return event.id;
    });
    if (eventId) eventIds.push(eventId);
  }
  for (const eventId of eventIds) {
    await publishCollaborationCallEvent(eventId);
  }
  return eventIds.length;
}
