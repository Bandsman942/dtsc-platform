import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, createGroupSystemMessage, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationGroupUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-group-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || !canManageGroup(member, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = collaborationGroupUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid group" }, { status: 400 });
  }
  const updated = await prisma.collaborationGroup.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(typeof parsed.data.description !== "undefined" ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.groupType ? { groupType: parsed.data.groupType } : {}),
      ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.status ? { status: parsed.data.status, archivedAt: parsed.data.status === "ARCHIVED" ? new Date() : null } : {}),
    },
  });

  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.update", entityType: "CollaborationGroup", entityId: id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.group.update", entity: "CollaborationGroup", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, group: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-group-delete:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (member.group.groupType === "DIRECT") {
    await prisma.collaborationGroupMember.updateMany({ where: { groupId: id, userId: session.userId, status: "ACTIVE" }, data: { status: "LEFT", leftAt: new Date() } });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "direct.leave", entityType: "CollaborationGroupMember", entityId: member.id });
  } else if (member.role === "OWNER") {
    const activeMemberCount = await prisma.collaborationGroupMember.count({ where: { groupId: id, status: "ACTIVE" } });
    if (activeMemberCount > 1) {
      await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
      return NextResponse.json({ message: "Transférez d’abord la propriété avant de quitter ou fermer ce groupe." }, { status: 409 });
    }
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${session.name} a supprimé le groupe.` });
    await prisma.collaborationGroup.update({ where: { id }, data: { status: "DELETED", archivedAt: new Date(), closedAt: new Date(), closedById: session.userId } });
    await writeAuditLog({ userId: session.userId, action: "collaboration.group.delete", entity: "CollaborationGroup", entityId: id, request: req });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.delete", entityType: "CollaborationGroup", entityId: id });
  } else if (canManageGroup(member, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Seul le propriétaire peut supprimer ce groupe." }, { status: 403 });
  } else {
    await prisma.collaborationGroupMember.updateMany({ where: { groupId: id, userId: session.userId }, data: { status: "LEFT", leftAt: new Date() } });
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${session.name} a quitté le groupe.` });
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.leave", entityType: "CollaborationGroupMember", entityId: member.id });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
