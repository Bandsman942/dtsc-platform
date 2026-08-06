import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
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
    return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  }
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session) || access.session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: access.session.userId, startedAt, metadata: { action: "billing_plan_update_admin_required" } });
    return NextResponse.json({ error: "Administrator role required", reasonCode: "ADMIN_ROLE_REQUIRED" }, { status: 403 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `billing-plan-update:${access.session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: access.session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", reasonCode: "RATE_LIMITED" }, { status: 429 });
  }
  const parsed = billingPlanUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: access.session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { id } = await params;
  const current = await prisma.billingPlan.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!current) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  if (current.id === "freemium" && (!parsed.data.isActive || parsed.data.priceUsd !== 0)) {
    return NextResponse.json({ error: "Protected free plan", reasonCode: "SYSTEM_PLAN_PROTECTED" }, { status: 409 });
  }

  const effectiveAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    let latestVersion = current.versions[0]?.version || 0;
    if (!latestVersion) {
      await tx.billingPlanVersion.create({ data: { planId: current.id, version: 1, name: current.name, description: current.description, audience: current.audience, priceUsd: current.priceUsd, dailyMessageLimit: current.dailyMessageLimit, dailyTokenLimit: current.dailyTokenLimit, maxDocuments: current.maxDocuments, effectiveAt: current.createdAt, retiredAt: effectiveAt, createdByUserId: access.session.userId, reason: "Initial historical snapshot created before iteration 07 update" } });
      latestVersion = 1;
    } else {
      await tx.billingPlanVersion.updateMany({ where: { planId: current.id, version: latestVersion, retiredAt: null }, data: { retiredAt: effectiveAt } });
    }
    const next = await tx.billingPlan.update({ where: { id }, data: { name: parsed.data.name, description: parsed.data.description, audience: parsed.data.audience, priceUsd: parsed.data.priceUsd, dailyMessageLimit: parsed.data.dailyMessageLimit, dailyTokenLimit: parsed.data.dailyTokenLimit, maxDocuments: parsed.data.maxDocuments, sortOrder: parsed.data.sortOrder, isActive: parsed.data.isActive } });
    await tx.billingPlanVersion.create({ data: { planId: next.id, version: latestVersion + 1, name: next.name, description: next.description, audience: next.audience, priceUsd: next.priceUsd, dailyMessageLimit: next.dailyMessageLimit, dailyTokenLimit: next.dailyTokenLimit, maxDocuments: next.maxDocuments, effectiveAt, createdByUserId: access.session.userId, reason: parsed.data.reason } });
    return next;
  });

  await writeAuditLog({ userId: access.session.userId, action: "BILLING_PLAN_UPDATED", entity: "BillingPlan", entityId: updated.id, before: { name: current.name, audience: current.audience, priceUsd: Number(current.priceUsd), dailyMessageLimit: current.dailyMessageLimit, dailyTokenLimit: current.dailyTokenLimit, maxDocuments: current.maxDocuments, sortOrder: current.sortOrder, isActive: current.isActive }, after: { name: updated.name, audience: updated.audience, priceUsd: Number(updated.priceUsd), dailyMessageLimit: updated.dailyMessageLimit, dailyTokenLimit: updated.dailyTokenLimit, maxDocuments: updated.maxDocuments, sortOrder: updated.sortOrder, isActive: updated.isActive }, reasonCode: access.reasonCode, riskLevel: "HIGH", metadata: { reason: parsed.data.reason, slug: current.slug, effectiveAt: effectiveAt.toISOString(), versioned: true }, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: access.session.userId, startedAt, metadata: { planId: updated.id } });
  return NextResponse.json({ ok: true, planId: updated.id, reasonCode: access.reasonCode });
}
