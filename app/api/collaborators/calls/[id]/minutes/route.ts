import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const minutesSchema = z.object({
  content: z.string().trim().min(10).max(10_000),
  summary: z.string().trim().min(5).max(2_000).optional().or(z.literal("")),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "meeting_minutes_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `meeting-minutes:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const call = await prisma.collaborationGroupCall.findUnique({ where: { id } });
  if (!call || !call.meetingId || call.status !== "ENDED") {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Le compte-rendu est disponible uniquement après la fin d’une réunion liée au COO." }, { status: 409 });
  }

  const member = await assertGroupMemberForSession(call.groupId, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meeting = await prisma.cooMeeting.findFirst({
    where: { id: call.meetingId, collaborationGroupId: call.groupId },
    select: { id: true, title: true, reportOwnerEmployeeId: true, status: true },
  });
  if (!meeting) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Réunion COO introuvable." }, { status: 404 });
  }

  const reportOwner = meeting.reportOwnerEmployeeId
    ? await prisma.hrcfoEmployee.findFirst({ where: { id: meeting.reportOwnerEmployeeId, userId: session.userId, status: { not: "EXITED" } }, select: { id: true } })
    : null;
  if (!canManageGroup(member, session.role) && !reportOwner) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "meeting_minutes_permission_denied" } });
    return NextResponse.json({ error: "Forbidden", message: "Seul le responsable du compte-rendu, le propriétaire ou un administrateur du groupe peut créer le compte-rendu." }, { status: 403 });
  }

  const parsed = minutesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Le compte-rendu ou son résumé est invalide." }, { status: 400 });
  }

  const summary = parsed.data.summary.trim() || summarizeMinutes(parsed.data.content);
  const publication = await prisma.collaborationMeetingMinutesPublication.findUnique({ where: { callId: call.id } });
  if (!publication) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { action: "meeting_minutes_missing_prompt" } });
    return NextResponse.json({ message: "Le suivi de fin de réunion n’est pas encore disponible. Rechargez la conversation." }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    let minutesId = publication.minutesId;
    if (minutesId) {
      await tx.cooMeetingMinutes.update({ where: { id: minutesId }, data: { content: parsed.data.content } });
    } else {
      const minutes = await tx.cooMeetingMinutes.create({
        data: { meetingId: meeting.id, content: parsed.data.content, createdById: session.userId, status: "DRAFT" },
      });
      minutesId = minutes.id;
    }

    let summaryMessageId = publication.summaryMessageId;
    const summaryContent = `Résumé de la réunion « ${meeting.title} » :\n${summary}`;
    if (summaryMessageId) {
      await tx.collaborationGroupMessage.update({ where: { id: summaryMessageId }, data: { content: summaryContent, messageType: "MEETING_SUMMARY" } });
    } else {
      const summaryMessage = await tx.collaborationGroupMessage.create({
        data: {
          groupId: call.groupId,
          authorId: session.userId,
          content: summaryContent,
          messageType: "MEETING_SUMMARY",
          status: "SENT",
        },
      });
      summaryMessageId = summaryMessage.id;
    }

    await tx.collaborationMeetingMinutesPublication.update({
      where: { id: publication.id },
      data: {
        minutesId,
        summaryMessageId,
        summary,
        status: "DRAFT_CREATED",
        createdById: session.userId,
      },
    });
    await tx.cooMeeting.update({
      where: { id: meeting.id },
      data: { minutes: parsed.data.content.slice(0, 2400), status: meeting.status === "CLOSED" ? "CLOSED" : "HELD" },
    });
    return { minutesId, summaryMessageId };
  });

  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "meeting.minutes.create", entityType: "CooMeetingMinutes", entityId: result.minutesId });
  await writeAuditLog({ userId: session.userId, action: "collaboration.meeting.minutes.create", entity: "CooMeetingMinutes", entityId: result.minutesId, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { meetingId: meeting.id, callId: call.id } });
  return NextResponse.json({ ok: true, ...result, summary }, { status: 201 });
}

function summarizeMinutes(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 700) return normalized;
  const sliced = normalized.slice(0, 700);
  const sentenceEnd = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("; "));
  return `${sentenceEnd > 220 ? sliced.slice(0, sentenceEnd + 1) : sliced}…`;
}
