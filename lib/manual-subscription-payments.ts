import { InvoiceStatus, SubscriptionStatus } from "@prisma/client";
import { buildInvoiceNumber, getNextBillingPeriod, sendInvoiceEmail } from "@/lib/billing";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { createValidatedTransaction, ensureBankFinancialAccount } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";

const LIVE_PERSONAL_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING_PAYMENT];
const LIVE_ENTERPRISE_STATUSES = ["ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "TRIAL"];

export type ManualSubscriptionScope = "PERSONAL" | "ENTERPRISE";

export async function requestManualSubscriptionPayment(input: {
  scope: ManualSubscriptionScope;
  targetId: string;
  planId: string;
  paymentMethod: string;
  paymentReference?: string | null;
  requestedByUserId: string;
  idempotencyKey: string;
}) {
  const plan = await prisma.billingPlan.findFirst({ where: { id: input.planId, isActive: true } });
  if (!plan) throw new Error("L’offre sélectionnée est introuvable ou inactive.");
  if (![input.scope, "BOTH"].includes(plan.audience)) throw new Error("Cette offre ne correspond pas au type d’abonnement choisi.");

  if (input.scope === "PERSONAL") {
    const user = await prisma.user.findFirst({ where: { id: input.targetId, status: "ACTIVE" }, select: { id: true } });
    if (!user) throw new Error("Utilisateur introuvable ou inactif.");
  } else {
    const organization = await prisma.organization.findFirst({ where: { id: input.targetId, organizationType: "CLIENT", deletedAt: null }, select: { id: true } });
    if (!organization) throw new Error("Entreprise cliente introuvable.");
  }

  return prisma.subscriptionManualPayment.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      idempotencyKey: input.idempotencyKey,
      scope: input.scope,
      userId: input.scope === "PERSONAL" ? input.targetId : null,
      organizationId: input.scope === "ENTERPRISE" ? input.targetId : null,
      planId: plan.id,
      amount: plan.priceUsd,
      currency: "USD",
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference?.trim() || null,
      requestedByUserId: input.requestedByUserId,
    },
  });
}

export async function decideManualSubscriptionPayment(input: {
  id: string;
  action: "VALIDATE" | "REJECT";
  validatorUserId: string;
  comment?: string | null;
}) {
  const current = await prisma.subscriptionManualPayment.findUnique({ where: { id: input.id } });
  if (!current) throw new Error("Demande de paiement manuel introuvable.");
  if (current.status === "VALIDATED" || current.status === "REJECTED") return current;
  if (current.status !== "PENDING_VALIDATION") throw new Error("Cette demande est déjà en cours de traitement.");

  if (input.action === "REJECT") {
    return prisma.subscriptionManualPayment.update({
      where: { id: current.id },
      data: { status: "REJECTED", validatedByUserId: input.validatorUserId, validationComment: input.comment || null, validatedAt: new Date() },
    });
  }

  const claimed = await prisma.subscriptionManualPayment.updateMany({
    where: { id: current.id, status: "PENDING_VALIDATION" },
    data: { status: "PROCESSING", validatedByUserId: input.validatorUserId, validationComment: input.comment || null },
  });
  if (!claimed.count) return prisma.subscriptionManualPayment.findUniqueOrThrow({ where: { id: current.id } });

  try {
    const plan = await prisma.billingPlan.findUniqueOrThrow({ where: { id: current.planId } });
    const { start, end } = getNextBillingPeriod();
    let subscriptionId: string | null = null;
    let organizationSubscriptionId: string | null = null;
    let invoiceUserId = current.userId || input.validatorUserId;
    let recipientEmails: string[] = [];

    if (current.scope === "PERSONAL" && current.userId) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: current.userId }, select: { id: true, name: true, email: true } });
      recipientEmails = [user.email];
      await prisma.subscription.updateMany({ where: { userId: user.id, status: { in: LIVE_PERSONAL_STATUSES } }, data: { status: SubscriptionStatus.CANCELED, currentPeriodEnd: new Date() } });
      const subscription = await prisma.subscription.create({
        data: { userId: user.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
      });
      subscriptionId = subscription.id;
      await prisma.user.update({ where: { id: user.id }, data: { dailyMessageLimit: plan.dailyMessageLimit, dailyTokenLimit: plan.dailyTokenLimit } });
    } else if (current.scope === "ENTERPRISE" && current.organizationId) {
      const organization = await prisma.organization.findUniqueOrThrow({ where: { id: current.organizationId }, select: { id: true, name: true } });
      const administrators = await prisma.organizationMember.findMany({
        where: { organizationId: organization.id, status: "ACTIVE", removedAt: null, role: { in: ["OWNER", "ADMIN_ENTREPRISE", "MANAGER"] } },
        select: { user: { select: { id: true, email: true } } },
        take: 50,
      });
      if (administrators[0]) invoiceUserId = administrators[0].user.id;
      recipientEmails = administrators.map((member) => member.user.email);
      await prisma.organizationSubscription.updateMany({ where: { organizationId: organization.id, status: { in: LIVE_ENTERPRISE_STATUSES } }, data: { status: "EXPIRED", expiresAt: new Date(), updatedByDtscUserId: input.validatorUserId } });
      const subscription = await prisma.organizationSubscription.create({
        data: { organizationId: organization.id, planId: plan.id, status: "ACTIVE", startedAt: start, expiresAt: end, createdByDtscUserId: input.validatorUserId, updatedByDtscUserId: input.validatorUserId },
      });
      organizationSubscriptionId = subscription.id;
      await reconcileOrganizationModulesWithSubscription(organization.id);
    } else throw new Error("La cible du paiement manuel est incomplète.");

    const invoice = await prisma.invoice.create({
      data: {
        number: buildInvoiceNumber(),
        userId: invoiceUserId,
        organizationId: current.organizationId,
        planId: plan.id,
        subscriptionId,
        planName: plan.name,
        amount: current.amount,
        currency: current.currency,
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        invoiceType: current.scope === "ENTERPRISE" ? "SUBSCRIPTION_ENTERPRISE" : "SUBSCRIPTION_PERSONAL",
        recipientEmails,
      },
    });

    const account = await ensureBankFinancialAccount();
    const revenue = await createValidatedTransaction({
      title: `Abonnement ${current.scope === "ENTERPRISE" ? "entreprise" : "personnel"} · ${plan.name}`,
      requesterName: current.scope === "ENTERPRISE" ? "Entreprise cliente" : "Utilisateur DTSC",
      category: "IN",
      transactionCategory: "IN",
      transactionType: "SUBSCRIPTION",
      amount: Number(current.amount),
      currency: current.currency,
      accountId: account.id,
      status: "VALIDATED",
      sourceType: "MANUAL_SUBSCRIPTION_PAYMENT",
      sourceId: current.id,
      clientUserId: current.userId || invoiceUserId,
      createdById: input.validatorUserId,
      notes: `Paiement manuel validé · ${current.paymentMethod} · ${current.paymentReference || "sans référence externe"}`,
      skipInvoice: true,
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: revenue.id } });
    await sendInvoiceEmail(invoice.id).catch(() => null);

    return prisma.subscriptionManualPayment.update({
      where: { id: current.id },
      data: {
        status: "VALIDATED",
        validatedAt: new Date(),
        subscriptionId,
        organizationSubscriptionId,
        invoiceId: invoice.id,
        revenueTransactionId: revenue.id,
      },
    });
  } catch (error) {
    await prisma.subscriptionManualPayment.update({ where: { id: current.id }, data: { status: "FAILED", validationComment: error instanceof Error ? error.message.slice(0, 1000) : "Validation impossible" } });
    throw error;
  }
}
