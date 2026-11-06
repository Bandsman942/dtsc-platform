import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { adminNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ scope: z.enum(["PERSONAL", "ORGANIZATION"]) }).strict();

/** A renewal request is an auditable support workflow, never an unmandated recurring charge. */
export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `saas-renewal:${session.userId}`), 8, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const organizationId = parsed.data.scope === "ORGANIZATION" ? getActiveOrganizationId(session) : null;
  if (parsed.data.scope === "ORGANIZATION") {
    if (!organizationId) return NextResponse.json({ error: "ORGANIZATION_CONTEXT_REQUIRED" }, { status: 400 });
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN"] } }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "ORGANIZATION_ADMIN_REQUIRED" }, { status: 403 });
  }
  const scopeKey = organizationId || session.userId;
  const subject = `Renouvellement abonnement DTSC · ${parsed.data.scope} · ${scopeKey}`;
  const latest = parsed.data.scope === "PERSONAL"
    ? await prisma.subscription.findFirst({ where: { userId: session.userId, plan: { priceUsd: { gt: 0 } }, payments: { some: { status: "PAID" } } }, orderBy: { createdAt: "desc" }, include: { plan: true } })
    : await prisma.organizationSubscription.findFirst({ where: { organizationId: organizationId!, plan: { priceUsd: { gt: 0 } }, payments: { some: { status: "PAID" } } }, orderBy: { createdAt: "desc" }, include: { plan: true } });
  if (!latest) return NextResponse.json({ error: "PAID_SUBSCRIPTION_REQUIRED", message: "Aucun abonnement payant à renouveler n'a été trouvé." }, { status: 404 });
  const expiry = "currentPeriodEnd" in latest ? latest.currentPeriodEnd : latest.expiresAt;
  const { ticket, existing } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${subject})::bigint)::text`;
    const previous = await tx.supportTicket.findFirst({ where: { source: "SAAS_SUBSCRIPTION_RENEWAL", subject, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" } });
    if (previous) return { ticket: previous, existing: true };
    const created = await tx.supportTicket.create({ data: {
      userId: session.userId,
      organizationId,
      source: "SAAS_SUBSCRIPTION_RENEWAL",
      category: "BILLING",
      subject,
      description: `Demande expresse de renouvellement ${parsed.data.scope === "PERSONAL" ? "personnel" : "entreprise"} de l'offre ${latest.plan.name} (${latest.planId}). Expiration enregistrée : ${expiry?.toISOString() || "non renseignée"}. Contacter le demandeur pour proposer un règlement contrôlé ; ne pas prélever automatiquement sans mandat explicite valide.`,
      priority: "HIGH",
    } });
    return { ticket: created, existing: false };
  });
  let notificationPending = false;
  const administrators = await prisma.user.findMany({ where: { status: "ACTIVE", organizationMemberships: { some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null } }, OR: [{ role: "ADMIN" }, { hrcfoEmployee: { is: { status: "ACTIVE" } } }] }, select: { id: true }, take: 15 });
  for (const administrator of administrators) {
    try {
      await notifyUser({ userId: administrator.id, type: "SUBSCRIPTION_RENEWAL", title: "Demande de renouvellement SaaS", body: `Renouvellement de ${latest.plan.name} demandé par un abonné.`, targetUrl: adminNotificationTarget("support", ticket.id), idempotencyKey: `saas-renewal:${ticket.id}:${administrator.id}` });
    } catch { notificationPending = true; }
  }
  if (!existing) {
    await writeAuditLog({ userId: session.userId, action: "SUBSCRIPTION_RENEWAL_REQUESTED", entity: "SupportTicket", entityId: ticket.id, request: req, metadata: { scope: parsed.data.scope, organizationId, planId: latest.planId } });
  }
  await writeApiLog({ request: req, statusCode: existing ? 200 : 201, userId: session.userId, startedAt, metadata: { ticketId: ticket.id, duplicate: Boolean(existing), notificationPending } });
  return NextResponse.json({ ok: true, ticketId: ticket.id, existing: Boolean(existing), notificationPending, canViewInSupport: ticket.userId === session.userId }, { status: existing ? 200 : 201 });
}
