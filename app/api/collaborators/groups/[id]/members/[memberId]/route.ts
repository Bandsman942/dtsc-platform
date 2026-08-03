import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, writeGroupAudit } from "@/lib/collaboration";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-member:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { id, memberId } = await params;
  const actorMember = await assertGroupMemberForSession(id, session);
  if (!actorMember || actorMember.role !== "OWNER") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Seul le propriétaire peut gérer les rôles du groupe." }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "PROMOTE_ADMIN" && action !== "DEMOTE_ADMIN" && action !== "REMOVE" && action !== "TRANSFER_OWNER") {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Action membre invalide." }, { status: 400 });
  }

  const target = await prisma.collaborationGroupMember.findFirst({
    where: { id: memberId, groupId: id, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true } }, group: { select: { ownerId: true, name: true, organizationId: true } } },
  });
  if (!target) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Membre introuvable." }, { status: 404 });
  }
  if (target.userId === target.group.ownerId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Le propriétaire ne peut pas être retiré ou rétrogradé." }, { status: 403 });
  }

  if (action === "TRANSFER_OWNER") {
    await prisma.$transaction(async (tx) => {
      await tx.collaborationGroup.update({ where: { id }, data: { ownerId: target.userId } });
      await tx.collaborationGroupMember.updateMany({ where: { groupId: id, userId: session.userId, status: "ACTIVE" }, data: { role: "ADMIN" } });
      await tx.collaborationGroupMember.update({ where: { id: memberId }, data: { role: "OWNER" } });
    });
    const content = `${target.user.name} est maintenant propriétaire du groupe.`;
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content });
    await notifyUser({ userId: target.userId, title: "Propriété du groupe transférée", body: content, type: "COLLABORATION", targetUrl: collaboratorsNotificationTarget(id), organizationId: target.group.organizationId, idempotencyKey: `collaboration:group-owner-transfer:${id}:${target.userId}` });
  } else if (action === "REMOVE") {
    await prisma.collaborationGroupMember.update({
      where: { id: memberId },
      data: { status: "REMOVED", leftAt: new Date() },
    });
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${target.user.name} a été retiré du groupe.` });
    await notifyUser({ userId: target.userId, title: "Retrait d'un groupe DTSC", body: `Vous avez été retiré de ${target.group.name}.`, type: "COLLABORATION", targetUrl: collaboratorsNotificationTarget(id), organizationId: target.group.organizationId, idempotencyKey: `collaboration:member-remove:${id}:${target.userId}` });
  } else {
    const nextRole = action === "PROMOTE_ADMIN" ? "ADMIN" : "MEMBER";
    await prisma.collaborationGroupMember.update({ where: { id: memberId }, data: { role: nextRole } });
    const content = action === "PROMOTE_ADMIN"
      ? `${target.user.name} est maintenant administrateur du groupe.`
      : `${target.user.name} n'est plus administrateur du groupe.`;
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content });
    await notifyUser({ userId: target.userId, title: "Rôle de groupe mis à jour", body: content, type: "COLLABORATION", targetUrl: collaboratorsNotificationTarget(id), organizationId: target.group.organizationId, idempotencyKey: `collaboration:member-role:${id}:${target.userId}:${nextRole}` });
  }

  await writeGroupAudit({ groupId: id, actorId: session.userId, action: `member.${action.toLowerCase()}`, entityType: "CollaborationGroupMember", entityId: memberId });
  await writeAuditLog({ userId: session.userId, action: `collaboration.group.member.${action.toLowerCase()}`, entity: "CollaborationGroupMember", entityId: memberId, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
