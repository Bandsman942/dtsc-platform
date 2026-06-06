import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { billingPlanUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "billing_plan_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session) || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Seul un administrateur DTSC peut modifier les plans et tarifs." }, { status: 403 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `billing-plan-update:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications tarifaires sur une courte période." }, { status: 429 });
  }

  const parsed = billingPlanUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les informations du plan sont invalides." }, { status: 400 });
  }

  const { id } = await params;
  const current = await prisma.billingPlan.findUnique({ where: { id } });
  if (!current) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Plan introuvable." }, { status: 404 });
  }
  if (current.id === "freemium" && !parsed.data.isActive) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Free plan required", message: "Le plan gratuit Découverte doit rester actif pour les inscriptions et le fallback de paiement." }, { status: 409 });
  }
  if (current.id === "freemium" && parsed.data.priceUsd !== 0) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Free plan price required", message: "Le plan Découverte doit conserver un prix de 0 USD. Modifiez un plan payant pour changer la tarification." }, { status: 409 });
  }

  const updated = await prisma.billingPlan.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      priceUsd: parsed.data.priceUsd,
      dailyMessageLimit: parsed.data.dailyMessageLimit,
      dailyTokenLimit: parsed.data.dailyTokenLimit,
      maxDocuments: parsed.data.maxDocuments,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "BILLING_PLAN_UPDATED",
    entity: "BillingPlan",
    entityId: updated.id,
    request: req,
    metadata: {
      reason: parsed.data.reason,
      slug: current.slug,
      previous: {
        name: current.name,
        priceUsd: Number(current.priceUsd),
        dailyMessageLimit: current.dailyMessageLimit,
        dailyTokenLimit: current.dailyTokenLimit,
        maxDocuments: current.maxDocuments,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
      },
      next: {
        name: updated.name,
        priceUsd: Number(updated.priceUsd),
        dailyMessageLimit: updated.dailyMessageLimit,
        dailyTokenLimit: updated.dailyTokenLimit,
        maxDocuments: updated.maxDocuments,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
      },
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { planId: updated.id } });
  return NextResponse.json({ ok: true, planId: updated.id });
}
