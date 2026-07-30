import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, groupMemberUserIds, markGroupMessagesRead, writeGroupAudit } from "@/lib/collaboration";
import { collaborationVoiceMetadataSchema } from "@/lib/collaboration-experience-validators";
import { getCollaborationVoiceSettings } from "@/lib/collaboration-voice-settings";
import { createCollaborationMediaSignedUrl, removeCollaborationMedia, uploadVoiceMessage, validateCollaborationAudio } from "@/lib/collaboration-media";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.collaborationVoiceMessage.findMany({
    where: { groupId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const voices = await Promise.all(records.map(async (voice) => ({
    id: voice.id,
    messageId: voice.messageId,
    authorId: voice.authorId,
    durationMs: voice.durationMs,
    waveform: voice.waveformJson,
    createdAt: voice.createdAt,
    audioUrl: await createCollaborationMediaSignedUrl(id, voice.storageBucket, voice.storagePath, 15 * 60).catch(() => null),
  })));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ voices });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const voiceSettings = await getCollaborationVoiceSettings();
  if (!voiceSettings.enabled) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { reason: "voice_disabled" } });
    return NextResponse.json({ error: "VOICE_DISABLED", message: "Les messages vocaux sont désactivés par l’administrateur." }, { status: 409 });
  }
  const limited = await rateLimit(
    getRateLimitKey(req, `collaboration-voice:${session.userId}`),
    voiceSettings.rateLimitPerHour,
    60 * 60 * 1000
  );
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio required" }, { status: 400 });
  const validation = validateCollaborationAudio(file, voiceSettings.maxFileSizeBytes);
  if (!validation.ok) return NextResponse.json({ error: "Invalid audio", message: validation.message }, { status: validation.status });

  let waveform: unknown = [];
  try {
    waveform = JSON.parse(String(form.get("waveform") || "[]"));
  } catch {
    return NextResponse.json({ error: "Invalid waveform" }, { status: 400 });
  }
  const metadata = collaborationVoiceMetadataSchema.safeParse({
    durationMs: form.get("durationMs"),
    replyToId: String(form.get("replyToId") || ""),
    waveform,
  });
  if (!metadata.success) return NextResponse.json({ error: "Invalid voice message" }, { status: 400 });
  if (metadata.data.durationMs > voiceSettings.maxDurationSeconds * 1000) {
    return NextResponse.json({
      error: "VOICE_DURATION_EXCEEDED",
      message: `La durée maximale autorisée est de ${voiceSettings.maxDurationSeconds} seconde(s).`,
    }, { status: 413 });
  }
  if (metadata.data.replyToId) {
    const reply = await prisma.collaborationGroupMessage.findFirst({ where: { id: metadata.data.replyToId, groupId: id, deletedAt: null }, select: { id: true } });
    if (!reply) return NextResponse.json({ error: "Invalid reply target" }, { status: 400 });
  }

  const messageId = randomUUID();
  const voiceId = randomUUID();
  const uploaded = await uploadVoiceMessage(id, messageId, file);
  try {
    const message = await prisma.$transaction(async (tx) => {
      const saved = await tx.collaborationGroupMessage.create({
        data: {
          id: messageId,
          groupId: id,
          authorId: session.userId,
          content: "Message vocal",
          messageType: "VOICE",
          replyToId: metadata.data.replyToId || null,
          status: "SENT",
        },
      });
      await tx.collaborationVoiceMessage.create({
        data: {
          id: voiceId,
          groupId: id,
          messageId,
          authorId: session.userId,
          storageBucket: uploaded.storageBucket,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          durationMs: metadata.data.durationMs,
          waveformJson: metadata.data.waveform,
        },
      });
      return saved;
    });
    await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: [message.id] });

    const memberIds = (await groupMemberUserIds(id)).filter((userId) => userId !== session.userId);
    const preferences = memberIds.length ? await prisma.collaborationGroupPreference.findMany({ where: { groupId: id, userId: { in: memberIds } } }) : [];
    const preferenceByUser = new Map(preferences.map((item) => [item.userId, item]));
    const now = Date.now();
    const recipients = memberIds.filter((userId) => {
      const preference = preferenceByUser.get(userId);
      if (!preference) return true;
      if (preference.notifications === "NONE" || preference.notifications === "MENTIONS") return false;
      if (preference.mutedUntil && preference.mutedUntil.getTime() > now) return false;
      return true;
    });
    await notifyUsers({
      userIds: recipients,
      title: "Nouveau message vocal",
      body: `${session.name} a envoyé un message vocal.`,
      type: "COLLABORATION",
      targetUrl: `/collaborators?groupId=${encodeURIComponent(id)}`,
      organizationId: member.group.organizationId,
    });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "message.voice.create", entityType: "CollaborationVoiceMessage", entityId: voiceId });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { mimeType: validation.mimeType, durationMs: metadata.data.durationMs } });
    return NextResponse.json({ ok: true, messageId }, { status: 201 });
  } catch (error) {
    await removeCollaborationMedia(id, uploaded.storageBucket, uploaded.storagePath);
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt });
    throw error;
  }
}
