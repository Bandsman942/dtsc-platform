import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, createGroupSystemMessage, writeGroupAudit } from "@/lib/collaboration";
import { removeCollaborationMedia, uploadGroupAvatar, validateCollaborationImage } from "@/lib/collaboration-media";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-avatar:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || !canManageGroup(member, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image required" }, { status: 400 });
  const validation = validateCollaborationImage(file);
  if (!validation.ok) return NextResponse.json({ error: "Invalid image", message: validation.message }, { status: validation.status });

  const existing = await prisma.collaborationGroupExperience.findUnique({ where: { groupId: id } });
  const uploaded = await uploadGroupAvatar(id, file);
  try {
    const profile = await prisma.collaborationGroupExperience.upsert({
      where: { groupId: id },
      create: {
        groupId: id,
        avatarStorageBucket: uploaded.storageBucket,
        avatarStoragePath: uploaded.storagePath,
        avatarMimeType: uploaded.mimeType,
        avatarSizeBytes: uploaded.sizeBytes,
        avatarUpdatedById: session.userId,
        avatarUpdatedAt: new Date(),
      },
      update: {
        avatarStorageBucket: uploaded.storageBucket,
        avatarStoragePath: uploaded.storagePath,
        avatarMimeType: uploaded.mimeType,
        avatarSizeBytes: uploaded.sizeBytes,
        avatarUpdatedById: session.userId,
        avatarUpdatedAt: new Date(),
      },
    });
    await removeCollaborationMedia(id, existing?.avatarStorageBucket, existing?.avatarStoragePath);
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${session.name} a mis à jour la photo du groupe.` });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.avatar.update", entityType: "CollaborationGroupExperience", entityId: profile.id });
    await writeAuditLog({ userId: session.userId, action: "collaboration.group.avatar.update", entity: "CollaborationGroup", entityId: id, request: req });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await removeCollaborationMedia(id, uploaded.storageBucket, uploaded.storagePath);
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt });
    throw error;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-avatar-delete:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || !canManageGroup(member, session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.collaborationGroupExperience.findUnique({ where: { groupId: id } });
  if (existing) {
    await prisma.collaborationGroupExperience.update({
      where: { groupId: id },
      data: { avatarStorageBucket: null, avatarStoragePath: null, avatarMimeType: null, avatarSizeBytes: null, avatarUpdatedById: session.userId, avatarUpdatedAt: new Date() },
    });
    await removeCollaborationMedia(id, existing.avatarStorageBucket, existing.avatarStoragePath);
  }
  await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${session.name} a retiré la photo du groupe.` });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.avatar.remove", entityType: "CollaborationGroup", entityId: id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.group.avatar.remove", entity: "CollaborationGroup", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
