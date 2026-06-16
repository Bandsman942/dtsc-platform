import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { sendEnterpriseInvitationEmail } from "@/lib/enterprise-invitations-mail";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseMemberInviteSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_member_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-member:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'invitations sur une courte période." }, { status: 429 });
  }

  const { organizationId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul un admin de cette entreprise peut inviter des collaborateurs." }, { status: 403 });
  }

  const parsed = enterpriseMemberInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "L'email ou le rôle est invalide." }, { status: 400 });
  }

  const [organization, targetUser, inviter, position] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: { email: parsed.data.email, status: UserStatus.ACTIVE },
      select: { id: true, email: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true },
    }),
    parsed.data.positionId
      ? prisma.enterprisePosition.findFirst({
          where: { id: parsed.data.positionId, organizationId, isActive: true },
          select: { id: true, positionCode: true, labelFr: true },
        })
      : Promise.resolve(null),
  ]);

  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Entreprise introuvable ou inactive." }, { status: 404 });
  }
  if (!targetUser) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "User not found", message: "Ce collaborateur doit d'abord disposer d'un compte actif DTSC Platform." }, { status: 404 });
  }
  if (parsed.data.positionId && !position) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid position", message: "Le poste sélectionné n'appartient pas à cette entreprise." }, { status: 400 });
  }

  const existingMembership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUser.id } },
    select: { id: true, status: true, removedAt: true },
  });
  if (existingMembership?.status === "ACTIVE" && !existingMembership.removedAt) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Already member", message: "Cet utilisateur est déjà collaborateur actif de cette entreprise." }, { status: 409 });
  }
  if (existingMembership?.status === "INVITED" && !existingMembership.removedAt) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invitation pending", message: "Une invitation est déjà en attente pour cet utilisateur." }, { status: 409 });
  }

  const membership = await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: targetUser.id } },
    update: {
      role: parsed.data.role,
      positionId: position?.id || null,
      positionCode: position?.positionCode || null,
      positionTitle: position?.labelFr || null,
      status: "INVITED",
      removedAt: null,
      joinedAt: null,
      invitedBy: session.userId,
    },
    create: {
      organizationId,
      userId: targetUser.id,
      role: parsed.data.role,
      positionId: position?.id || null,
      positionCode: position?.positionCode || null,
      positionTitle: position?.labelFr || null,
      status: "INVITED",
      invitedBy: session.userId,
      joinedAt: null,
    },
  });
  const invitationTargetUrl = `/enterprise-invitations?organizationId=${encodeURIComponent(organizationId)}`;
  const invitationMessage = parsed.data.message?.trim() || `Vous êtes invité à rejoindre l'espace privé de ${organization.name}.`;

  await notifyUser({
    userId: targetUser.id,
    title: `Invitation ${organization.name}`,
    body: invitationMessage,
    type: "ENTERPRISE_INVITATION",
    targetUrl: invitationTargetUrl,
    organizationId,
  });

  const emailResult = await sendEnterpriseInvitationEmail({
    email: targetUser.email,
    name: targetUser.name,
    organizationName: organization.name,
    invitedByName: inviter?.name || session.name,
    role: parsed.data.role,
    message: parsed.data.message,
  }).catch((error) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "Enterprise invitation email failed",
  }));

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_MEMBER_INVITED",
    entity: "OrganizationMember",
    entityId: membership.id,
    request: req,
    metadata: { organizationId, invitedUserId: targetUser.id, role: parsed.data.role, emailSent: emailResult.sent },
  });
  await writeApiLog({
    request: req,
    statusCode: 201,
    userId: session.userId,
    startedAt,
    metadata: {
      action: "enterprise_member_invited",
      organizationId,
      invitedUserId: targetUser.id,
      emailSent: emailResult.sent,
      emailReason: "reason" in emailResult ? emailResult.reason : undefined,
    },
  });
  return NextResponse.json(
    {
      ok: true,
      membership,
      emailSent: emailResult.sent,
      message: emailResult.sent
        ? "Invitation créée et email envoyé."
        : "Invitation interne créée. L'email d'invitation n'a pas pu être envoyé.",
    },
    { status: 201 }
  );
}
