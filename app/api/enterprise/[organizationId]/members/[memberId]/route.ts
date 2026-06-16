import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseMemberUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; memberId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_member_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-member-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les collaborateurs." }, { status: 429 });
  }
  const { organizationId, memberId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Accès administration entreprise refusé." }, { status: 403 });
  }
  const parsed = enterpriseMemberUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Mise à jour du collaborateur invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId, removedAt: null },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!member) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Collaborateur introuvable." }, { status: 404 });
  }
  if (member.userId === session.userId && (data.action === "remove" || data.status === "REMOVED")) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Self removal forbidden", message: "Vous ne pouvez pas retirer votre propre accès depuis cette action." }, { status: 409 });
  }
  const position = data.positionId
    ? await prisma.enterprisePosition.findFirst({
        where: { id: data.positionId, organizationId, isActive: true },
        select: { id: true, positionCode: true, labelFr: true },
      })
    : null;
  if (data.positionId && !position) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid position", message: "Le poste sélectionné n'appartient pas à cette entreprise." }, { status: 400 });
  }
  const now = new Date();
  const nextStatus =
    data.action === "suspend" ? "SUSPENDED" :
      data.action === "restore" ? "ACTIVE" :
        data.action === "remove" ? "REMOVED" :
          data.status;
  if (member.status === "INVITED" && nextStatus && nextStatus !== "REMOVED") {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json(
      {
        error: "Invitation status locked",
        message: "Une invitation en attente ne peut pas être transformée en adhésion active. Le collaborateur doit l'accepter lui-même.",
      },
      { status: 409 }
    );
  }
  const updated = await prisma.organizationMember.update({
    where: { id: memberId },
    data: {
      ...(data.role ? { role: data.role } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(data.action === "remove" || nextStatus === "REMOVED" ? { removedAt: now } : {}),
      ...(data.action === "restore" || nextStatus === "ACTIVE" ? { removedAt: null } : {}),
      ...(typeof data.positionId !== "undefined"
        ? {
            positionId: position?.id || null,
            positionCode: position?.positionCode || null,
            positionTitle: position?.labelFr || null,
          }
        : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  await writeAuditLog({
    userId: session.userId,
    action: data.action === "remove" ? "ENTERPRISE_MEMBER_REMOVED" : "ENTERPRISE_MEMBER_UPDATED",
    entity: "OrganizationMember",
    entityId: memberId,
    request: req,
    metadata: { organizationId, action: data.action, role: data.role, positionId: position?.id || null, status: nextStatus },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, memberId } });
  return NextResponse.json({ ok: true, member: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_member_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-member-delete:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les collaborateurs." }, { status: 429 });
  }
  const { organizationId, memberId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Accès administration entreprise refusé." }, { status: 403 });
  }
  const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId, removedAt: null }, select: { userId: true } });
  if (!member) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Collaborateur introuvable." }, { status: 404 });
  }
  if (member.userId === session.userId) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Self removal forbidden", message: "Vous ne pouvez pas retirer votre propre accès depuis cette action." }, { status: 409 });
  }
  const now = new Date();
  await prisma.organizationMember.update({ where: { id: memberId }, data: { status: "REMOVED", removedAt: now } });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_MEMBER_REMOVED", entity: "OrganizationMember", entityId: memberId, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, memberId } });
  return NextResponse.json({ ok: true });
}
