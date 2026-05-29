import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { notifyUsers } from "@/lib/notifications";
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
  const member = await assertGroupMemberForSession(id, session);
  if (!canManageGroup(member, session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = collaborationInvitationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }

  const requestedUserIds = uniqueValues([parsed.data.invitedUserId, ...parsed.data.invitedUserIds]);
  const requestedEmails = uniqueValues([parsed.data.invitedEmail, ...parsed.data.invitedEmails].map((email) => email?.toLowerCase()));
  const usersByEmail = requestedEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: requestedEmails } },
        select: { id: true, email: true },
      })
    : [];
  const resolvedUserIds = uniqueValues([...requestedUserIds, ...usersByEmail.map((user) => user.id)]);
  const resolvedEmails = uniqueValues([
    ...requestedEmails,
    ...usersByEmail.map((user) => user.email.toLowerCase()),
  ]);
  const activeMembers = resolvedUserIds.length
    ? await prisma.collaborationGroupMember.findMany({
        where: { groupId: id, userId: { in: resolvedUserIds }, status: "ACTIVE" },
        select: { userId: true },
      })
    : [];
  const activeMemberIds = new Set(activeMembers.map((existingMember) => existingMember.userId));
  const duplicates = await prisma.collaborationGroupInvitation.findMany({
    where: {
      groupId: id,
      status: "PENDING",
      OR: [
        ...(resolvedUserIds.length ? [{ invitedUserId: { in: resolvedUserIds } }] : []),
        ...(resolvedEmails.length ? [{ invitedEmail: { in: resolvedEmails } }] : []),
      ],
    },
    select: { invitedUserId: true, invitedEmail: true },
  });
  const duplicateUserIds = new Set(duplicates.map((duplicate) => duplicate.invitedUserId).filter((value): value is string => Boolean(value)));
  const duplicateEmails = new Set(duplicates.map((duplicate) => duplicate.invitedEmail?.toLowerCase()).filter((value): value is string => Boolean(value)));
  const createdInvitations: Array<{ id: string; group: { name: string } }> = [];
  const notifiedUserIds: string[] = [];

  for (const userId of resolvedUserIds) {
    const resolvedEmail = usersByEmail.find((user) => user.id === userId)?.email.toLowerCase() || null;
    if (userId === session.userId || activeMemberIds.has(userId) || duplicateUserIds.has(userId) || (resolvedEmail && duplicateEmails.has(resolvedEmail))) {
      continue;
    }
    const invitation = await prisma.collaborationGroupInvitation.create({
      data: {
        groupId: id,
        invitedById: session.userId,
        invitedUserId: userId,
        invitedEmail: resolvedEmail,
        invitationMessage: parsed.data.invitationMessage || null,
        expiresAt: parsed.data.expiresAt || null,
      },
      include: { group: { select: { name: true } } },
    });
    createdInvitations.push(invitation);
    notifiedUserIds.push(userId);
  }

  for (const email of resolvedEmails) {
    const resolvedUser = usersByEmail.find((user) => user.email.toLowerCase() === email);
    if (resolvedUser || duplicateEmails.has(email)) {
      continue;
    }
    const invitation = await prisma.collaborationGroupInvitation.create({
      data: {
        groupId: id,
        invitedById: session.userId,
        invitedEmail: email,
        invitationMessage: parsed.data.invitationMessage || null,
        expiresAt: parsed.data.expiresAt || null,
      },
      include: { group: { select: { name: true } } },
    });
    createdInvitations.push(invitation);
  }

  if (!createdInvitations.length) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "No invitation created", message: "Tous les destinataires sont déjà membres ou déjà invités." }, { status: 409 });
  }

  if (notifiedUserIds.length) {
    await notifyUsers({
      userIds: notifiedUserIds,
      title: "Invitation à un groupe DTSC",
      body: `Vous êtes invité dans ${createdInvitations[0].group.name}.`,
      type: "COLLABORATION",
      targetUrl: "/collaborators",
      organizationId: member?.group.organizationId || null,
    });
  }
  for (const invitation of createdInvitations) {
    await writeGroupAudit({ groupId: id, actorId: session.userId, action: "invitation.create", entityType: "CollaborationGroupInvitation", entityId: invitation.id });
  }
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });

  return NextResponse.json({
    ok: true,
    invitations: createdInvitations,
    invitationCount: createdInvitations.length,
    skippedCount: requestedUserIds.length + requestedEmails.length - createdInvitations.length,
  }, { status: 201 });
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
