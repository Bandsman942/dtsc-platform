import { InvoiceStatus, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSubscriptionIncomeTransaction } from "@/lib/hr-cfo-finance";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";

export const defaultPlanIds = ["freemium", "starter", "growth", "premium", "enterprise-starter", "enterprise-business", "enterprise-premium"] as const;

export async function ensureBillingPlans() {
  const plans = [
    { id: "freemium", name: "Découverte", slug: "freemium", description: "Accès gratuit très limité pour tester DTSC Chatbot.", audience: "PERSONAL", priceUsd: 0, dailyMessageLimit: 5, dailyTokenLimit: 15000, maxDocuments: 1, sortOrder: 1 },
    { id: "starter", name: "Essentiel personnel", slug: "starter", description: "Usage individuel léger pour indépendants et petits besoins de cadrage.", audience: "PERSONAL", priceUsd: 2, dailyMessageLimit: 40, dailyTokenLimit: 120000, maxDocuments: 2, sortOrder: 2 },
    { id: "growth", name: "Professionnel personnel", slug: "growth", description: "Usage individuel régulier avec davantage de capacité documentaire.", audience: "PERSONAL", priceUsd: 15, dailyMessageLimit: 200, dailyTokenLimit: 750000, maxDocuments: 20, sortOrder: 3 },
    { id: "premium", name: "Premium personnel", slug: "premium", description: "Usage individuel intensif avec support prioritaire.", audience: "PERSONAL", priceUsd: 50, dailyMessageLimit: 1000, dailyTokenLimit: 3000000, maxDocuments: 100, sortOrder: 4 },
    { id: "enterprise-starter", name: "Entreprise Essentiel", slug: "enterprise-starter", description: "Socle collaboratif et administratif pour une petite entreprise.", audience: "ENTERPRISE", priceUsd: 35, dailyMessageLimit: 500, dailyTokenLimit: 1500000, maxDocuments: 50, sortOrder: 101 },
    { id: "enterprise-business", name: "Entreprise Professionnel", slug: "enterprise-business", description: "Gestion intégrée des opérations, projets, équipes et finances courantes.", audience: "ENTERPRISE", priceUsd: 120, dailyMessageLimit: 2500, dailyTokenLimit: 8000000, maxDocuments: 500, sortOrder: 102 },
    { id: "enterprise-premium", name: "Entreprise Premium", slug: "enterprise-premium", description: "Couverture avancée multisite, sectorielle, audit et gouvernance.", audience: "ENTERPRISE", priceUsd: 350, dailyMessageLimit: 10000, dailyTokenLimit: 30000000, maxDocuments: 5000, sortOrder: 103 },
  ];

  await prisma.$transaction(plans.map((plan) => prisma.billingPlan.upsert({
    where: { id: plan.id },
    update: { audience: plan.audience },
    create: plan,
  })));

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
      planName: subscription.plan.name,
      invoiceType: "SUBSCRIPTION_PERSONAL",
      recipientEmails: [subscription.user.email],
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

export async function sendInvoiceEmail(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { user: true, plan: true, payment: true },
  });

  if (!invoice) return { sent: false, reason: "Invoice not found" };
  const configuredRecipients = Array.isArray(invoice.recipientEmails)
    ? invoice.recipientEmails.filter((value): value is string => typeof value === "string" && value.includes("@"))
    : [];
  const recipients = [...new Set(configuredRecipients.length ? configuredRecipients : [invoice.user.email])];
  if (!recipients.length) return { sent: false, reason: "Invoice recipient not found" };

  const amount = Number(invoice.amount).toFixed(2);
  const enterprise = invoice.invoiceType === "SUBSCRIPTION_ENTERPRISE";
  const operational = invoice.invoiceType === "HRCFO_TRANSACTION";
  const message = [
    `Bonjour ${enterprise ? "administrateurs de l’entreprise" : invoice.user.name},`,
    "",
    operational ? "Une facture liée à une transaction opérationnelle DTSC est disponible." : "Votre paiement DTSC Platform a été confirmé.",
    "",
    `Facture: ${invoice.number}`,
    `Type: ${invoice.invoiceType}`,
    `Offre / objet: ${invoice.planName}`,
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
    heading: enterprise ? "Facture d’abonnement entreprise" : operational ? "Facture opérationnelle DTSC" : "Facture d’abonnement personnel",
    source: "invoice",
    message,
  });

  if (mail.sent) await prisma.invoice.update({ where: { id: invoice.id }, data: { emailSentAt: new Date() } });
  return mail;
}

export async function activateOrganizationSubscriptionFromBillingReference(reference: string, callbackPayload?: unknown) {
  const record = await prisma.billingRecord.findFirst({
    where: { reference },
    include: {
      organization: { select: { id: true, name: true } },
      subscription: { include: { plan: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record?.subscription) return { ok: false as const, reason: "BILLING_RECORD_NOT_FOUND" };
  if (record.status === "PAID") {
    const invoice = await prisma.invoice.findFirst({ where: { organizationId: record.organizationId, invoiceType: "SUBSCRIPTION_ENTERPRISE", planId: record.subscription.planId, paidAt: { not: null } }, orderBy: { createdAt: "desc" } });
    return { ok: true as const, record, subscription: record.subscription, invoice };
  }

  const { start, end } = getNextBillingPeriod();
  const admins = await prisma.organizationMember.findMany({
    where: { organizationId: record.organizationId, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN_ENTREPRISE", "MANAGER"] } },
    select: { user: { select: { id: true, email: true } } },
    take: 50,
  });
  const invoiceUserId = admins[0]?.user.id || record.createdByUserId;
  if (!invoiceUserId) return { ok: false as const, reason: "INVOICE_RECIPIENT_NOT_FOUND" };

  const [updatedRecord, subscription] = await prisma.$transaction([
    prisma.billingRecord.update({ where: { id: record.id }, data: { status: "PAID", paymentMethod: record.paymentMethod || "MAISHAPAY", invoiceUrl: callbackPayload ? `callback:${Date.now()}` : record.invoiceUrl } }),
    prisma.organizationSubscription.update({ where: { id: record.subscription.id }, data: { status: "ACTIVE", startedAt: start, expiresAt: end } }),
  ]);
  await prisma.organizationSubscription.updateMany({ where: { organizationId: record.organizationId, id: { not: subscription.id }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED"] } }, data: { status: "EXPIRED", expiresAt: new Date() } });
  const { reconcileOrganizationModulesWithSubscription } = await import("@/lib/enterprise/module-subscription-reconciliation");
  await reconcileOrganizationModulesWithSubscription(record.organizationId);

  const invoice = await prisma.invoice.create({
    data: {
      number: buildInvoiceNumber(),
      userId: invoiceUserId,
      organizationId: record.organizationId,
      planId: record.subscription.planId,
      planName: record.subscription.plan.name,
      amount: updatedRecord.amount,
      currency: updatedRecord.currency,
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
      invoiceType: "SUBSCRIPTION_ENTERPRISE",
      recipientEmails: admins.map((member) => member.user.email),
    },
  });
  const { ensureBankFinancialAccount, createValidatedTransaction } = await import("@/lib/hr-cfo-finance");
  const account = await ensureBankFinancialAccount();
  const revenue = await createValidatedTransaction({
    title: `Abonnement entreprise · ${record.subscription.plan.name}`,
    requesterName: record.organization.name,
    category: "IN",
    transactionCategory: "IN",
    transactionType: "SUBSCRIPTION",
    amount: Number(updatedRecord.amount),
    currency: updatedRecord.currency,
    accountId: account.id,
    status: "VALIDATED",
    sourceType: "ORGANIZATION_BILLING_RECORD",
    sourceId: record.id,
    clientUserId: invoiceUserId,
    createdById: record.createdByUserId || undefined,
    skipInvoice: true,
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: revenue.id } });
  await sendInvoiceEmail(invoice.id).catch(() => null);
  return { ok: true as const, record: updatedRecord, subscription, invoice, revenue };
}
