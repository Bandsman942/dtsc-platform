import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { applySectorTemplateToOrganization } from "@/lib/enterprise-sector-templates";
import { canManageClientOrganizations, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseOrganizationCreateSchema } from "@/lib/validators";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "client_organization_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session) || !canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul DTSC peut gérer les entreprises clientes." }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `client-organization-create:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations organisations sur une courte période." }, { status: 429 });
  }

  const parsed = enterpriseOrganizationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations de l'entreprise sont invalides." }, { status: 400 });
  }

  const data = parsed.data;
  const slug = data.slug || slugify(data.name);
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Slug already exists", message: "Ce slug d'entreprise existe déjà." }, { status: 409 });
  }
  if (data.adminUserId) {
    const adminUser = await prisma.user.findFirst({ where: { id: data.adminUserId, status: "ACTIVE" }, select: { id: true } });
    if (!adminUser) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid admin", message: "L'administrateur entreprise sélectionné est introuvable ou inactif." }, { status: 400 });
    }
  }
  if (data.planId) {
    const plan = await prisma.billingPlan.findFirst({ where: { id: data.planId, isActive: true }, select: { id: true } });
    if (!plan) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid plan", message: "Le plan sélectionné est introuvable ou inactif." }, { status: 400 });
    }
  }
  const sector = data.sectorId
    ? await prisma.businessSector.findFirst({ where: { id: data.sectorId, isActive: true }, select: { id: true, code: true, labelFr: true } })
    : null;
  if (data.sectorId && !sector) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid sector", message: "Le secteur d'activité sélectionné est introuvable ou inactif." }, { status: 400 });
  }

  const organization = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: data.name,
        slug,
        status: data.status,
        organizationType: "CLIENT",
        sectorId: sector?.id || null,
        sectorCode: sector?.code || null,
        sector: sector?.labelFr || data.industry || null,
        industry: sector?.labelFr || data.industry || null,
        country: data.country || null,
        city: data.city || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        timezone: data.timezone,
        notes: data.notes || null,
        createdByDtscUserId: session.userId,
      },
    });

    if (data.adminUserId) {
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: created.id, userId: data.adminUserId } },
        update: { role: "ADMIN_ENTREPRISE", status: "ACTIVE", removedAt: null, joinedAt: new Date() },
        create: {
          organizationId: created.id,
          userId: data.adminUserId,
          role: "ADMIN_ENTREPRISE",
          status: "ACTIVE",
          invitedBy: session.userId,
          joinedAt: new Date(),
        },
      });
      await tx.organizationAdminGrant.create({
        data: {
          organizationId: created.id,
          userId: data.adminUserId,
          grantedByDtscUserId: session.userId,
          status: "ACTIVE",
          reason: "Désignation initiale par DTSC",
        },
      });
    }

    if (data.planId) {
      await tx.organizationSubscription.create({
        data: {
          organizationId: created.id,
          planId: data.planId,
          status: "ACTIVE",
          startedAt: new Date(),
          createdByDtscUserId: session.userId,
          updatedByDtscUserId: session.userId,
        },
      });
    }

    return created;
  });

  if (sector && data.applySectorTemplate) {
    await applySectorTemplateToOrganization({
      organizationId: organization.id,
      sectorId: sector.id,
      actorUserId: session.userId,
      mode: "merge",
    });
  }

  await writeAuditLog({ userId: session.userId, action: "CLIENT_ORGANIZATION_CREATED", entity: "Organization", entityId: organization.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, organization }, { status: 201 });
}
