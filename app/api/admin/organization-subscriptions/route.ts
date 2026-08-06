import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { canManageClientOrganizations, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { organizationSubscriptionCreateSchema } from "@/lib/validators";

const LIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "TRIAL"];

function parseOptionalDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "organization_subscription_create_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session) || !canManageClientOrganizations(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seule l’administration DTSC peut gérer les abonnements clients." }, { status: 403 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `organization-subscription-create:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications d’abonnement ont été demandées. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const parsed = organizationSubscriptionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations de l’abonnement sont incomplètes ou invalides." }, { status: 400 });
  }

  const [organization, plan, liveSubscription] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: parsed.data.organizationId, organizationType: "CLIENT", deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.billingPlan.findFirst({ where: { id: parsed.data.planId, isActive: true, audience: { in: ["ORGANIZATION", "BOTH"] } }, select: { id: true, name: true } }),
    prisma.organizationSubscription.findFirst({
      where: { organizationId: parsed.data.organizationId, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);

  if (!organization || !plan) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid reference", message: "L’entreprise ou l’offre sélectionnée est introuvable." }, { status: 400 });
  }
  if (liveSubscription) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Active subscription exists", message: "Cette entreprise possède déjà un abonnement courant. Modifiez-le ou renouvelez-le." }, { status: 409 });
  }

  const subscription = await prisma.organizationSubscription.create({
    data: {
      organizationId: organization.id,
      planId: plan.id,
      status: parsed.data.status,
      startedAt: parseOptionalDate(parsed.data.startedAt) || new Date(),
      expiresAt: parseOptionalDate(parsed.data.expiresAt),
      trialEndsAt: parseOptionalDate(parsed.data.trialEndsAt),
      createdByDtscUserId: session.userId,
      updatedByDtscUserId: session.userId,
    },
  });
  const moduleReconciliation = await reconcileOrganizationModulesWithSubscription(organization.id);

  await writeAuditLog({
    userId: session.userId,
    action: "ORGANIZATION_SUBSCRIPTION_CREATED",
    entity: "OrganizationSubscription",
    entityId: subscription.id,
    request: req,
    metadata: {
      organizationId: organization.id,
      organizationName: organization.name,
      planId: plan.id,
      planName: plan.name,
      status: subscription.status,
      reason: parsed.data.reason,
      enabledModuleCount: moduleReconciliation.enabledModuleCodes.length,
    },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { subscriptionId: subscription.id } });
  return NextResponse.json({ ok: true, subscriptionId: subscription.id, modulesAligned: moduleReconciliation.enabledModuleCodes.length }, { status: 201 });
}
