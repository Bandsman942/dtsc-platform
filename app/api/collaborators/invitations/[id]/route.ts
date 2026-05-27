import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canAccessGroupInSessionWithSubscription, createGroupSystemMessage, writeGroupAudit } from "@/lib/collaboration";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { collaborationInvitationResponseSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = collaborationInvitationResponseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  }
  const { id } = await params;
  const invitation = await prisma.collaborationGroupInvitation.findFirst({
    where: {
      id,
      status: "PENDING",
      OR: [{ invitedUserId: session.userId }, { invitedEmail: session.email.toLowerCase() }, { invitedById: session.userId }],
    },
    include: { group: true },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (!(await canAccessGroupInSessionWithSubscription(invitation.group, session))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (parsed.data.action === "CANCEL" && invitation.invitedById !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (parsed.data.action === "ACCEPT") {
    await prisma.$transaction([
      prisma.collaborationGroupInvitation.update({
        where: { id },
        data: { status: "ACCEPTED", invitedUserId: session.userId, respondedAt: new Date() },
      }),
      prisma.collaborationGroupMember.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId: session.userId } },
        update: { status: "ACTIVE", leftAt: null },
        create: { groupId: invitation.groupId, userId: session.userId, role: "MEMBER", status: "ACTIVE" },
      }),
    ]);
    await createGroupSystemMessage({ groupId: invitation.groupId, actorId: session.userId, content: `${session.name} a rejoint le groupe.` });
    await notifyUser({ userId: invitation.invitedById, title: "Invitation acceptée", body: `${session.name} a rejoint ${invitation.group.name}.`, type: "COLLABORATION", targetUrl: "/collaborators" });
  } else {
    await prisma.collaborationGroupInvitation.update({
      where: { id },
      data: { status: parsed.data.action === "DECLINE" ? "DECLINED" : "CANCELED", respondedAt: new Date() },
    });
  }
  await writeGroupAudit({ groupId: invitation.groupId, actorId: session.userId, action: `invitation.${parsed.data.action.toLowerCase()}`, entityType: "CollaborationGroupInvitation", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
