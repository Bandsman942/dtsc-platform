import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { applySectorTemplateToOrganization } from "@/lib/enterprise-sector-templates";
import { canManageClientOrganizations, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseOrganizationUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function parseOptionalDate(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "client_organization_update_origin_denied" } });
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
  const limited = await rateLimit(getRateLimitKey(req, `client-organization-update:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations organisations sur une courte période." }, { status: 429 });
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
  } else if (data.action === "update_subscription") {
    const latestSubscription = await prisma.organizationSubscription.findFirst({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, planId: true },
    });
    const planId = data.planId || latestSubscription?.planId;
    if (!planId) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Missing plan", message: "Choisissez un plan avant de modifier l'abonnement." }, { status: 400 });
    }
    const plan = await prisma.billingPlan.findFirst({ where: { id: planId, isActive: true }, select: { id: true } });
    if (!plan) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid plan", message: "Le plan sélectionné est introuvable ou inactif." }, { status: 400 });
    }
    const subscriptionData = {
      planId,
      status: data.subscriptionStatus || "ACTIVE",
      startedAt: parseOptionalDate(data.startedAt) || new Date(),
      expiresAt: parseOptionalDate(data.expiresAt),
      trialEndsAt: parseOptionalDate(data.trialEndsAt),
      updatedByDtscUserId: session.userId,
    };
    const subscription = latestSubscription
      ? await prisma.organizationSubscription.update({
          where: { id: latestSubscription.id },
          data: subscriptionData,
        })
      : await prisma.organizationSubscription.create({
          data: {
            organizationId: id,
            createdByDtscUserId: session.userId,
            ...subscriptionData,
          },
        });
    await writeAuditLog({
      userId: session.userId,
      action: "CLIENT_ORGANIZATION_SUBSCRIPTION_UPDATED",
      entity: "OrganizationSubscription",
      entityId: subscription.id,
      request: req,
      metadata: { organizationId: id, planId, status: subscription.status },
    });
  } else if (data.action === "soft_delete") {
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { status: "ARCHIVED", deletedAt: new Date(), notes: data.reason || organization.notes },
      });
      await tx.organizationSubscription.updateMany({
        where: { organizationId: id, status: { in: ["ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "TRIAL", "SUSPENDED"] } },
        data: { status: "CANCELED", expiresAt: new Date(), updatedByDtscUserId: session.userId },
      });
    });
    await writeAuditLog({
      userId: session.userId,
      action: "CLIENT_ORGANIZATION_SOFT_DELETED",
      entity: "Organization",
      entityId: id,
      request: req,
      metadata: { reason: data.reason || null },
    });
  } else {
    const sector = data.sectorId
      ? await prisma.businessSector.findFirst({ where: { id: data.sectorId, isActive: true }, select: { id: true, code: true, labelFr: true } })
      : null;
    if (data.sectorId && !sector) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid sector", message: "Le secteur d'activité sélectionné est introuvable ou inactif." }, { status: 400 });
    }
    const nextSlug = data.slug || organization.slug;
    if (nextSlug && nextSlug !== organization.slug) {
      const existingSlug = await prisma.organization.findFirst({
        where: { slug: nextSlug, id: { not: id }, deletedAt: null },
        select: { id: true },
      });
      if (existingSlug) {
        await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
        return NextResponse.json({ error: "Slug already exists", message: "Ce slug d'entreprise existe déjà." }, { status: 409 });
      }
    }
    await prisma.organization.update({
      where: { id },
      data: data.action === "set_status"
        ? { status: data.status || organization.status }
        : {
            name: data.name || organization.name,
            slug: nextSlug,
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
            notes: data.notes ?? organization.notes,
            status: data.status || organization.status,
          },
    });
    await writeAuditLog({ userId: session.userId, action: data.action === "set_status" ? "CLIENT_ORGANIZATION_STATUS_CHANGED" : "CLIENT_ORGANIZATION_UPDATED", entity: "Organization", entityId: id, request: req, metadata: { status: data.status } });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
