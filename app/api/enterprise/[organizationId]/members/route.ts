import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { enterpriseMemberInviteSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const [organization, targetUser] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: { email: parsed.data.email, status: UserStatus.ACTIVE },
      select: { id: true, email: true, name: true },
    }),
  ]);

  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Entreprise introuvable ou inactive." }, { status: 404 });
  }
  if (!targetUser) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "User not found", message: "Ce collaborateur doit d'abord disposer d'un compte actif DTSC Platform." }, { status: 404 });
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
      status: "INVITED",
      removedAt: null,
      joinedAt: null,
      invitedBy: session.userId,
    },
    create: {
      organizationId,
      userId: targetUser.id,
      role: parsed.data.role,
      status: "INVITED",
      invitedBy: session.userId,
      joinedAt: null,
    },
  });

  await notifyUser({
    userId: targetUser.id,
    title: `Invitation ${organization.name}`,
    body: parsed.data.message || `Vous êtes invité à rejoindre l'espace privé de ${organization.name}.`,
    type: "ORGANIZATION",
    targetUrl: "/notifications",
  });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_MEMBER_INVITED",
    entity: "OrganizationMember",
    entityId: membership.id,
    request: req,
    metadata: { organizationId, invitedUserId: targetUser.id, role: parsed.data.role },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, membership }, { status: 201 });
}
