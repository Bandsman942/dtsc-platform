import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireConsoleCapability } from "@/lib/admin-api";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { PAYMENT_METHOD_CODES } from "@/lib/forms/reference-catalog";
import { DTSC_INTERNAL_ORGANIZATION_ID, isDtscInternalSession } from "@/lib/organizations";
import { manualSubscriptionApprovalNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
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
  currency: z.enum(["USD", "CDF", "EUR"]).default("USD"),
  paymentMethod: z.enum(PAYMENT_METHOD_CODES),
  externalReference: z.string().trim().min(3).max(160),
  reason: z.string().trim().min(3).max(500),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["PENDING_VALIDATION", "APPROVED", "REJECTED"]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  focusId: z.string().cuid().optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "Période invalide." });

const requestInclude = {
  user: { select: { id: true, name: true, email: true } },
  organization: { select: { id: true, name: true, email: true } },
  plan: { select: { id: true, name: true, audience: true } },
  requestedBy: { select: { id: true, name: true } },
  validator: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, status: true, emailSentAt: true } },
} satisfies Prisma.ManualSubscriptionPaymentInclude;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ);
  const session = access.session || await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const assignedOnly = Boolean(access.response || !isDtscInternalSession(session));
  if (assignedOnly) {
    const employee = await prisma.user.findFirst({ where: { id: session.userId, status: "ACTIVE", hrcfoEmployee: { is: { status: "ACTIVE" } }, organizationMemberships: { some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null } } }, select: { id: true } });
    if (!employee) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `manual-subscription-payment-list:${session.userId}`), 120, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const filters = listSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  const { search, status, from, to, focusId, pageSize } = filters.data;
  const period = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } : undefined;
  const baseWhere: Prisma.ManualSubscriptionPaymentWhereInput = {
    ...(assignedOnly ? { validatorUserId: session.userId } : {}),
    ...(period ? { requestedAt: period } : {}),
    ...(search ? { OR: [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { organization: { name: { contains: search, mode: "insensitive" } } },
      { plan: { name: { contains: search, mode: "insensitive" } } },
      { requestedBy: { name: { contains: search, mode: "insensitive" } } },
      { externalReference: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const where: Prisma.ManualSubscriptionPaymentWhereInput = { ...baseWhere, ...(status ? { status } : {}) };
  const [total, statusGroups] = await Promise.all([
    prisma.manualSubscriptionPayment.count({ where }),
    prisma.manualSubscriptionPayment.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.data.page, pageCount);
  const [requests, validators, users, organizations, plans] = await Promise.all([
    prisma.manualSubscriptionPayment.findMany({
      where,
      include: requestInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
    }),
    assignedOnly ? Promise.resolve([]) : prisma.user.findMany({ where: { status: "ACTIVE", hrcfoEmployee: { is: { status: "ACTIVE" } } }, select: { id: true, name: true, email: true, jobTitle: true }, orderBy: { name: "asc" }, take: 200 }),
    assignedOnly ? Promise.resolve([]) : prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    assignedOnly ? Promise.resolve([]) : prisma.organization.findMany({ where: { organizationType: "CLIENT", deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    assignedOnly ? Promise.resolve([]) : prisma.billingPlan.findMany({ where: { isActive: true }, select: { id: true, name: true, audience: true, priceUsd: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  // Notification deep links may pin an assigned item on initial load; once the user
  // filters or paginates, the displayed rows must honor the selected criteria.
  if (focusId && page === 1 && !search && !status && !from && !to && !requests.some((request) => request.id === focusId)) {
    const focus = await prisma.manualSubscriptionPayment.findFirst({ where: { id: focusId, ...(assignedOnly ? { validatorUserId: session.userId } : {}) }, include: requestInclude });
    if (focus) requests.unshift(focus);
  }
  const statusCounts = { all: statusGroups.reduce((sum, group) => sum + group._count._all, 0), pending: 0, approved: 0, rejected: 0 };
  for (const group of statusGroups) {
    if (group.status === "PENDING_VALIDATION") statusCounts.pending = group._count._all;
    if (group.status === "APPROVED") statusCounts.approved = group._count._all;
    if (group.status === "REJECTED") statusCounts.rejected = group._count._all;
  }
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { count: requests.length, assignedOnly, page, pageSize } });
  return NextResponse.json({ requests, validators, users, organizations, plans: plans.map((plan) => ({ ...plan, priceUsd: Number(plan.priceUsd) })), assignedOnly, pagination: { page, pageSize, pageCount, total }, statusCounts });
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
  let manualPayment;
  try {
    manualPayment = await prisma.$transaction(async (tx) => {
      // Serialize competing submissions of the same evidence, even with different request IDs.
      const evidenceKey = `${parsed.data.paymentMethod}:${parsed.data.currency}:${parsed.data.externalReference}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${evidenceKey})::bigint)::text`;
      const duplicateEvidence = await tx.manualSubscriptionPayment.findFirst({ where: { paymentMethod: parsed.data.paymentMethod, externalReference: parsed.data.externalReference, currency: parsed.data.currency, status: { not: "REJECTED" } }, select: { idempotencyKey: true } });
      if (duplicateEvidence && duplicateEvidence.idempotencyKey !== idempotencyKey) throw new Error("DUPLICATE_PAYMENT_REFERENCE");
      const current = await tx.manualSubscriptionPayment.upsert({
        where: { idempotencyKey }, update: {},
        create: { idempotencyKey, scope: parsed.data.scope, userId: parsed.data.scope === "PERSONAL" ? parsed.data.targetId : null, organizationId: parsed.data.scope === "ORGANIZATION" ? parsed.data.targetId : null, planId: parsed.data.planId, amount: parsed.data.amount, currency: parsed.data.currency, paymentMethod: parsed.data.paymentMethod, externalReference: parsed.data.externalReference, requestedByUserId: access.session.userId, validatorUserId: parsed.data.validatorUserId, reason: parsed.data.reason },
      });
      if (current.scope !== parsed.data.scope || (current.userId || current.organizationId) !== parsed.data.targetId || current.planId !== parsed.data.planId || current.validatorUserId !== parsed.data.validatorUserId || current.paymentMethod !== parsed.data.paymentMethod || current.currency !== parsed.data.currency || current.externalReference !== parsed.data.externalReference || Number(current.amount) !== parsed.data.amount) throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");
      return current;
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "DUPLICATE_PAYMENT_REFERENCE" || error.message === "IDEMPOTENCY_PAYLOAD_CONFLICT")) return NextResponse.json({ error: error.message, message: error.message === "DUPLICATE_PAYMENT_REFERENCE" ? "Cette référence est déjà associée à une autre demande." : "Cet identifiant de demande a déjà été utilisé avec d'autres informations." }, { status: 409 });
    throw error;
  }
  await writeAuditLog({ userId: access.session.userId, action: "MANUAL_SUBSCRIPTION_PAYMENT_REQUESTED", entity: "ManualSubscriptionPayment", entityId: manualPayment.id, request: req, metadata: { scope: manualPayment.scope, targetId: parsed.data.targetId, planId: plan.id, validatorUserId: validator.id, amount: parsed.data.amount, currency: parsed.data.currency } });
  try {
    await notifyUser({ userId: manualPayment.validatorUserId, title: "Paiement d'abonnement à vérifier", body: "Une demande de paiement manuel attend votre décision dans l'espace Abonnement.", type: "SUBSCRIPTION_PAYMENT_APPROVAL", targetUrl: manualSubscriptionApprovalNotificationTarget(manualPayment.id), idempotencyKey: `manual-subscription:${manualPayment.id}:assigned:${manualPayment.validatorUserId}` });
  } catch {
    await writeApiLog({ request: req, statusCode: 503, userId: access.session.userId, startedAt, metadata: { reasonCode: "APPROVER_NOTIFICATION_PENDING", requestId: manualPayment.id } });
    return NextResponse.json({ error: "APPROVER_NOTIFICATION_PENDING", message: "Demande enregistrée, notification non confirmée. Réessayez avec la même demande sans créer de doublon." }, { status: 503 });
  }
  await writeApiLog({ request: req, statusCode: 201, userId: access.session.userId, startedAt });
  return NextResponse.json({ ok: true, requestId: manualPayment.id }, { status: 201 });
}
