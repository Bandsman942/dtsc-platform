import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { applySectorTemplateToOrganization } from "@/lib/enterprise-sector-templates";
import { canManageClientOrganizations } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { enterpriseOrganizationUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul DTSC peut gérer les entreprises clientes." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = enterpriseOrganizationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const organization = await prisma.organization.findFirst({ where: { id, deletedAt: null } });
  if (!organization || organization.organizationType === "DTSC_INTERNAL") {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.action === "grant_admin") {
    if (!data.userId) {
      return NextResponse.json({ error: "Missing user" }, { status: 400 });
    }
    const targetUserId = data.userId;
    const targetUser = await prisma.user.findFirst({ where: { id: targetUserId, status: "ACTIVE" }, select: { id: true } });
    if (!targetUser) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid user", message: "L'utilisateur sélectionné est introuvable ou inactif." }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: id, userId: targetUserId } },
        update: { role: "ADMIN_ENTREPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
        create: {
          organizationId: id,
          userId: targetUserId,
          role: "ADMIN_ENTREPRISE",
          status: "ACTIVE",
          invitedBy: session.userId,
          joinedAt: new Date(),
        },
      });
      await tx.organizationAdminGrant.create({
        data: {
          organizationId: id,
          userId: targetUserId,
          grantedByDtscUserId: session.userId,
          status: "ACTIVE",
          reason: data.reason || "Attribution par DTSC",
        },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "CLIENT_ORGANIZATION_ADMIN_GRANTED", entity: "Organization", entityId: id, request: req, metadata: { userId: targetUserId } });
  } else if (data.action === "revoke_admin") {
    if (!data.userId) {
      return NextResponse.json({ error: "Missing user" }, { status: 400 });
    }
    const targetUserId = data.userId;
    await prisma.$transaction(async (tx) => {
      await tx.organizationAdminGrant.updateMany({
        where: { organizationId: id, userId: targetUserId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date(), reason: data.reason || "Retrait par DTSC" },
      });
      await tx.organizationMember.updateMany({
        where: { organizationId: id, userId: targetUserId, role: "ADMIN_ENTREPRISE" },
        data: { role: "MEMBER" },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "CLIENT_ORGANIZATION_ADMIN_REVOKED", entity: "Organization", entityId: id, request: req, metadata: { userId: targetUserId } });
  } else if (data.action === "apply_sector_template") {
    const sectorId = data.sectorId || organization.sectorId;
    if (!sectorId) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Missing sector", message: "Choisissez un secteur avant d'appliquer un modèle sectoriel." }, { status: 400 });
    }
    const result = await applySectorTemplateToOrganization({
      organizationId: id,
      sectorId,
      actorUserId: session.userId,
      mode: data.templateMode,
    });
    await writeAuditLog({
      userId: session.userId,
      action: "CLIENT_ORGANIZATION_SECTOR_TEMPLATE_APPLIED",
      entity: "Organization",
      entityId: id,
      request: req,
      metadata: result,
    });
  } else {
    const sector = data.sectorId
      ? await prisma.businessSector.findFirst({ where: { id: data.sectorId, isActive: true }, select: { id: true, code: true, labelFr: true } })
      : null;
    if (data.sectorId && !sector) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid sector", message: "Le secteur d'activité sélectionné est introuvable ou inactif." }, { status: 400 });
    }
    await prisma.organization.update({
      where: { id },
      data: data.action === "set_status"
        ? { status: data.status || organization.status }
        : {
            name: data.name || organization.name,
            sectorId: data.sectorId ? sector?.id || null : organization.sectorId,
            sectorCode: data.sectorId ? sector?.code || null : organization.sectorCode,
            sector: data.sectorId ? sector?.labelFr || null : data.industry ?? organization.sector,
            industry: data.sectorId ? sector?.labelFr || null : data.industry ?? organization.industry,
            country: data.country ?? organization.country,
            city: data.city ?? organization.city,
            email: data.email ?? organization.email,
            phone: data.phone ?? organization.phone,
            address: data.address ?? organization.address,
            timezone: data.timezone || organization.timezone,
          },
    });
    await writeAuditLog({ userId: session.userId, action: data.action === "set_status" ? "CLIENT_ORGANIZATION_STATUS_CHANGED" : "CLIENT_ORGANIZATION_UPDATED", entity: "Organization", entityId: id, request: req, metadata: { status: data.status } });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
