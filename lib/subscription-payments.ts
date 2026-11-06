import { InvoiceStatus, PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { buildInvoiceNumber, getNextBillingPeriod, resolveOrganizationInvoiceRecipient, sendInvoiceEmail } from "@/lib/billing";
import { reconcileOrganizationModulesWithSubscription } from "@/lib/enterprise/module-subscription-reconciliation";
import { createValidatedTransaction, createValidatedTransactionInTx, ensureSubscriptionSettlementAccount } from "@/lib/hr-cfo-finance";
import { prisma } from "@/lib/prisma";

const LIVE_ORGANIZATION_STATUSES = ["ACTIVE", "TRIAL", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED"];

function advanceOneMonth(date: Date) {
  const end = new Date(date);
  end.setMonth(end.getMonth() + 1);
  return end;
}

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
  const account = await ensureSubscriptionSettlementAccount("MOBILE_MONEY", refreshed.currency);
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
  if (request.validatorUserId !== actor.userId) throw new Error("MANUAL_PAYMENT_VALIDATOR_REQUIRED");
  if (request.requestedByUserId === actor.userId) throw new Error("MANUAL_PAYMENT_SELF_APPROVAL_FORBIDDEN");
  if (action === "REJECT") {
    if (request.status === "REJECTED") return request;
    if (request.status === "APPROVED") throw new Error("MANUAL_PAYMENT_ALREADY_APPROVED");
    const changed = await prisma.manualSubscriptionPayment.updateMany({ where: { id: request.id, status: "PENDING_VALIDATION" }, data: { status: "REJECTED", rejectedAt: new Date(), validatedByUserId: actor.userId, validationComment: validationComment || null } });
    const latest = await prisma.manualSubscriptionPayment.findUniqueOrThrow({ where: { id: request.id } });
    if (!changed.count && latest.status !== "REJECTED") throw new Error("MANUAL_PAYMENT_ALREADY_APPROVED");
    return latest;
  }
  if (request.status === "REJECTED") throw new Error("MANUAL_PAYMENT_ALREADY_REJECTED");
  if (action === "APPROVE" && request.status !== "APPROVED" && !request.externalReference && (!validationComment || validationComment.trim().length < 10)) throw new Error("MANUAL_PAYMENT_EVIDENCE_REQUIRED");
  if (request.scope === "PERSONAL") return finalizePersonalManualPayment(request.id, actor.userId, validationComment);
  if (request.scope === "ORGANIZATION") return finalizeOrganizationManualPayment(request.id, actor.userId, validationComment);
  throw new Error("MANUAL_PAYMENT_SCOPE_INVALID");
}

async function finalizePersonalManualPayment(requestId: string, actorUserId: string, validationComment?: string) {
  const request = await prisma.manualSubscriptionPayment.findUnique({ where: { id: requestId }, include: { plan: true, user: true, payment: true, invoice: true } });
  if (!request?.user) throw new Error("MANUAL_PAYMENT_USER_REQUIRED");
  const account = await ensureSubscriptionSettlementAccount(request.paymentMethod, request.currency);
  const { start } = getNextBillingPeriod();
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ManualSubscriptionPayment" WHERE "id" = ${requestId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${request.userId!} FOR UPDATE`;
    const current = await tx.manualSubscriptionPayment.findUniqueOrThrow({ where: { id: requestId } });
    if (current.status === "REJECTED") throw new Error("MANUAL_PAYMENT_ALREADY_REJECTED");
    if (current.status === "APPROVED") {
      if (!current.paymentId || !current.subscriptionId) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
      const existingInvoice = await tx.invoice.findUnique({ where: { manualPaymentId: requestId } });
      if (!existingInvoice?.hrcfoTransactionId) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
      return { invoice: existingInvoice, income: await tx.hrcfoExpense.findUniqueOrThrow({ where: { id: existingInvoice.hrcfoTransactionId } }) };
    }
    const existing = await tx.subscription.findFirst({ where: { userId: request.userId!, planId: request.planId, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { gt: start } }, orderBy: { currentPeriodEnd: "desc" } });
    let subscription;
    if (existing) {
      await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${existing.id} FOR UPDATE`;
      const locked = await tx.subscription.findUniqueOrThrow({ where: { id: existing.id } });
      const periodStart = locked.currentPeriodEnd && locked.currentPeriodEnd > start ? locked.currentPeriodEnd : start;
      subscription = await tx.subscription.update({ where: { id: locked.id }, data: { currentPeriodEnd: advanceOneMonth(periodStart), cancelAtPeriodEnd: false } });
    } else {
      subscription = await tx.subscription.create({ data: { userId: request.userId!, planId: request.planId, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: advanceOneMonth(start) } });
    }
    const payment = await tx.payment.create({ data: { userId: request.userId!, subscriptionId: subscription.id, provider: "MANUAL", reference: `MANUAL-${request.id}`, amount: request.amount, currency: request.currency, status: PaymentStatus.PAID, paidAt: new Date(), checkoutPayload: { method: request.paymentMethod, externalReference: request.externalReference } } });
    let invoice = await tx.invoice.create({ data: { number: `DTSC-M-${request.id}`, userId: request.userId!, planId: request.planId, subscriptionId: subscription.id, paymentId: payment.id, manualPaymentId: request.id, category: "PERSONAL_SUBSCRIPTION", recipientEmail: request.user!.email, planName: request.plan.name, amount: request.amount, currency: request.currency, status: InvoiceStatus.PAID, paidAt: new Date() } });
    const income = await createValidatedTransactionInTx(tx, { title: `Abonnement personnel ${request.user!.name || request.user!.email}`, requesterName: request.user!.name || request.user!.email, category: "IN", transactionCategory: "IN", transactionType: "SUBSCRIPTION", amount: Number(request.amount), currency: request.currency, accountId: account.id, paymentMethod: request.paymentMethod, sourceType: "PAYMENT", sourceId: payment.id, clientUserId: request.userId!, createdById: actorUserId, status: "VALIDATED", skipInvoice: true });
    invoice = await tx.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: income.id } });
    await tx.manualSubscriptionPayment.update({ where: { id: requestId }, data: { status: "APPROVED", subscriptionId: subscription.id, paymentId: payment.id, validatedAt: new Date(), validatedByUserId: actorUserId, validationComment: validationComment || null } });
    return { invoice, income };
  }, { maxWait: 10_000, timeout: 30_000 });
  const { invoice, income } = outcome;
  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Invoice email failed" }));
  return { request: await prisma.manualSubscriptionPayment.findUnique({ where: { id: request.id } }), invoice, incomeTransaction: income, mail };
}

async function finalizeOrganizationManualPayment(requestId: string, actorUserId: string, validationComment?: string) {
  const request = await prisma.manualSubscriptionPayment.findUnique({ where: { id: requestId }, include: { plan: true, organization: true, payment: true, invoice: true } });
  if (!request?.organization) throw new Error("MANUAL_PAYMENT_ORGANIZATION_REQUIRED");
  const recipient = await resolveOrganizationInvoiceRecipient(request.organization.id);
  if (!recipient) throw new Error("ORGANIZATION_INVOICE_RECIPIENT_NOT_FOUND");
  const account = await ensureSubscriptionSettlementAccount(request.paymentMethod, request.currency);
  const { start } = getNextBillingPeriod();
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ManualSubscriptionPayment" WHERE "id" = ${requestId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${request.organizationId!} FOR UPDATE`;
    const current = await tx.manualSubscriptionPayment.findUniqueOrThrow({ where: { id: requestId } });
    if (current.status === "REJECTED") throw new Error("MANUAL_PAYMENT_ALREADY_REJECTED");
    if (current.status === "APPROVED") {
      if (!current.paymentId || !current.organizationSubscriptionId) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
      const existingInvoice = await tx.invoice.findUnique({ where: { manualPaymentId: requestId } });
      if (!existingInvoice?.hrcfoTransactionId) throw new Error("MANUAL_PAYMENT_APPROVAL_INCOMPLETE");
      return { invoice: existingInvoice, income: await tx.hrcfoExpense.findUniqueOrThrow({ where: { id: existingInvoice.hrcfoTransactionId } }) };
    }
    const existing = await tx.organizationSubscription.findFirst({ where: { organizationId: request.organizationId!, planId: request.planId, status: "ACTIVE", expiresAt: { gt: start } }, orderBy: { expiresAt: "desc" } });
    let subscription;
    if (existing) {
      await tx.$queryRaw`SELECT "id" FROM "OrganizationSubscription" WHERE "id" = ${existing.id} FOR UPDATE`;
      const locked = await tx.organizationSubscription.findUniqueOrThrow({ where: { id: existing.id } });
      const periodStart = locked.expiresAt && locked.expiresAt > start ? locked.expiresAt : start;
      subscription = await tx.organizationSubscription.update({ where: { id: locked.id }, data: { expiresAt: advanceOneMonth(periodStart), updatedByDtscUserId: actorUserId } });
    } else {
      await tx.organizationSubscription.updateMany({ where: { organizationId: request.organizationId!, status: { in: LIVE_ORGANIZATION_STATUSES } }, data: { status: "EXPIRED", expiresAt: start, updatedByDtscUserId: actorUserId } });
      subscription = await tx.organizationSubscription.create({ data: { organizationId: request.organizationId!, planId: request.planId, status: "ACTIVE", startedAt: start, expiresAt: advanceOneMonth(start), createdByDtscUserId: request.requestedByUserId, updatedByDtscUserId: actorUserId } });
    }
    const payment = await tx.payment.create({ data: { userId: recipient.userId, organizationId: request.organizationId, organizationSubscriptionId: subscription.id, provider: "MANUAL", reference: `MANUAL-${request.id}`, amount: request.amount, currency: request.currency, status: PaymentStatus.PAID, paidAt: new Date(), checkoutPayload: { method: request.paymentMethod, externalReference: request.externalReference } } });
    await tx.billingRecord.upsert({ where: { id: `billing-${request.id}` }, update: { status: "PAID", amount: request.amount, currency: request.currency, paymentMethod: request.paymentMethod, reference: request.externalReference || `MANUAL-${request.id}`, subscriptionId: subscription.id }, create: { id: `billing-${request.id}`, organizationId: request.organizationId!, subscriptionId: subscription.id, amount: request.amount, currency: request.currency, status: "PAID", paymentMethod: request.paymentMethod, reference: request.externalReference || `MANUAL-${request.id}`, createdByUserId: request.requestedByUserId } });
    let invoice = await tx.invoice.create({ data: { number: `DTSC-M-${request.id}`, userId: recipient.userId, organizationId: request.organizationId, organizationSubscriptionId: subscription.id, paymentId: payment.id, manualPaymentId: request.id, category: "ORGANIZATION_SUBSCRIPTION", recipientEmail: recipient.emails[0], planId: request.planId, planName: request.plan.name, amount: request.amount, currency: request.currency, status: InvoiceStatus.PAID, paidAt: new Date() } });
    const income = await createValidatedTransactionInTx(tx, { title: `Abonnement entreprise ${request.organization!.name}`, requesterName: request.organization!.name, category: "IN", transactionCategory: "IN", transactionType: "SUBSCRIPTION", amount: Number(request.amount), currency: request.currency, accountId: account.id, paymentMethod: request.paymentMethod, sourceType: "ORGANIZATION_SUBSCRIPTION_MANUAL_PAYMENT", sourceId: request.id, clientUserId: recipient.userId, createdById: actorUserId, status: "VALIDATED", skipInvoice: true });
    invoice = await tx.invoice.update({ where: { id: invoice.id }, data: { hrcfoTransactionId: income.id } });
    await tx.manualSubscriptionPayment.update({ where: { id: requestId }, data: { status: "APPROVED", organizationSubscriptionId: subscription.id, paymentId: payment.id, validatedAt: new Date(), validatedByUserId: actorUserId, validationComment: validationComment || null } });
    return { invoice, income };
  }, { maxWait: 10_000, timeout: 30_000 });
  const { invoice, income } = outcome;
  await reconcileOrganizationModulesWithSubscription(request.organization.id);
  const mail = await sendInvoiceEmail(invoice.id).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Invoice email failed" }));
  return { request: await prisma.manualSubscriptionPayment.findUnique({ where: { id: request.id } }), invoice, incomeTransaction: income, mail };
}
