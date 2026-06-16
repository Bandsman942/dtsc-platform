import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseInvitationResponseSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_invitation_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-invitation:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de réponses d'invitation sur une courte période." }, { status: 429 });
  }

  const parsed = enterpriseInvitationResponseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Action d'invitation invalide." }, { status: 400 });
  }

  const { id } = await params;
  const [user, invitation] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, status: true },
    }),
    prisma.organizationMember.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        status: true,
        invitedBy: true,
        removedAt: true,
        organization: {
          select: { id: true, name: true, status: true, deletedAt: true, organizationType: true },
        },
      },
    }),
  ]);

  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!invitation) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.userId !== session.userId) {
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_INVITATION_ACCESS_DENIED",
      entity: "OrganizationMember",
      entityId: invitation.id,
      request: req,
      metadata: { organizationId: invitation.organizationId, attemptedAction: parsed.data.action },
    });
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Cette invitation ne vous appartient pas." }, { status: 403 });
  }

  if (invitation.status !== "INVITED" || invitation.removedAt) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invitation unavailable", message: "Cette invitation n'est plus en attente." }, { status: 409 });
  }

  if (invitation.organization.status !== "ACTIVE" || invitation.organization.deletedAt || invitation.organization.organizationType !== "CLIENT") {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Organization unavailable", message: "L'entreprise liée à cette invitation n'est plus disponible." }, { status: 404 });
  }

  const now = new Date();
  if (parsed.data.action === "ACCEPT") {
    const membership = await prisma.organizationMember.update({
      where: { id: invitation.id },
      data: { status: "ACTIVE", joinedAt: now, removedAt: null },
      select: { id: true, organizationId: true, status: true, joinedAt: true },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_INVITATION_ACCEPTED",
      entity: "OrganizationMember",
      entityId: invitation.id,
      request: req,
      metadata: { organizationId: invitation.organizationId, role: invitation.role },
    });
    if (invitation.invitedBy && invitation.invitedBy !== session.userId) {
      await notifyUser({
        userId: invitation.invitedBy,
        title: "Invitation acceptée",
        body: `${user.name} a rejoint ${invitation.organization.name}.`,
        type: "ENTERPRISE_INVITATION_RESPONSE",
        targetUrl: "/enterprise-admin",
        organizationId: invitation.organizationId,
      });
    }
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "enterprise_invitation_accepted", organizationId: invitation.organizationId } });
    return NextResponse.json({
      ok: true,
      status: membership.status,
      organizationId: membership.organizationId,
      redirectTo: "/dashboard",
    });
  }

  await prisma.organizationMember.update({
    where: { id: invitation.id },
    data: { status: "REMOVED", removedAt: now, joinedAt: null },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_INVITATION_DECLINED",
    entity: "OrganizationMember",
    entityId: invitation.id,
    request: req,
    metadata: { organizationId: invitation.organizationId, role: invitation.role, status: "REMOVED" },
  });
  if (invitation.invitedBy && invitation.invitedBy !== session.userId) {
    await notifyUser({
      userId: invitation.invitedBy,
      title: "Invitation refusée",
      body: `${user.name} a refusé l'invitation à rejoindre ${invitation.organization.name}.`,
      type: "ENTERPRISE_INVITATION_RESPONSE",
      targetUrl: "/enterprise-admin",
      organizationId: invitation.organizationId,
    });
  }
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "enterprise_invitation_declined", organizationId: invitation.organizationId } });
  return NextResponse.json({
    ok: true,
    status: "REMOVED",
    organizationId: invitation.organizationId,
    redirectTo: "/enterprise-invitations",
  });
}
