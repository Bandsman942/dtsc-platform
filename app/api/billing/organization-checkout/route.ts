import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureBillingPlans } from "@/lib/billing";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getMaishaPayProviderReference, initiateMaishaPayPayment, isMaishaPayConfigured } from "@/lib/maishapay";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const schema = z.object({ planId: z.string().min(1).max(120), walletId: z.string().trim().min(6).max(40), provider: z.enum(["MPESA", "AIRTEL", "ORANGE"]).default("MPESA"), requestId: z.string().trim().min(8).max(120) }).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const organizationId = getActiveOrganizationId(session);
  if (!organizationId) return NextResponse.json({ error: "ORGANIZATION_CONTEXT_REQUIRED", message: "Activez d’abord le contexte de l’entreprise." }, { status: 400 });
  const membership = await prisma.organizationMember.findFirst({ where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN"] } }, select: { id: true } });
  if (!membership) return NextResponse.json({ error: "ORGANIZATION_ADMIN_REQUIRED", message: "Seul un administrateur de l’entreprise peut lancer ce paiement." }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `organization-checkout:${organizationId}:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Informations de paiement invalides." }, { status: 400 });
  if (!isMaishaPayConfigured()) return NextResponse.json({ error: "MAISHAPAY_MAINTENANCE", message: "Le paiement en ligne est momentanément indisponible." }, { status: 503 });
  await ensureBillingPlans();
  const [organization, user, plan] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, email: true } }),
    prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, phone: true, email: true } }),
    prisma.billingPlan.findFirst({ where: { id: parsed.data.planId, isActive: true, audience: { in: ["ORGANIZATION", "BOTH"] } } }),
  ]);
  if (!organization || !user || !plan) return NextResponse.json({ error: "REFERENCE_NOT_FOUND", message: "Entreprise ou offre indisponible." }, { status: 404 });
  if (Number(plan.priceUsd) <= 0) return NextResponse.json({ error: "PAID_PLAN_REQUIRED", message: "Sélectionnez une offre entreprise payante." }, { status: 400 });

  const requestDigest = createHash("sha256").update(`${organization.id}:${plan.id}:${parsed.data.requestId}`).digest("hex").slice(0, 32).toUpperCase();
  const reference = `DTSC-ORG-${organization.id.slice(0, 8).toUpperCase()}-${plan.id.slice(0, 12).toUpperCase()}-${requestDigest}`;
  let pending = await prisma.payment.findUnique({ where: { reference }, include: { organizationSubscription: true } });
  if (!pending) {
    try {
      pending = await prisma.$transaction(async (tx) => {
        const subscription = await tx.organizationSubscription.create({ data: { organizationId, planId: plan.id, status: "PENDING_PAYMENT", createdByDtscUserId: session.userId, updatedByDtscUserId: session.userId } });
        return tx.payment.create({ data: { userId: session.userId, organizationId, organizationSubscriptionId: subscription.id, provider: "MAISHAPAY", reference, amount: plan.priceUsd, currency: "USD", status: PaymentStatus.PENDING }, include: { organizationSubscription: true } });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      pending = await prisma.payment.findUnique({ where: { reference }, include: { organizationSubscription: true } });
    }
  }
  if (!pending?.organizationSubscription) return NextResponse.json({ error: "CHECKOUT_STATE_INVALID", message: "État de paiement introuvable." }, { status: 409 });
  if ([PaymentStatus.ACCEPTED, PaymentStatus.PAID].includes(pending.status)) {
    return NextResponse.json({ ok: true, unchanged: true, paymentReference: reference, providerReference: pending.providerReference, status: pending.status, message: pending.status === PaymentStatus.PAID ? "Paiement déjà confirmé." : "Paiement déjà initié. Confirmez-le sur votre téléphone." });
  }

  if (pending.status === PaymentStatus.FAILED || pending.status === PaymentStatus.CANCELED || pending.organizationSubscription.status === "CANCELED") {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: pending.id }, data: { status: PaymentStatus.PENDING, providerReference: null, checkoutPayload: Prisma.JsonNull } }),
      prisma.organizationSubscription.update({ where: { id: pending.organizationSubscription.id }, data: { status: "PENDING_PAYMENT", updatedByDtscUserId: session.userId } }),
    ]);
  }

  try {
    const maishaPay = await initiateMaishaPayPayment({ transactionReference: reference, amount: Number(plan.priceUsd), currency: "USD", customerFullName: organization.name, customerPhoneNumber: user.phone, customerEmailAddress: organization.email || user.email, provider: parsed.data.provider, walletId: parsed.data.walletId });
    const providerReference = getMaishaPayProviderReference(maishaPay.data);
    await prisma.payment.update({ where: { id: pending.id }, data: { status: PaymentStatus.ACCEPTED, providerReference, checkoutPayload: JSON.parse(JSON.stringify(maishaPay.data)) } });
    await writeAuditLog({ userId: session.userId, action: "ORGANIZATION_SUBSCRIPTION_CHECKOUT_CREATED", entity: "Payment", entityId: pending.id, request: req, metadata: { organizationId, planId: plan.id, reference } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, planId: plan.id, reference } });
    return NextResponse.json({ ok: true, paymentReference: reference, providerReference, status: "ACCEPTED", message: "Confirmez le paiement sur votre téléphone." });
  } catch (error) {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: pending.id }, data: { status: PaymentStatus.FAILED, checkoutPayload: { error: error instanceof Error ? error.message : "MaishaPay request failed" } } }),
      prisma.organizationSubscription.update({ where: { id: pending.organizationSubscription.id }, data: { status: "CANCELED" } }),
    ]);
    await writeApiLog({ request: req, statusCode: 502, userId: session.userId, startedAt, metadata: { organizationId, planId: plan.id, reference } });
    return NextResponse.json({ error: "PAYMENT_PROVIDER_ERROR", message: "Impossible de lancer le paiement en ligne." }, { status: 502 });
  }
}
