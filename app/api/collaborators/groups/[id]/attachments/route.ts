import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, groupMemberUserIds, writeGroupAudit } from "@/lib/collaboration";
import { removeCollaborationMedia, uploadMessageAttachment, validateCollaborationAttachment } from "@/lib/collaboration-media";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

function messageTypeForMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-attachment:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Fichier manquant." }, { status: 400 });
  const validation = validateCollaborationAttachment(file);
  if (!validation.ok) return NextResponse.json({ error: "MEDIA_NOT_ALLOWED", message: validation.message }, { status: validation.status });
  const clientMessageId = String(form.get("clientMessageId") || randomUUID()).slice(0, 120);
  const existing = await prisma.collaborationGroupMessage.findFirst({ where: { groupId: id, authorId: session.userId, clientMessageId }, select: { id: true } });
  if (existing) return NextResponse.json({ ok: true, messageId: existing.id, idempotent: true });

  const messageId = randomUUID();
  const upload = await uploadMessageAttachment(id, messageId, file);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.collaborationGroupMessage.create({
        data: {
          id: messageId,
          groupId: id,
          authorId: session.userId,
          content: file.name,
          messageType: messageTypeForMime(validation.mimeType),
          clientMessageId,
          status: "SENT",
        },
      });
      const attachment = await tx.collaborationMessageAttachment.create({
        data: {
          groupId: id,
          messageId,
          uploaderId: session.userId,
          storageBucket: upload.storageBucket,
          storagePath: upload.storagePath,
          originalName: file.name.slice(0, 240),
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          checksum: upload.checksum,
        },
      });
      await tx.collaborationGroup.update({ where: { id }, data: { lastActivityAt: new Date() } });
      return { message, attachment };
    });
    const recipients = (await groupMemberUserIds(id)).filter((userId) => userId !== session.userId);
    await Promise.all(recipients.map((userId) => notifyUser({
      userId,
      title: "Nouveau fichier partagé",
      body: `${session.name} a partagé ${file.name}.`,
      type: "COLLABORATION",
      targetUrl: collaboratorsNotificationTarget(id, messageId),
      organizationId: member.group.organizationId,
      idempotencyKey: `collaboration:attachment:${messageId}:${userId}`,
    })));
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "message.attachment.create", entityType: "CollaborationMessageAttachment", entityId: result.attachment.id });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    await removeCollaborationMedia(id, upload.storageBucket, upload.storagePath);
    throw error;
  }
}
