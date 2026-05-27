import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, writeGroupAudit } from "@/lib/collaboration";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, memberId } = await params;
  const actorMember = await assertGroupMemberForSession(id, session);
  if (!actorMember || actorMember.role !== "OWNER") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Seul le propriétaire peut gérer les rôles du groupe." }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (action !== "PROMOTE_ADMIN" && action !== "DEMOTE_ADMIN" && action !== "REMOVE") {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Action membre invalide." }, { status: 400 });
  }

  const target = await prisma.collaborationGroupMember.findFirst({
    where: { id: memberId, groupId: id, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true } }, group: { select: { ownerId: true, name: true } } },
  });
  if (!target) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Membre introuvable." }, { status: 404 });
  }
  if (target.userId === target.group.ownerId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Le propriétaire ne peut pas être retiré ou rétrogradé." }, { status: 403 });
  }

  if (action === "REMOVE") {
    await prisma.collaborationGroupMember.update({
      where: { id: memberId },
      data: { status: "REMOVED", leftAt: new Date() },
    });
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content: `${target.user.name} a été retiré du groupe.` });
    await notifyUser({ userId: target.userId, title: "Retrait d'un groupe DTSC", body: `Vous avez été retiré de ${target.group.name}.`, type: "COLLABORATION", targetUrl: "/collaborators" });
  } else {
    const nextRole = action === "PROMOTE_ADMIN" ? "ADMIN" : "MEMBER";
    await prisma.collaborationGroupMember.update({ where: { id: memberId }, data: { role: nextRole } });
    const content = action === "PROMOTE_ADMIN"
      ? `${target.user.name} est maintenant administrateur du groupe.`
      : `${target.user.name} n'est plus administrateur du groupe.`;
    await createGroupSystemMessage({ groupId: id, actorId: session.userId, content });
    await notifyUser({ userId: target.userId, title: "Rôle de groupe mis à jour", body: content, type: "COLLABORATION", targetUrl: "/collaborators" });
  }

  await writeGroupAudit({ groupId: id, actorId: session.userId, action: `member.${action.toLowerCase()}`, entityType: "CollaborationGroupMember", entityId: memberId });
  await writeAuditLog({ userId: session.userId, action: `collaboration.group.member.${action.toLowerCase()}`, entity: "CollaborationGroupMember", entityId: memberId, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
