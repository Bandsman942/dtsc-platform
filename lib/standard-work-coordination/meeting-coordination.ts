import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canMutateOwnedObject, enterpriseMeetingVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export const meetingCoordinationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ADD_AGENDA_ITEM"), title: z.string().trim().min(2).max(240), description: z.string().trim().max(3000).optional(), ownerUserId: z.string().trim().max(160).optional(), durationMinutes: z.coerce.number().int().min(1).max(480).optional(), position: z.coerce.number().int().min(0).max(10000).default(0) }),
  z.object({ action: z.literal("SET_AGENDA_STATUS"), agendaItemId: z.string().cuid(), status: z.enum(["PENDING", "DISCUSSED", "DEFERRED", "CANCELLED"]) }),
  z.object({ action: z.literal("DELETE_AGENDA_ITEM"), agendaItemId: z.string().cuid() }),
  z.object({ action: z.literal("SAVE_MINUTES"), content: z.string().trim().min(3).max(40000), attendeeUserIds: z.array(z.string().trim().max(160)).max(300).default([]), absentUserIds: z.array(z.string().trim().max(160)).max(300).default([]), publish: z.boolean().default(false) }),
  z.object({ action: z.literal("LINK_TASK"), taskId: z.string().cuid(), agendaItemId: z.string().cuid().optional() }),
  z.object({ action: z.literal("UNLINK_TASK"), meetingActionId: z.string().cuid() }),
]);

export class MeetingCoordinationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

export async function getMeetingCoordinationContext(args: { session: SessionPayload; organizationId: string; meetingId: string; action: "read" | "write" }) {
  const access = await getEnterpriseCoreV2Access({ session: args.session, organizationId: args.organizationId, moduleCode: "MEETINGS", action: args.action });
  if (!access) return null;
  const meeting = await prisma.enterpriseMeeting.findFirst({
    where: { id: args.meetingId, ...enterpriseMeetingVisibilityWhere({ organizationId: args.organizationId, userId: args.session.userId, canSeeAll: access.canSeeAll }) },
    include: { participants: true },
  });
  if (!meeting) return null;
  const canMutate = canMutateOwnedObject({ canManage: access.canManage, userId: args.session.userId, relatedUserIds: [meeting.organizerUserId] });
  return { access, meeting, canMutate };
}

export async function loadMeetingCoordination(organizationId: string, meetingId: string) {
  const meeting = await prisma.enterpriseMeeting.findFirst({ where: { id: meetingId, organizationId, archivedAt: null }, include: { participants: true } });
  if (!meeting) throw new MeetingCoordinationError("NOT_FOUND", 404, "Réunion introuvable.");
  const userIds = [...new Set([meeting.organizerUserId, ...meeting.participants.map((participant) => participant.userId)])];
  const [agendaItems, minutesVersions, actions, conflicts] = await Promise.all([
    prisma.enterpriseMeetingAgendaItem.findMany({ where: { organizationId, meetingId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 300 }),
    prisma.enterpriseMeetingMinutesVersion.findMany({ where: { organizationId, meetingId }, orderBy: { versionNumber: "desc" }, take: 100 }),
    prisma.enterpriseMeetingAction.findMany({ where: { organizationId, meetingId }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.enterpriseMeeting.findMany({
      where: {
        organizationId,
        archivedAt: null,
        id: { not: meetingId },
        status: { not: "CANCELLED" },
        startAt: { lt: meeting.endAt },
        endAt: { gt: meeting.startAt },
        OR: [{ organizerUserId: { in: userIds } }, { participants: { some: { userId: { in: userIds }, responseStatus: { not: "DECLINED" } } } }],
      },
      select: { id: true, title: true, startAt: true, endAt: true, organizerUserId: true, participants: { select: { userId: true } } },
      orderBy: { startAt: "asc" },
      take: 100,
    }),
  ]);
  return {
    agendaItems,
    minutesVersions,
    actions,
    conflicts: conflicts.map((conflict) => ({
      id: conflict.id,
      title: conflict.title,
      startAt: conflict.startAt,
      endAt: conflict.endAt,
      participantUserIds: [...new Set([conflict.organizerUserId, ...conflict.participants.map((participant) => participant.userId)])].filter((userId) => userIds.includes(userId)),
    })),
  };
}

export async function applyMeetingCoordinationAction(args: { organizationId: string; meetingId: string; actorUserId: string; payload: z.infer<typeof meetingCoordinationActionSchema> }) {
  const { organizationId, meetingId, actorUserId, payload } = args;
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.enterpriseMeeting.findFirst({ where: { id: meetingId, organizationId, archivedAt: null }, include: { participants: true } });
    if (!meeting) throw new MeetingCoordinationError("NOT_FOUND", 404, "Réunion introuvable.");
    if (payload.action === "ADD_AGENDA_ITEM") {
      if (payload.ownerUserId) await requireMeetingMember(tx, organizationId, meeting, payload.ownerUserId);
      const item = await tx.enterpriseMeetingAgendaItem.create({ data: { organizationId, meetingId, title: payload.title, description: normalize(payload.description), ownerUserId: normalize(payload.ownerUserId), durationMinutes: payload.durationMinutes || null, position: payload.position, createdById: actorUserId } });
      await addEvent(tx, organizationId, meetingId, actorUserId, "MEETING_AGENDA_ITEM_ADDED", `Sujet ajouté à l’ordre du jour : ${item.title}.`);
      return { item };
    }
    if (payload.action === "SET_AGENDA_STATUS") {
      const current = await tx.enterpriseMeetingAgendaItem.findFirst({ where: { id: payload.agendaItemId, organizationId, meetingId } });
      if (!current) throw new MeetingCoordinationError("AGENDA_ITEM_NOT_FOUND", 404, "Sujet d’ordre du jour introuvable.");
      const item = await tx.enterpriseMeetingAgendaItem.update({ where: { id: current.id }, data: { status: payload.status } });
      await addEvent(tx, organizationId, meetingId, actorUserId, "MEETING_AGENDA_STATUS_CHANGED", `${item.title} : ${payload.status}.`);
      return { item };
    }
    if (payload.action === "DELETE_AGENDA_ITEM") {
      const current = await tx.enterpriseMeetingAgendaItem.findFirst({ where: { id: payload.agendaItemId, organizationId, meetingId } });
      if (!current) throw new MeetingCoordinationError("AGENDA_ITEM_NOT_FOUND", 404, "Sujet d’ordre du jour introuvable.");
      const linked = await tx.enterpriseMeetingAction.count({ where: { organizationId, meetingId, agendaItemId: current.id } });
      if (linked) throw new MeetingCoordinationError("AGENDA_ITEM_LINKED", 409, "Ce sujet possède une action de suivi et ne peut plus être supprimé.");
      await tx.enterpriseMeetingAgendaItem.delete({ where: { id: current.id } });
      await addEvent(tx, organizationId, meetingId, actorUserId, "MEETING_AGENDA_ITEM_DELETED", `Sujet retiré de l’ordre du jour : ${current.title}.`);
      return { deletedId: current.id };
    }
    if (payload.action === "SAVE_MINUTES") {
      const participants = new Set([meeting.organizerUserId, ...meeting.participants.map((participant) => participant.userId)]);
      const attendeeIds = [...new Set(payload.attendeeUserIds)];
      const absentIds = [...new Set(payload.absentUserIds)];
      if (attendeeIds.some((id) => !participants.has(id)) || absentIds.some((id) => !participants.has(id))) throw new MeetingCoordinationError("INVALID_ATTENDEE", 400, "Les présences doivent correspondre aux participants de la réunion.");
      if (attendeeIds.some((id) => absentIds.includes(id))) throw new MeetingCoordinationError("ATTENDANCE_CONFLICT", 400, "Un participant ne peut pas être présent et absent simultanément.");
      const latest = await tx.enterpriseMeetingMinutesVersion.findFirst({ where: { organizationId, meetingId }, orderBy: { versionNumber: "desc" } });
      const version = await tx.enterpriseMeetingMinutesVersion.create({ data: { organizationId, meetingId, versionNumber: (latest?.versionNumber || 0) + 1, content: payload.content, attendeeUserIds: attendeeIds, absentUserIds: absentIds, status: payload.publish ? "PUBLISHED" : "DRAFT", createdByUserId: actorUserId, publishedByUserId: payload.publish ? actorUserId : null, publishedAt: payload.publish ? new Date() : null } });
      await tx.enterpriseMeeting.update({ where: { id: meetingId }, data: { minutes: payload.content, revision: { increment: 1 } } });
      await addEvent(tx, organizationId, meetingId, actorUserId, payload.publish ? "MEETING_MINUTES_PUBLISHED" : "MEETING_MINUTES_VERSION_SAVED", payload.publish ? `Compte rendu publié en version ${version.versionNumber}.` : `Brouillon du compte rendu enregistré en version ${version.versionNumber}.`);
      return { version };
    }
    if (payload.action === "LINK_TASK") {
      const task = await tx.enterpriseTask.findFirst({ where: { id: payload.taskId, organizationId, archivedAt: null }, select: { id: true, title: true } });
      if (!task) throw new MeetingCoordinationError("TASK_NOT_FOUND", 404, "Tâche de suivi introuvable.");
      if (payload.agendaItemId) {
        const agenda = await tx.enterpriseMeetingAgendaItem.findFirst({ where: { id: payload.agendaItemId, organizationId, meetingId }, select: { id: true } });
        if (!agenda) throw new MeetingCoordinationError("AGENDA_ITEM_NOT_FOUND", 404, "Sujet d’ordre du jour introuvable.");
      }
      const action = await tx.enterpriseMeetingAction.upsert({ where: { organizationId_meetingId_taskId: { organizationId, meetingId, taskId: task.id } }, create: { organizationId, meetingId, agendaItemId: payload.agendaItemId || null, taskId: task.id, createdById: actorUserId }, update: { agendaItemId: payload.agendaItemId || null } });
      await addEvent(tx, organizationId, meetingId, actorUserId, "MEETING_FOLLOW_UP_TASK_LINKED", `Tâche de suivi liée : ${task.title}.`);
      return { action };
    }
    const action = await tx.enterpriseMeetingAction.findFirst({ where: { id: payload.meetingActionId, organizationId, meetingId } });
    if (!action) throw new MeetingCoordinationError("FOLLOW_UP_NOT_FOUND", 404, "Action de suivi introuvable.");
    await tx.enterpriseMeetingAction.delete({ where: { id: action.id } });
    await addEvent(tx, organizationId, meetingId, actorUserId, "MEETING_FOLLOW_UP_TASK_UNLINKED", "Tâche de suivi déliée de la réunion.");
    return { deletedId: action.id };
  });
}

async function requireMeetingMember(tx: Prisma.TransactionClient, organizationId: string, meeting: { organizerUserId: string; participants: Array<{ userId: string }> }, userId: string) {
  if (meeting.organizerUserId === userId || meeting.participants.some((participant) => participant.userId === userId)) return;
  const member = await tx.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { userId: true } });
  if (!member) throw new MeetingCoordinationError("INVALID_MEETING_OWNER", 400, "Le responsable du sujet doit être membre actif de l’entreprise.");
}

async function addEvent(tx: Prisma.TransactionClient, organizationId: string, meetingId: string, actorUserId: string, eventType: string, summary: string) {
  await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseMeeting", entityId: meetingId, eventType, summary, actorUserId } });
}

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
