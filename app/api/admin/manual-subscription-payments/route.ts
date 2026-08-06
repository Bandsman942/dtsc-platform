import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const createSchema = z.object({
  requestId: z.string().trim().min(8).max(120),
  scope: z.enum(["PERSONAL", "ORGANIZATION"]),
  targetId: z.string().cuid(),
  planId: z.string().min(1).max(120),
  validatorUserId: z.string().cuid(),
  amount: z.coerce.number().positive().max(1_000_000),
  currency: z.string().trim().min(3).max(3).default("USD"),
  paymentMethod: z.string().trim().min(2).max(80),
  externalReference: z.string().trim().max(160).optional(),
  reason: z.string().trim().min(3).max(500),
});

export async function GET(req: Request) {
  const startedAt = Date.now();
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [requests, validators, users, organizations, plans] = await Promise.all([
    prisma.manualSubscriptionPayment.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, organization: { select: { id: true, name: true, email: true } }, plan: { select: { id: true, name: true, audience: true } }, requestedBy: { select: { id: true, name: true } }, validator: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true, status: true, emailSentAt: true } } },
      orderBy: [{ status: "asc" }, { requestedAt: "desc" }], take: 200,
    }),
    prisma.user.findMany({ where: { status: "ACTIVE", hrcfoEmployee: { is: { status: "ACTIVE" } } }, select: { id: true, name: true, email: true, jobTitle: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.organization.findMany({ where: { organizationType: "CLIENT", deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.billingPlan.findMany({ where: { isActive: true }, select: { id: true, name: true, audience: true, priceUsd: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: access.session.userId, startedAt, metadata: { count: requests.length } });
  return NextResponse.json({ requests, validators, users, organizations, plans: plans.map((plan) => ({ ...plan, priceUsd: Number(plan.priceUsd) })) });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_MANAGE);
  if (access.response) return access.response;
  if (!isDtscInternalSession(access.session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `manual-subscription-payment:${access.session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Informations du paiement manuel invalides." }, { status: 400 });
  if (parsed.data.validatorUserId === access.session.userId) return NextResponse.json({ error: "SEPARATION_OF_DUTIES", message: "Le demandeur ne peut pas être son propre validateur." }, { status: 409 });
  const [plan, validator, target] = await Promise.all([
    prisma.billingPlan.findFirst({ where: { id: parsed.data.planId, isActive: true, audience: { in: [parsed.data.scope, "BOTH"] } } }),
    prisma.user.findFirst({ where: { id: parsed.data.validatorUserId, status: "ACTIVE", hrcfoEmployee: { is: { status: "ACTIVE" } } }, select: { id: true } }),
    parsed.data.scope === "PERSONAL"
      ? prisma.user.findFirst({ where: { id: parsed.data.targetId, status: "ACTIVE" }, select: { id: true } })
      : prisma.organization.findFirst({ where: { id: parsed.data.targetId, organizationType: "CLIENT", deletedAt: null }, select: { id: true } }),
  ]);
  if (!plan || !validator || !target) return NextResponse.json({ error: "INVALID_REFERENCE", message: "Offre, bénéficiaire ou validateur introuvable." }, { status: 400 });
  const rawKey = `${access.session.userId}:${parsed.data.requestId}`;
  const idempotencyKey = createHash("sha256").update(rawKey).digest("hex");
  const manualPayment = await prisma.manualSubscriptionPayment.upsert({
    where: { idempotencyKey },
    update: {},
    create: { idempotencyKey, scope: parsed.data.scope, userId: parsed.data.scope === "PERSONAL" ? parsed.data.targetId : null, organizationId: parsed.data.scope === "ORGANIZATION" ? parsed.data.targetId : null, planId: parsed.data.planId, amount: parsed.data.amount, currency: parsed.data.currency.toUpperCase(), paymentMethod: parsed.data.paymentMethod, externalReference: parsed.data.externalReference || null, requestedByUserId: access.session.userId, validatorUserId: parsed.data.validatorUserId, reason: parsed.data.reason },
  });
  await writeAuditLog({ userId: access.session.userId, action: "MANUAL_SUBSCRIPTION_PAYMENT_REQUESTED", entity: "ManualSubscriptionPayment", entityId: manualPayment.id, request: req, metadata: { scope: manualPayment.scope, targetId: parsed.data.targetId, planId: plan.id, validatorUserId: validator.id, amount: parsed.data.amount, currency: parsed.data.currency } });
  await writeApiLog({ request: req, statusCode: 201, userId: access.session.userId, startedAt });
  return NextResponse.json({ ok: true, requestId: manualPayment.id }, { status: 201 });
}
