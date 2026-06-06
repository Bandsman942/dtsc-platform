import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageClientOrganizations, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { organizationSubscriptionUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "organization_subscription_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session) || !canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul DTSC peut gérer les abonnements clients." }, { status: 403 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `organization-subscription-update:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations d'abonnement sur une courte période." }, { status: 429 });
  }

  const parsed = organizationSubscriptionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations de l'abonnement sont invalides." }, { status: 400 });
  }

  const { id } = await params;
  const current = await prisma.organizationSubscription.findFirst({
    where: { id, organization: { organizationType: "CLIENT", deletedAt: null } },
    include: { plan: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } },
  });
  if (!current) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Abonnement introuvable." }, { status: 404 });
  }
  const latestSubscription = await prisma.organizationSubscription.findFirst({
    where: { organizationId: current.organizationId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (latestSubscription?.id !== current.id) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Historical subscription", message: "Une période historique est immuable. Gérez uniquement l'abonnement courant." }, { status: 409 });
  }

  const data = parsed.data;
  if (data.action === "start_trial" && !parseOptionalDate(data.trialEndsAt)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Missing trial end", message: "Une date de fin d'essai valide est obligatoire." }, { status: 400 });
  }
  const planId = data.planId || current.planId;
  const plan = await prisma.billingPlan.findFirst({ where: { id: planId, isActive: true }, select: { id: true, name: true } });
  if (!plan) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid plan", message: "Le plan sélectionné est introuvable ou inactif." }, { status: 400 });
  }

  const now = new Date();
  const commonData = { updatedByDtscUserId: session.userId };
  let auditAction = "ORGANIZATION_SUBSCRIPTION_UPDATED";
  let subscriptionId = current.id;

  if (data.action === "renew") {
    const renewed = await prisma.$transaction(async (tx) => {
      await tx.organizationSubscription.update({
        where: { id: current.id },
        data: { status: "EXPIRED", expiresAt: now, ...commonData },
      });
      return tx.organizationSubscription.create({
        data: {
          organizationId: current.organizationId,
          planId,
          status: data.status || "ACTIVE",
          startedAt: parseOptionalDate(data.startedAt) || now,
          expiresAt: parseOptionalDate(data.expiresAt),
          trialEndsAt: parseOptionalDate(data.trialEndsAt),
          createdByDtscUserId: session.userId,
          ...commonData,
        },
      });
    });
    subscriptionId = renewed.id;
    auditAction = "ORGANIZATION_SUBSCRIPTION_RENEWED";
  } else {
    const lifecycleData = data.action === "activate"
      ? { status: "ACTIVE", startedAt: current.startedAt || now }
      : data.action === "start_trial"
        ? { status: "TRIAL", startedAt: current.startedAt || now, trialEndsAt: parseOptionalDate(data.trialEndsAt) }
        : data.action === "suspend"
          ? { status: "SUSPENDED" }
          : data.action === "mark_past_due"
            ? { status: "PAST_DUE" }
            : data.action === "cancel"
              ? { status: "CANCELED", expiresAt: now }
              : data.action === "expire"
                ? { status: "EXPIRED", expiresAt: now }
                : {
                    planId,
                    status: data.status || current.status,
                    startedAt: parseOptionalDate(data.startedAt),
                    expiresAt: parseOptionalDate(data.expiresAt),
                    trialEndsAt: parseOptionalDate(data.trialEndsAt),
                  };
    await prisma.organizationSubscription.update({ where: { id: current.id }, data: { ...lifecycleData, ...commonData } });
    auditAction = `ORGANIZATION_SUBSCRIPTION_${data.action.toUpperCase()}`;
  }

  await writeAuditLog({
    userId: session.userId,
    action: auditAction,
    entity: "OrganizationSubscription",
    entityId: subscriptionId,
    request: req,
    metadata: {
      previousSubscriptionId: current.id,
      organizationId: current.organizationId,
      organizationName: current.organization.name,
      previousPlanId: current.planId,
      planId,
      planName: plan.name,
      previousStatus: current.status,
      requestedStatus: data.status || null,
      reason: data.reason,
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: data.action, subscriptionId } });
  return NextResponse.json({ ok: true, subscriptionId });
}
