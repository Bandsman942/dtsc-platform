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
    return NextResponse.json({ error: "Forbidden", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized", message: "Votre session a expiré." }, { status: 401 });
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
        joinedAt: true,
        removedAt: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: { id: true, name: true, status: true, deletedAt: true, organizationType: true },
        },
      },
    }),
  ]);

  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized", message: "Votre compte n’est pas actif." }, { status: 401 });
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

  if (parsed.data.action === "ACCEPT" && invitation.status === "ACTIVE" && !invitation.removedAt) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "enterprise_invitation_accept_replayed", organizationId: invitation.organizationId } });
    return NextResponse.json({ ok: true, idempotent: true, status: "ACTIVE", organizationId: invitation.organizationId, redirectTo: "/dashboard" });
  }

  if (parsed.data.action === "DECLINE" && invitation.status === "REMOVED" && invitation.removedAt) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "enterprise_invitation_decline_replayed", organizationId: invitation.organizationId } });
    return NextResponse.json({ ok: true, idempotent: true, status: "REMOVED", organizationId: invitation.organizationId, redirectTo: "/enterprise-invitations" });
  }

  if (invitation.status !== "INVITED" || invitation.removedAt) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invitation unavailable", message: "Cette invitation n'est plus en attente." }, { status: 409 });
  }

  if (invitation.organization.status !== "ACTIVE" || invitation.organization.deletedAt || invitation.organization.organizationType !== "CLIENT") {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Organization unavailable", message: "L'entreprise liée à cette invitation n'est plus disponible." }, { status: 404 });
  }

  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId: invitation.organizationId }, select: { invitationExpiryHours: true } });
  const expiryHours = policy?.invitationExpiryHours ?? 168;
  // A membership may be reused after a previous decline/removal. `createdAt`
  // then points to the historic first membership, while `updatedAt` is refreshed
  // by the invitation upsert and therefore represents the current invitation cycle.
  const invitationIssuedAt = invitation.updatedAt;
  const expiresAt = new Date(invitationIssuedAt.getTime() + expiryHours * 60 * 60 * 1000);
  const now = new Date();
  if (now > expiresAt) {
    await prisma.organizationMember.update({ where: { id: invitation.id }, data: { status: "REMOVED", removedAt: now, joinedAt: null } });
    await writeAuditLog({ userId: session.userId, organizationId: invitation.organizationId, action: "ENTERPRISE_INVITATION_EXPIRED", entity: "OrganizationMember", entityId: invitation.id, request: req, riskLevel: "LOW", reasonCode: "INVITATION_EXPIRED", metadata: { organizationId: invitation.organizationId, expiryHours, invitationIssuedAt: invitationIssuedAt.toISOString() } });
    await writeApiLog({ request: req, statusCode: 410, userId: session.userId, startedAt, metadata: { action: "enterprise_invitation_expired", organizationId: invitation.organizationId } });
    return NextResponse.json({ error: "INVITATION_EXPIRED", message: "Cette invitation a expiré selon la politique de sécurité de l’entreprise. Demandez une nouvelle invitation." }, { status: 410 });
  }

  if (parsed.data.action === "ACCEPT") {
    const membership = await prisma.$transaction(async (tx) => {
      const updatedMembership = await tx.organizationMember.update({
        where: { id: invitation.id },
        data: { status: "ACTIVE", joinedAt: now, removedAt: null },
        select: { id: true, organizationId: true, status: true, joinedAt: true },
      });
      if (["ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "OWNER"].includes(invitation.role)) {
        await tx.organizationAdminGrant.updateMany({
          where: { organizationId: invitation.organizationId, userId: invitation.userId, status: "PENDING", revokedAt: null },
          data: { status: "ACTIVE", grantedAt: now, reason: "Invitation administrateur acceptée" },
        });
      }
      return updatedMembership;
    });

    await writeAuditLog({
      userId: session.userId,
      organizationId: invitation.organizationId,
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
    return NextResponse.json({ ok: true, idempotent: false, status: membership.status, organizationId: membership.organizationId, redirectTo: "/dashboard" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: invitation.id },
      data: { status: "REMOVED", removedAt: now, joinedAt: null },
    });
    if (["ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "OWNER"].includes(invitation.role)) {
      await tx.organizationAdminGrant.updateMany({
        where: { organizationId: invitation.organizationId, userId: invitation.userId, status: "PENDING", revokedAt: null },
        data: { status: "REVOKED", revokedAt: now, reason: "Invitation administrateur refusée" },
      });
    }
  });
  await writeAuditLog({
    userId: session.userId,
    organizationId: invitation.organizationId,
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
  return NextResponse.json({ ok: true, idempotent: false, status: "REMOVED", organizationId: invitation.organizationId, redirectTo: "/enterprise-invitations" });
}
