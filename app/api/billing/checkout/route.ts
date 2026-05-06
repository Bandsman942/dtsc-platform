import { NextResponse } from "next/server";
import { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { buildPaymentReference, ensureBillingPlans, getNextBillingPeriod } from "@/lib/billing";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { initiateMaishaPayPayment, getMaishaPayProviderReference, isMaishaPayConfigured } from "@/lib/maishapay";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = checkoutSchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  await ensureBillingPlans();
  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId } }),
    prisma.billingPlan.findUnique({ where: { id: body.data.planId } }),
  ]);

  if (!user || !plan || !plan.isActive) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { planId: body.data.planId } });
    return NextResponse.json({ error: "Plan unavailable" }, { status: 404 });
  }

  if (Number(plan.priceUsd) === 0) {
    const { start, end } = getNextBillingPeriod();
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        dailyMessageLimit: plan.dailyMessageLimit,
        dailyTokenLimit: plan.dailyTokenLimit,
      },
    });
    await writeAuditLog({
      userId: user.id,
      action: "SUBSCRIPTION_ACTIVATED_FREEMIUM",
      entity: "Subscription",
      entityId: subscription.id,
      metadata: { planId: plan.id },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { planId: plan.id, free: true } });
    return NextResponse.json({ ok: true, subscription, free: true });
  }

  if (!isMaishaPayConfigured()) {
    await writeApiLog({ request: req, statusCode: 503, userId: user.id, startedAt, metadata: { planId: plan.id, reason: "MAISHAPAY_MAINTENANCE" } });
    return NextResponse.json(
      {
        error: "Paid subscriptions are temporarily in maintenance",
        code: "MAISHAPAY_MAINTENANCE",
        freePlanAvailable: true,
      },
      { status: 503 }
    );
  }

  if (!body.data.walletId?.trim()) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt, metadata: { planId: plan.id, reason: "MISSING_WALLET_ID" } });
    return NextResponse.json({ error: "Wallet number is required for paid plans" }, { status: 400 });
  }

  const reference = buildPaymentReference(user.id, plan.id);
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      planId: plan.id,
      status: SubscriptionStatus.PENDING_PAYMENT,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      subscriptionId: subscription.id,
      reference,
      amount: plan.priceUsd,
      currency: "USD",
      status: PaymentStatus.PENDING,
    },
  });

  try {
    const maishaPay = await initiateMaishaPayPayment({
      transactionReference: reference,
      amount: Number(plan.priceUsd),
      currency: "USD",
      customerFullName: user.name,
      customerPhoneNumber: user.phone,
      customerEmailAddress: user.email,
      provider: body.data.provider,
      walletId: body.data.walletId,
    });
    const providerReference = getMaishaPayProviderReference(maishaPay.data);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.ACCEPTED,
        providerReference,
        checkoutPayload: JSON.parse(JSON.stringify(maishaPay.data)),
      },
    });
    await writeAuditLog({
      userId: user.id,
      action: "MAISHAPAY_CHECKOUT_CREATED",
      entity: "Payment",
      entityId: payment.id,
      metadata: { reference, planId: plan.id, provider: body.data.provider },
      request: req,
    });

    await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { planId: plan.id, reference } });
    return NextResponse.json({
      ok: true,
      paymentReference: reference,
      providerReference,
      status: "ACCEPTED",
      message: "Confirmez le paiement sur votre téléphone.",
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        checkoutPayload: {
          error: error instanceof Error ? error.message : "MaishaPay request failed",
        },
      },
    });
    await writeApiLog({ request: req, statusCode: 502, userId: user.id, startedAt, metadata: { planId: plan.id, reference } });
    return NextResponse.json({ error: "Unable to initiate online payment" }, { status: 502 });
  }
}
