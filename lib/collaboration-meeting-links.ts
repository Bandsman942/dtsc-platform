import { prisma } from "@/lib/prisma";

export type CooMeetingLinkSource = {
  id: string;
  title: string;
  meetingMode: string;
  meetingDate: Date | null;
  meetingTime: string | null;
  collaborationGroupId: string | null;
  status?: string | null;
};

export function scheduledMeetingDateTime(date: Date, time: string | null | undefined) {
  const [hours = "0", minutes = "0"] = (time || "09:00").split(":");
  const next = new Date(date);
  next.setHours(Number(hours), Number(minutes), 0, 0);
  return next;
}

export function isScheduledMeetingMode(mode: string | null | undefined): mode is "AUDIO" | "VIDEO" {
  return mode === "AUDIO" || mode === "VIDEO";
}

export async function syncCooMeetingLink({ meeting, actorId }: { meeting: CooMeetingLinkSource; actorId: string }) {
  const existing = await prisma.collaborationMeetingLink.findUnique({ where: { meetingId: meeting.id } });
  const shouldHaveLink = Boolean(meeting.collaborationGroupId && meeting.meetingDate && isScheduledMeetingMode(meeting.meetingMode));

  if (!shouldHaveLink) {
    if (existing && existing.status !== "COMPLETED") {
      await prisma.collaborationMeetingLink.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
      await prisma.collaborationGroupMessage.updateMany({
        where: { id: existing.messageId },
        data: { content: `La réunion liée a été annulée ou basculée hors appel audio/vidéo.` },
      });
    }
    return existing ? { ...existing, status: "CANCELED" } : null;
  }

  const groupId = meeting.collaborationGroupId as string;
  const scheduledAt = scheduledMeetingDateTime(meeting.meetingDate as Date, meeting.meetingTime);
  const callType = meeting.meetingMode as "AUDIO" | "VIDEO";
  const canceled = meeting.status === "CANCELED";
  const nextStatus = canceled ? "CANCELED" : meeting.status === "PLANNED" || meeting.status === "POSTPONED" ? "SCHEDULED" : existing?.status || "SCHEDULED";
  const humanType = callType === "VIDEO" ? "vidéo" : "audio";
  const messageContent = canceled
    ? `Réunion ${humanType} « ${meeting.title} » annulée.`
    : `Réunion ${humanType} « ${meeting.title} » planifiée. Le bouton de participation devient actif à l’heure prévue.`;

  if (existing) {
    await prisma.$transaction([
      prisma.collaborationMeetingLink.update({
        where: { id: existing.id },
        data: {
          groupId,
          callType,
          scheduledAt,
          availableFrom: scheduledAt,
          status: nextStatus,
        },
      }),
      prisma.collaborationGroupMessage.updateMany({
        where: { id: existing.messageId, groupId },
        data: { content: messageContent, messageType: "MEETING_LINK" },
      }),
    ]);
    return prisma.collaborationMeetingLink.findUnique({ where: { id: existing.id } });
  }

  return prisma.$transaction(async (tx) => {
    const message = await tx.collaborationGroupMessage.create({
      data: {
        groupId,
        authorId: actorId,
        content: messageContent,
        messageType: "MEETING_LINK",
        status: "SENT",
      },
    });
    return tx.collaborationMeetingLink.create({
      data: {
        meetingId: meeting.id,
        groupId,
        messageId: message.id,
        callType,
        scheduledAt,
        availableFrom: scheduledAt,
        status: nextStatus,
        createdById: actorId,
      },
    });
  });
}

export function meetingLinkCanJoin(link: { status: string; availableFrom: Date }, now = new Date()) {
  return (link.status === "SCHEDULED" || link.status === "ACTIVE") && now.getTime() >= link.availableFrom.getTime();
}
