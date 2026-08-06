import { InvoiceStatus, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSubscriptionIncomeTransaction } from "@/lib/hr-cfo-finance";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

export const defaultPlanIds = ["freemium", "starter", "growth", "premium"] as const;

export async function ensureBillingPlans() {
  const plans = [
    {
      id: "freemium",
      name: "Découverte",
      slug: "freemium",
      description: "Accès gratuit très limité pour tester DTSC Chatbot.",
      audience: "PERSONAL",
      priceUsd: 0,
      dailyMessageLimit: 5,
      dailyTokenLimit: 15000,
      maxDocuments: 1,
      sortOrder: 1,
    },
    {
      id: "starter",
      name: "Essentiel",
      slug: "starter",
      description: "Usage léger pour indépendants et petits besoins de cadrage.",
      audience: "PERSONAL",
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
      audience: "PERSONAL",
      priceUsd: 15,
      dailyMessageLimit: 200,
      dailyTokenLimit: 750000,
      maxDocuments: 20,
      sortOrder: 3,
    },
    {
      id: "premium",
      name: "Entreprise personnelle",
      slug: "premium",
      description: "Usage intensif individuel avec plus de capacité documentaire et support prioritaire.",
      audience: "PERSONAL",
      priceUsd: 50,
      dailyMessageLimit: 1000,
      dailyTokenLimit: 3000000,
      maxDocuments: 100,
      sortOrder: 4,
    },
    {
      id: "org-starter",
      name: "Entreprise Essentielle",
      slug: "org-starter",
      description: "Socle professionnel pour une petite entreprise et ses premiers modules DTSC.",
      audience: "ORGANIZATION",
      priceUsd: 25,
      dailyMessageLimit: 500,
      dailyTokenLimit: 1500000,
      maxDocuments: 50,
      sortOrder: 10,
    },
    {
      id: "org-growth",
      name: "Entreprise Croissance",
      slug: "org-growth",
      description: "Capacités étendues pour une entreprise en croissance, ses équipes et ses opérations.",
      audience: "ORGANIZATION",
      priceUsd: 75,
      dailyMessageLimit: 2000,
      dailyTokenLimit: 6000000,
      maxDocuments: 250,
      sortOrder: 11,
    },
    {
      id: "org-premium",
      name: "Entreprise Premium",
      slug: "org-premium",
      description: "Offre organisation avancée avec capacités renforcées, gouvernance et support prioritaire.",
      audience: "ORGANIZATION",
      priceUsd: 180,
      dailyMessageLimit: 10000,
      dailyTokenLimit: 30000000,
      maxDocuments: 1000,
      sortOrder: 12,
    },
  ];

  await prisma.billingPlan.createMany({
    data: plans,
    skipDuplicates: true,
  });

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
    include: { subscription: { include: { plan: true, user: true } }, organizationSubscription: true },
  });

  if (payment?.organizationSubscriptionId) {
    const { activateOrganizationSubscriptionFromPayment } = await import("@/lib/subscription-payments");
    return activateOrganizationSubscriptionFromPayment(paymentReference, callbackPayload);
  }
  if (!payment || !payment.subscription) {
    return { ok: false, reason: "PAYMENT_NOT_FOUND" };
  }

  if (payment.status === PaymentStatus.PAID) {
    const existingInvoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } });
    const incomeTransaction = await createSubscriptionIncomeTransaction(payment.id).catch(() => null);
    if (existingInvoice && incomeTransaction && !existingInvoice.hrcfoTransactionId) {
      await prisma.invoice.update({
        where: { id: existingInvoice.id },
        data: { hrcfoTransactionId: incomeTransaction.id },
      });
    }
    return { ok: true, payment, subscription: payment.subscription, invoice: existingInvoice, mail: { sent: false, reason: "Already processed" }, incomeTransaction };
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
      category: "PERSONAL_SUBSCRIPTION",
      recipientEmail: subscription.user.email,
      planName: subscription.plan.name,
      amount: updatedPayment.amount,
      currency: updatedPayment.currency,
      status: InvoiceStatus.PAID,
      paidAt: updatedPayment.paidAt,
    },
    include: { user: true },
  });

  const incomeTransaction = await createSubscriptionIncomeTransaction(updatedPayment.id).catch(() => null);
  if (incomeTransaction) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { hrcfoTransactionId: incomeTransaction.id },
    });
  }

  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "Invoice email failed",
  }));

  return { ok: true, payment: updatedPayment, subscription, invoice, mail, incomeTransaction };
}

export async function resolveOrganizationInvoiceRecipient(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      email: true,
      ownerUserId: true,
      members: {
        where: { status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN"] }, user: { status: "ACTIVE" } },
        select: { userId: true, user: { select: { email: true } } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        take: 20,
      },
    },
  });
  if (!organization) return null;
  const fallbackOwner = organization.ownerUserId
    ? await prisma.user.findFirst({ where: { id: organization.ownerUserId, status: "ACTIVE" }, select: { id: true, email: true } })
    : null;
  const userId = organization.members[0]?.userId || fallbackOwner?.id;
  if (!userId) return null;
  const emails = [...new Set([organization.email, ...organization.members.map((member) => member.user.email), fallbackOwner?.email].filter((value): value is string => Boolean(value?.trim())).map((value) => value.toLowerCase()))];
  return emails.length ? { userId, emails } : null;
}

export async function sendInvoiceEmail(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { user: true, plan: true, payment: true, organization: true },
  });

  if (!invoice) return { sent: false, reason: "Invoice not found" };
  if (invoice.emailSentAt) return { sent: true, skipped: true, reason: "Invoice email already sent" };
  const organizationRecipient = invoice.organizationId ? await resolveOrganizationInvoiceRecipient(invoice.organizationId) : null;
  const recipients = organizationRecipient?.emails.length
    ? organizationRecipient.emails
    : [invoice.recipientEmail || invoice.user.email].filter(Boolean);
  if (!recipients.length) return { sent: false, reason: "Invoice recipient not found" };

  const amount = Number(invoice.amount).toFixed(2);
  const addressee = invoice.organization?.name || invoice.user.name;
  const scopeLabel = invoice.category === "ORGANIZATION_SUBSCRIPTION" ? "Abonnement entreprise" : "Abonnement personnel";
  const message = [
    `Bonjour ${addressee},`,
    "",
    "Votre paiement DTSC Platform a été confirmé. Vous trouverez ci-dessous le résumé de votre facture.",
    "",
    `Facture: ${invoice.number}`,
    `Type: ${scopeLabel}`,
    `Plan: ${invoice.planName}`,
    `Montant: ${amount} ${invoice.currency}`,
    `Statut: ${invoice.status}`,
    `Date de paiement: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fr-FR") : "Non renseignée"}`,
    `Référence paiement: ${invoice.payment?.reference || "Paiement manuel validé"}`,
    "",
    "Merci pour votre confiance.",
    "Equipe DTSC",
  ].join("\n");

  const mail = await sendZohoOutboundMail({
    deliveryMode: "direct",
    subject: `Facture DTSC ${invoice.number}`,
    to: recipients,
    heading: "Facture DTSC Platform",
    source: "invoice",
    message,
  });
  if (mail.sent) await prisma.invoice.update({ where: { id: invoice.id }, data: { emailSentAt: new Date(), recipientEmail: recipients[0] } });
  return mail;
}
