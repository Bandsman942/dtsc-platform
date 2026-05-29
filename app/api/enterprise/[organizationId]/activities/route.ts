import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseActivity, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { enterpriseActivityRequestSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { organizationId } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canSeeAll =
    membership.role === "OWNER" ||
    membership.role === "ADMIN_ENTREPRISE" ||
    membership.role === "ADMIN_ENTERPRISE" ||
    membership.role === "MANAGER";
  const requestWhere = canSeeAll
    ? { organizationId }
    : {
        organizationId,
        OR: [{ createdById: session.userId }, { assignedToUserId: session.userId }],
      };

  const [organization, blocks, requests] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, sectorCode: true, sector: true, businessSector: { select: { labelFr: true, labelEn: true, icon: true, color: true } } },
    }),
    prisma.enterpriseActivityBlock.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { labelFr: "asc" }],
    }),
    prisma.enterpriseActivityRequest.findMany({
      where: requestWhere,
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { createdBy: { select: { name: true, email: true } }, block: { select: { labelFr: true, labelEn: true, icon: true } } },
    }),
  ]);

  if (!organization) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ organization, blocks, requests, membershipRole: membership.role });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { organizationId } = await params;
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = enterpriseActivityRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La demande d'activité est invalide." }, { status: 400 });
  }

  const data = parsed.data;
  if (!(await canAccessEnterpriseActivity(session.userId, organizationId, data.blockCode, "submit"))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à soumettre cette action." }, { status: 403 });
  }
  const block = await prisma.enterpriseActivityBlock.findUnique({
    where: { organizationId_blockCode: { organizationId, blockCode: data.blockCode } },
  });
  if (!block) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (data.assignedToUserId) {
    const assignee = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: data.assignedToUserId, status: "ACTIVE", removedAt: null },
      select: { userId: true },
    });
    if (!assignee) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid assignee", message: "Le destinataire doit être collaborateur actif de cette entreprise." }, { status: 400 });
    }
  }

  const requestRecord = await prisma.enterpriseActivityRequest.create({
    data: {
      organizationId,
      blockId: block.id,
      blockCode: block.blockCode,
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: "SUBMITTED",
      targetModuleCode: block.targetModuleCode,
      assignedToUserId: data.assignedToUserId || null,
      createdById: session.userId,
      metadataJson: { membershipRole: membership.role, ...data.metadata },
    },
  });

  const adminMembers = data.assignedToUserId
    ? [{ userId: data.assignedToUserId }]
    : await prisma.organizationMember.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          removedAt: null,
          role: { in: ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE", "MANAGER"] },
          userId: { not: session.userId },
        },
        select: { userId: true },
        take: 20,
      });
  if (adminMembers.length) {
    await prisma.notification.createMany({
      data: adminMembers.map((member) => ({
        userId: member.userId,
        organizationId,
        title: "Nouvelle demande entreprise",
        body: data.title,
        type: "ENTERPRISE_ACTIVITY",
        targetUrl: "/enterprise-activities",
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_ACTIVITY_REQUEST_CREATED",
    entity: "EnterpriseActivityRequest",
    entityId: requestRecord.id,
    request: req,
    metadata: { organizationId, blockCode: block.blockCode },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, request: requestRecord }, { status: 201 });
}
