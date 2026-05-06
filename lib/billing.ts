import { InvoiceStatus, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

export const defaultPlanIds = ["freemium", "starter", "growth", "premium"] as const;

export async function ensureBillingPlans() {
  const plans = [
    {
      id: "freemium",
      name: "Découverte",
      slug: "freemium",
      description: "Accès gratuit très limité pour tester DTSC Chatbot.",
      priceUsd: 0,
      dailyMessageLimit: 5,
      dailyTokenLimit: 15000,
      maxDocuments: 0,
      sortOrder: 1,
    },
    {
      id: "starter",
      name: "Essentiel",
      slug: "starter",
      description: "Usage léger pour indépendants et petits besoins de cadrage.",
      priceUsd: 2,
      dailyMessageLimit: 40,
      dailyTokenLimit: 120000,
      maxDocuments: 2,
      sortOrder: 2,
    },
    {
      id: "growth",
      name: "Professionnel",
      slug: "growth",
      description: "Usage régulier pour équipes PME, support et analyse métier.",
      priceUsd: 15,
      dailyMessageLimit: 200,
      dailyTokenLimit: 750000,
      maxDocuments: 20,
      sortOrder: 3,
    },
    {
      id: "premium",
      name: "Entreprise",
      slug: "premium",
      description: "Usage intensif avec plus de capacité documentaire et support prioritaire.",
      priceUsd: 50,
      dailyMessageLimit: 1000,
      dailyTokenLimit: 3000000,
      maxDocuments: 100,
      sortOrder: 4,
    },
  ];

  await Promise.all(
    plans.map((plan) =>
      prisma.billingPlan.upsert({
        where: { id: plan.id },
        update: plan,
        create: plan,
      })
    )
  );

  return prisma.billingPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
}

export function getNextBillingPeriod() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export function buildPaymentReference(userId: string, planId: string) {
  return `DTSC-${planId.toUpperCase()}-${userId.slice(0, 6).toUpperCase()}-${Date.now()}`;
}

export function buildInvoiceNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `DTSC-${date}-${now.getTime().toString().slice(-6)}`;
}

export async function activateSubscriptionFromPayment(paymentReference: string, callbackPayload?: unknown) {
  const payment = await prisma.payment.findUnique({
    where: { reference: paymentReference },
    include: { subscription: { include: { plan: true, user: true } } },
  });

  if (!payment || !payment.subscription) {
    return { ok: false, reason: "PAYMENT_NOT_FOUND" };
  }

  if (payment.status === PaymentStatus.PAID) {
    const existingInvoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } });
    return { ok: true, payment, subscription: payment.subscription, invoice: existingInvoice, mail: { sent: false, reason: "Already processed" } };
  }

  const { start, end } = getNextBillingPeriod();
  const [updatedPayment, subscription] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        callbackPayload: callbackPayload ? JSON.parse(JSON.stringify(callbackPayload)) : undefined,
      },
    }),
    prisma.subscription.update({
      where: { id: payment.subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        user: {
          update: {
            dailyMessageLimit: payment.subscription.plan.dailyMessageLimit,
            dailyTokenLimit: payment.subscription.plan.dailyTokenLimit,
          },
        },
      },
      include: { plan: true, user: true },
    }),
  ]);

  const invoice = await prisma.invoice.create({
    data: {
      number: buildInvoiceNumber(),
      userId: subscription.userId,
      planId: subscription.planId,
      subscriptionId: subscription.id,
      paymentId: updatedPayment.id,
      planName: subscription.plan.name,
      amount: updatedPayment.amount,
      currency: updatedPayment.currency,
      status: InvoiceStatus.PAID,
      paidAt: updatedPayment.paidAt,
    },
    include: { user: true },
  });

  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "Invoice email failed",
  }));

  return { ok: true, payment: updatedPayment, subscription, invoice, mail };
}

export async function sendInvoiceEmail(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { user: true, plan: true, payment: true },
  });

  if (!invoice) {
    return { sent: false, reason: "Invoice not found" };
  }

  const amount = Number(invoice.amount).toFixed(2);
  const message = [
    `Bonjour ${invoice.user.name},`,
    "",
    "Votre paiement DTSC Platform a été confirmé. Vous trouverez ci-dessous le résumé de votre facture.",
    "",
    `Facture: ${invoice.number}`,
    `Plan: ${invoice.planName}`,
    `Montant: ${amount} ${invoice.currency}`,
    `Statut: ${invoice.status}`,
    `Date de paiement: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fr-FR") : "Non renseignée"}`,
    `Référence paiement: ${invoice.payment?.reference || "Non renseignée"}`,
    "",
    "Merci pour votre confiance.",
    "Equipe DTSC",
  ].join("\n");

  const mail = await sendZohoOutboundMail({
    deliveryMode: "direct",
    subject: `Facture DTSC ${invoice.number}`,
    to: [invoice.user.email],
    heading: "Facture DTSC Platform",
    source: "invoice",
    message,
  });

  if (mail.sent) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { emailSentAt: new Date() },
    });
  }

  return mail;
}
