import { InvoiceStatus, PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { buildInvoiceNumber, getNextBillingPeriod, resolveOrganizationInvoiceRecipient, sendInvoiceEmail } from "@/lib/billing";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { createSubscriptionIncomeTransaction, createValidatedTransaction, ensureBankFinancialAccount } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";

const LIVE_ORGANIZATION_STATUSES = ["ACTIVE", "TRIAL", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED"];

export type ManualPaymentScope = "PERSONAL" | "ORGANIZATION";

export async function activateOrganizationSubscriptionFromPayment(paymentReference: string, callbackPayload?: unknown) {
  const payment = await prisma.payment.findUnique({
    where: { reference: paymentReference },
    include: {
      organization: true,
      organizationSubscription: { include: { plan: true, organization: true } },
      invoice: true,
    },
  });
  if (!payment?.organizationSubscription || !payment.organizationId) return { ok: false, reason: "ORGANIZATION_PAYMENT_NOT_FOUND" } as const;
  if (payment.status !== PaymentStatus.PAID) {
    const { start, end } = getNextBillingPeriod();
    await prisma.$transaction(async (tx) => {
      await tx.organizationSubscription.updateMany({
        where: { organizationId: payment.organizationId!, id: { not: payment.organizationSubscriptionId! }, status: { in: LIVE_ORGANIZATION_STATUSES } },
        data: { status: "EXPIRED", expiresAt: start, updatedByDtscUserId: payment.userId },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID, paidAt: new Date(), callbackPayload: callbackPayload ? JSON.parse(JSON.stringify(callbackPayload)) : undefined },
      });
      await tx.organizationSubscription.update({
        where: { id: payment.organizationSubscriptionId! },
        data: { status: "ACTIVE", startedAt: start, expiresAt: end, updatedByDtscUserId: payment.userId },
      });
      await tx.billingRecord.upsert({
        where: { id: `billing-${payment.id}` },
        update: { status: "PAID", amount: payment.amount, currency: payment.currency, paymentMethod: payment.provider, reference: payment.reference },
        create: { id: `billing-${payment.id}`, organizationId: payment.organizationId!, subscriptionId: payment.organizationSubscriptionId, amount: payment.amount, currency: payment.currency, status: "PAID", paymentMethod: payment.provider, reference: payment.reference, createdByUserId: payment.userId },
      });
    });
  }

  const refreshed = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { organizationSubscription: { include: { plan: true, organization: true } }, invoice: true },
  });
  if (!refreshed?.organizationSubscription) return { ok: false, reason: "ORGANIZATION_SUBSCRIPTION_NOT_FOUND" } as const;
  let invoice = refreshed.invoice;
  if (!invoice) {
    const recipient = await resolveOrganizationInvoiceRecipient(payment.organizationId);
    if (!recipient) return { ok: false, reason: "ORGANIZATION_INVOICE_RECIPIENT_NOT_FOUND" } as const;
    invoice = await prisma.invoice.create({
      data: {
        number: buildInvoiceNumber(),
        userId: recipient.userId,
        organizationId: payment.organizationId,
        organizationSubscriptionId: refreshed.organizationSubscription.id,
        paymentId: refreshed.id,
        category: "ORGANIZATION_SUBSCRIPTION",
        recipientEmail: recipient.emails[0],
        planId: refreshed.organizationSubscription.planId,
        planName: refreshed.organizationSubscription.plan.name,
        amount: refreshed.amount,
        currency: refreshed.currency,
        status: InvoiceStatus.PAID,
        paidAt: refreshed.paidAt || new Date(),
      },
    });
  }
  const account = await ensureBankFinancialAccount();
  const income = await createValidatedTransaction({
    title: `Abonnement entreprise ${refreshed.organizationSubscription.organization.name}`,
    requesterName: refreshed.organizationSubscription.organization.name,
    category: "IN",
    transactionCategory: "IN",
    transactionType: "SUBSCRIPTION",
    amount: Number(refreshed.amount),
    currency: refreshed.currency,
    accountId: account.id,
    paymentMethod: refreshed.provider,
    sourceType: "ORGANIZATION_SUBSCRIPTION_PAYMENT",
    sourceId: refreshed.id,
    clientUserId: invoice.userId,
    createdById: refreshed.userId,
    status: "VALIDATED",
    skipInvoice: true,
  });
  if (!invoice.hrcfoTransactionId) invoice = await prisma.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: income.id } });
  await reconcileOrganizationModulesWithSubscription(payment.organizationId);
  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Invoice email failed" }));
  return { ok: true, payment: refreshed, subscription: refreshed.organizationSubscription, invoice, incomeTransaction: income, mail } as const;
}

export async function finalizeManualSubscriptionPayment(requestId: string, actor: { userId: string; role: UserRole }, action: "APPROVE" | "REJECT", validationComment?: string) {
  const request = await prisma.manualSubscriptionPayment.findUnique({
    where: { id: requestId },
    include: { plan: true, user: true, organization: true, payment: true, invoice: true },
  });
  if (!request) throw new Error("MANUAL_PAYMENT_NOT_FOUND");
  if (request.validatorUserId !== actor.userId && actor.role !== UserRole.ADMIN) throw new Error("MANUAL_PAYMENT_VALIDATOR_REQUIRED");
  if (action === "REJECT") {
    if (request.status === "REJECTED") return request;
    if (request.status === "APPROVED") throw new Error("MANUAL_PAYMENT_ALREADY_APPROVED");
    return prisma.manualSubscriptionPayment.update({ where: { id: request.id }, data: { status: "REJECTED", rejectedAt: new Date(), validatedByUserId: actor.userId, validationComment: validationComment || null } });
  }
  if (request.status === "REJECTED") throw new Error("MANUAL_PAYMENT_ALREADY_REJECTED");
  if (request.scope === "PERSONAL") return finalizePersonalManualPayment(request.id, actor.userId, validationComment);
  if (request.scope === "ORGANIZATION") return finalizeOrganizationManualPayment(request.id, actor.userId, validationComment);
  throw new Error("MANUAL_PAYMENT_SCOPE_INVALID");
}

async function finalizePersonalManualPayment(requestId: string, actorUserId: string, validationComment?: string) {
  const request = await prisma.manualSubscriptionPayment.findUnique({ where: { id: requestId }, include: { plan: true, user: true, payment: true, invoice: true } });
  if (!request?.user) throw new Error("MANUAL_PAYMENT_USER_REQUIRED");
  const { start, end } = getNextBillingPeriod();
  let subscriptionId = request.subscriptionId;
  let paymentId = request.paymentId;
  if (request.status === "APPROVED" && (!subscriptionId || !paymentId)) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
  if (request.status !== "APPROVED") await prisma.$transaction(async (tx) => {
    if (!subscriptionId) {
      const subscription = await tx.subscription.create({ data: { userId: request.userId!, planId: request.planId, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end } });
      subscriptionId = subscription.id;
    } else {
      await tx.subscription.update({ where: { id: subscriptionId }, data: { planId: request.planId, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false } });
    }
    if (!paymentId) {
      if (!subscriptionId) throw new Error("MANUAL_PAYMENT_SUBSCRIPTION_REQUIRED");
      const payment = await tx.payment.create({ data: { userId: request.userId!, subscriptionId, provider: "MANUAL", reference: `MANUAL-${request.id}`, amount: request.amount, currency: request.currency, status: PaymentStatus.PAID, paidAt: new Date(), checkoutPayload: { method: request.paymentMethod, externalReference: request.externalReference } } });
      paymentId = payment.id;
    }
    await tx.user.update({ where: { id: request.userId! }, data: { dailyMessageLimit: request.plan.dailyMessageLimit, dailyTokenLimit: request.plan.dailyTokenLimit } });
    await tx.manualSubscriptionPayment.update({ where: { id: request.id }, data: { status: "APPROVED", subscriptionId, paymentId, validatedAt: new Date(), validatedByUserId: actorUserId, validationComment: validationComment || null } });
  });
  let invoice = await prisma.invoice.findUnique({ where: { manualPaymentId: request.id } });
  if (!invoice) invoice = await prisma.invoice.create({ data: { number: buildInvoiceNumber(), userId: request.userId, planId: request.planId, subscriptionId, paymentId, manualPaymentId: request.id, category: "PERSONAL_SUBSCRIPTION", recipientEmail: request.user.email, planName: request.plan.name, amount: request.amount, currency: request.currency, status: InvoiceStatus.PAID, paidAt: new Date() } });
  const income = await createSubscriptionIncomeTransaction(paymentId!);
  if (income && !invoice.hrcfoTransactionId) invoice = await prisma.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: income.id } });
  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Invoice email failed" }));
  return { request: await prisma.manualSubscriptionPayment.findUnique({ where: { id: request.id } }), invoice, incomeTransaction: income, mail };
}

async function finalizeOrganizationManualPayment(requestId: string, actorUserId: string, validationComment?: string) {
  const request = await prisma.manualSubscriptionPayment.findUnique({ where: { id: requestId }, include: { plan: true, organization: true, payment: true, invoice: true } });
  if (!request?.organization) throw new Error("MANUAL_PAYMENT_ORGANIZATION_REQUIRED");
  const recipient = await resolveOrganizationInvoiceRecipient(request.organization.id);
  if (!recipient) throw new Error("ORGANIZATION_INVOICE_RECIPIENT_NOT_FOUND");
  const { start, end } = getNextBillingPeriod();
  let organizationSubscriptionId = request.organizationSubscriptionId;
  let paymentId = request.paymentId;
  if (request.status === "APPROVED" && (!organizationSubscriptionId || !paymentId)) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
  if (request.status !== "APPROVED") await prisma.$transaction(async (tx) => {
    await tx.organizationSubscription.updateMany({ where: { organizationId: request.organizationId!, id: organizationSubscriptionId ? { not: organizationSubscriptionId } : undefined, status: { in: LIVE_ORGANIZATION_STATUSES } }, data: { status: "EXPIRED", expiresAt: start, updatedByDtscUserId: actorUserId } });
    if (!organizationSubscriptionId) {
      const subscription = await tx.organizationSubscription.create({ data: { organizationId: request.organizationId!, planId: request.planId, status: "ACTIVE", startedAt: start, expiresAt: end, createdByDtscUserId: request.requestedByUserId, updatedByDtscUserId: actorUserId } });
      organizationSubscriptionId = subscription.id;
    } else {
      await tx.organizationSubscription.update({ where: { id: organizationSubscriptionId }, data: { planId: request.planId, status: "ACTIVE", startedAt: start, expiresAt: end, updatedByDtscUserId: actorUserId } });
    }
    if (!paymentId) {
      const payment = await tx.payment.create({ data: { userId: recipient.userId, organizationId: request.organizationId, organizationSubscriptionId, provider: "MANUAL", reference: `MANUAL-${request.id}`, amount: request.amount, currency: request.currency, status: PaymentStatus.PAID, paidAt: new Date(), checkoutPayload: { method: request.paymentMethod, externalReference: request.externalReference } } });
      paymentId = payment.id;
    }
    await tx.billingRecord.upsert({ where: { id: `billing-${request.id}` }, update: { status: "PAID", amount: request.amount, currency: request.currency, paymentMethod: request.paymentMethod, reference: request.externalReference || `MANUAL-${request.id}`, subscriptionId: organizationSubscriptionId }, create: { id: `billing-${request.id}`, organizationId: request.organizationId!, subscriptionId: organizationSubscriptionId, amount: request.amount, currency: request.currency, status: "PAID", paymentMethod: request.paymentMethod, reference: request.externalReference || `MANUAL-${request.id}`, createdByUserId: request.requestedByUserId } });
    await tx.manualSubscriptionPayment.update({ where: { id: request.id }, data: { status: "APPROVED", organizationSubscriptionId, paymentId, validatedAt: new Date(), validatedByUserId: actorUserId, validationComment: validationComment || null } });
  });
  let invoice = await prisma.invoice.findUnique({ where: { manualPaymentId: request.id } });
  if (!invoice) invoice = await prisma.invoice.create({ data: { number: buildInvoiceNumber(), userId: recipient.userId, organizationId: request.organizationId, organizationSubscriptionId, paymentId, manualPaymentId: request.id, category: "ORGANIZATION_SUBSCRIPTION", recipientEmail: recipient.emails[0], planId: request.planId, planName: request.plan.name, amount: request.amount, currency: request.currency, status: InvoiceStatus.PAID, paidAt: new Date() } });
  const account = await ensureBankFinancialAccount();
  const income = await createValidatedTransaction({ title: `Abonnement entreprise ${request.organization.name}`, requesterName: request.organization.name, category: "IN", transactionCategory: "IN", transactionType: "SUBSCRIPTION", amount: Number(request.amount), currency: request.currency, accountId: account.id, paymentMethod: request.paymentMethod, sourceType: "ORGANIZATION_SUBSCRIPTION_MANUAL_PAYMENT", sourceId: request.id, clientUserId: recipient.userId, createdById: actorUserId, status: "VALIDATED", skipInvoice: true });
  if (!invoice.hrcfoTransactionId) invoice = await prisma.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: income.id } });
  await reconcileOrganizationModulesWithSubscription(request.organization.id);
  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Invoice email failed" }));
  return { request: await prisma.manualSubscriptionPayment.findUnique({ where: { id: request.id } }), invoice, incomeTransaction: income, mail };
}
