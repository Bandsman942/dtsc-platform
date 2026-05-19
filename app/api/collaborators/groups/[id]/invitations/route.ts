import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMember, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { collaborationInvitationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const member = await assertGroupMember(id, session.userId);
  if (!canManageGroup(member, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = collaborationInvitationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }

  let invitedUserId = parsed.data.invitedUserId || null;
  const invitedEmail = (parsed.data.invitedEmail || "").toLowerCase() || null;
  if (!invitedUserId && invitedEmail) {
    const user = await prisma.user.findUnique({ where: { email: invitedEmail }, select: { id: true } });
    invitedUserId = user?.id || null;
  }
  if (invitedUserId) {
    const existingMember = await prisma.collaborationGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: invitedUserId } },
      select: { id: true, status: true },
    });
    if (existingMember?.status === "ACTIVE") {
      return NextResponse.json({ error: "Already member" }, { status: 409 });
    }
  }

  const duplicate = await prisma.collaborationGroupInvitation.findFirst({
    where: {
      groupId: id,
      status: "PENDING",
      OR: [
        ...(invitedUserId ? [{ invitedUserId }] : []),
        ...(invitedEmail ? [{ invitedEmail }] : []),
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Duplicate invitation" }, { status: 409 });
  }

  const invitation = await prisma.collaborationGroupInvitation.create({
    data: {
      groupId: id,
      invitedById: session.userId,
      invitedUserId,
      invitedEmail,
      invitationMessage: parsed.data.invitationMessage || null,
      expiresAt: parsed.data.expiresAt || null,
    },
    include: { group: { select: { name: true } } },
  });

  if (invitedUserId) {
    await notifyUser({
      userId: invitedUserId,
      title: "Invitation à un groupe DTSC",
      body: `Vous êtes invité dans ${invitation.group.name}.`,
      type: "COLLABORATION",
      targetUrl: "/collaborators",
    });
  }
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "invitation.create", entityType: "CollaborationGroupInvitation", entityId: invitation.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true, invitation }, { status: 201 });
}
