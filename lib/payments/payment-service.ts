import { PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { finalizeManualSubscriptionPayment } from "@/lib/subscription-payments";
import {
  assertInternalPaymentAccess,
  assertPaymentMutationBoundary,
  assertPaymentOwnerOrInternal,
  assertPaymentTargetAccess,
} from "./payment-access";
import { paymentError } from "./payment-errors";
import { assertExactPaymentAmount, assertPaymentReplay, makePaymentReference } from "./payment-idempotency";
import { assertPaymentTransition } from "./payment-state-machine";
import type { PaymentContext, PaymentPageInput, PaymentTarget } from "./payment-types";

const paymentIdSchema = z.string().cuid();
const checkoutSchema = z.object({
  planId: z.string().min(1).max(120),
  requestId: z.string().trim().min(8).max(120),
  provider: z.literal("MAISHAPAY"),
}).strict();
const invoiceCheckoutSchema = z.object({
  invoiceId: z.string().cuid(),
  requestId: z.string().trim().min(8).max(120),
  provider: z.literal("MAISHAPAY"),
}).strict();

type Transaction = Prisma.TransactionClient;

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) paymentError("PAYMENT_INVALID_INPUT");
  return result.data;
}

/** Write both traces within the payment transaction. No sensitive provider payloads in logs. */
async function logMutation(tx: Transaction, context: PaymentContext, action: string, entityId: string, organizationId?: string | null) {
  const url = new URL(context.request.url);
  await tx.auditLog.create({
    data: {
      userId: context.session.userId, organizationId: organizationId ?? null,
      action, entity: "Payment", entityId,
      metadata: { source: "DTSC_PAYMENTS_V1" },
    },
  });
  await tx.apiLog.create({
    data: {
      method: context.request.method, path: url.pathname, statusCode: 200,
      userId: context.session.userId,
      metadata: { operation: action, entityId },
    },
  });
}

/**
 * This service represents DTSC's SaaS receivables only. Client ERP receivables
 * remain exclusively in EnterprisePayment and its existing accounting service.
 */
export async function createSubscriptionPayment(context: PaymentContext, target: PaymentTarget, rawInput: unknown) {
  await assertPaymentMutationBoundary(context, "create-subscription");
  const input = parseInput(checkoutSchema, rawInput);
  await assertPaymentTargetAccess(context.session, target, "CREATE");

  const ownerId = target.scope === "PERSONAL" ? target.userId : target.organizationId;
  const reference = makePaymentReference({ scope: target.scope, ownerId, requestId: input.requestId });
  const organizationId = target.scope === "ORGANIZATION" ? target.organizationId : null;
  const userId = context.session.userId;
  const existingPayment = () => prisma.payment.findUnique({
    where: { reference },
    include: { subscription: { select: { planId: true } }, organizationSubscription: { select: { planId: true } } },
  });
  const preexisting = await existingPayment();
  if (preexisting && (preexisting.subscription?.planId ?? preexisting.organizationSubscription?.planId) !== input.planId) {
    paymentError("PAYMENT_IDEMPOTENCY_CONFLICT");
  }

  const plan = await prisma.billingPlan.findFirst({
    where: { id: input.planId, isActive: true, audience: { in: [target.scope, "BOTH"] } },
    select: { id: true, priceUsd: true },
  });
  if (!plan && preexisting) {
    // A retired plan must not turn a previously accepted idempotent request into a new charge.
    assertPaymentReplay({
      existing: preexisting, userId, organizationId, provider: input.provider,
      currency: preexisting.currency, amount: preexisting.amount,
    });
    return { payment: preexisting, replayed: true } as const;
  }
  if (!plan || !plan.priceUsd.gt(0)) paymentError("PAYMENT_INVALID_INPUT");
  const assertReplay = (payment: NonNullable<Awaited<ReturnType<typeof existingPayment>>>) => {
    assertPaymentReplay({ existing: payment, userId, organizationId, provider: input.provider, currency: "USD", amount: plan.priceUsd });
    if ((payment.subscription?.planId ?? payment.organizationSubscription?.planId) !== plan.id) {
      paymentError("PAYMENT_IDEMPOTENCY_CONFLICT");
    }
    return payment;
  };
  if (preexisting) return { payment: assertReplay(preexisting), replayed: true } as const;

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const subscription = target.scope === "PERSONAL"
        ? await tx.subscription.create({ data: { userId: target.userId, planId: plan.id, status: "PENDING_PAYMENT" } })
        : null;
      const organizationSubscription = target.scope === "ORGANIZATION"
        ? await tx.organizationSubscription.create({ data: {
          organizationId: target.organizationId, planId: plan.id,
          status: "PENDING_PAYMENT", createdByDtscUserId: userId,
        } }) : null;
      const created = await tx.payment.create({ data: {
        userId, organizationId, subscriptionId: subscription?.id,
        organizationSubscriptionId: organizationSubscription?.id,
        provider: input.provider, reference, amount: plan.priceUsd, currency: "USD", status: PaymentStatus.PENDING,
      } });
      await logMutation(tx, context, "DTSC_PAYMENT_CREATED", created.id, organizationId);
      return created;
    });
    return { payment, replayed: false } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await existingPayment();
      if (raced) return { payment: assertReplay(raced), replayed: true } as const;
    }
    throw error;
  }
}

/** Invoice-first collection; no partial payments or multi-invoice allocations in V1. */
export async function createInvoicePayment(context: PaymentContext, rawInput: unknown) {
  await assertPaymentMutationBoundary(context, "create-invoice");
  const input = parseInput(invoiceCheckoutSchema, rawInput);
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) paymentError("PAYMENT_NOT_FOUND");
  await assertPaymentTargetAccess(context.session, invoice.organizationId
    ? { scope: "ORGANIZATION", organizationId: invoice.organizationId }
    : { scope: "PERSONAL", userId: invoice.userId }, "CREATE");
  const reference = makePaymentReference({ scope: "INVOICE", ownerId: invoice.id, requestId: input.requestId });
  const userId = invoice.userId;
  const assertInvoiceReplay = async () => {
    const existing = await prisma.payment.findUnique({ where: { reference }, include: { invoice: true } });
    if (!existing) return null;
    assertPaymentReplay({
      existing, userId, organizationId: invoice.organizationId,
      provider: input.provider, amount: invoice.amount, currency: invoice.currency,
    });
    if (existing.invoice?.id !== invoice.id) paymentError("PAYMENT_IDEMPOTENCY_CONFLICT");
    return existing;
  };
  const replay = await assertInvoiceReplay();
  if (replay) return { payment: replay, replayed: true } as const;
  if (invoice.status !== "ISSUED" || !invoice.amount.gt(0) || invoice.manualPaymentId) paymentError("PAYMENT_INVOICE_CONFLICT");

  try {
    const payment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoice.id} FOR UPDATE`;
      const currentInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      if (currentInvoice.status !== "ISSUED" || currentInvoice.paymentId) paymentError("PAYMENT_INVOICE_CONFLICT");
      if (!currentInvoice.amount.equals(invoice.amount) || currentInvoice.currency !== invoice.currency ||
        currentInvoice.userId !== userId || currentInvoice.organizationId !== invoice.organizationId) {
        paymentError("PAYMENT_INVOICE_CONFLICT");
      }
      const created = await tx.payment.create({ data: {
        userId, organizationId: invoice.organizationId,
        subscriptionId: invoice.subscriptionId,
        organizationSubscriptionId: invoice.organizationSubscriptionId,
        amount: currentInvoice.amount, currency: currentInvoice.currency,
        provider: input.provider, reference, status: PaymentStatus.PENDING,
      } });
      await tx.invoice.update({ where: { id: currentInvoice.id }, data: { paymentId: created.id } });
      await logMutation(tx, context, "DTSC_INVOICE_PAYMENT_CREATED", created.id, invoice.organizationId);
      return created;
    });
    return { payment, replayed: false } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await assertInvoiceReplay();
      if (raced) return { payment: raced, replayed: true } as const;
    }
    throw error;
  }
}

/** Cancel a pending checkout without revoking already paid subscription periods. */
export async function cancelPayment(context: PaymentContext, rawPaymentId: unknown) {
  await assertPaymentMutationBoundary(context, "cancel");
  const paymentId = parseInput(paymentIdSchema, rawPaymentId);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) paymentError("PAYMENT_NOT_FOUND");
  await assertPaymentTargetAccess(context.session, payment.organizationId
    ? { scope: "ORGANIZATION", organizationId: payment.organizationId }
    : { scope: "PERSONAL", userId: payment.userId }, "CANCEL");
  if (payment.status === "CANCELED") return { payment, replayed: true } as const;
  // An ACCEPTED PSP payment may already have transferred funds. Cancellation
  // requires the provider-confirmed reversal path introduced by PAY-4/PAY-8.
  if (payment.status === "ACCEPTED") paymentError("PAYMENT_UNSUPPORTED_OPERATION");
  assertPaymentTransition(payment.status, "CANCELED");

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.payment.updateMany({
      where: { id: paymentId, status: payment.status }, data: { status: PaymentStatus.CANCELED },
    });
    if (!changed.count) paymentError("PAYMENT_INVALID_TRANSITION");
    if (payment.subscriptionId) await tx.subscription.updateMany({
      where: { id: payment.subscriptionId, status: "PENDING_PAYMENT" }, data: { status: "CANCELED" },
    });
    if (payment.organizationSubscriptionId) await tx.organizationSubscription.updateMany({
      where: { id: payment.organizationSubscriptionId, status: "PENDING_PAYMENT" }, data: { status: "CANCELED" },
    });
    await logMutation(tx, context, "DTSC_PAYMENT_CANCELED", payment.id, payment.organizationId);
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  });
  return { payment: updated, replayed: false } as const;
}

/** Explicit retry with the same stable reference; never resurrect PAID payments. */
export async function retryPayment(context: PaymentContext, rawPaymentId: unknown) {
  await assertPaymentMutationBoundary(context, "retry");
  const paymentId = parseInput(paymentIdSchema, rawPaymentId);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) paymentError("PAYMENT_NOT_FOUND");
  await assertPaymentTargetAccess(context.session, payment.organizationId
    ? { scope: "ORGANIZATION", organizationId: payment.organizationId }
    : { scope: "PERSONAL", userId: payment.userId }, "CREATE");
  if (payment.status === "PENDING") return { payment, replayed: true } as const;
  if (payment.providerReference) paymentError("PAYMENT_UNSUPPORTED_OPERATION");
  assertPaymentTransition(payment.status, "PENDING", { retry: true });
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.payment.updateMany({
      where: { id: paymentId, status: payment.status },
      data: { status: PaymentStatus.PENDING, providerReference: null, checkoutPayload: Prisma.JsonNull, callbackPayload: Prisma.JsonNull },
    });
    if (!changed.count) paymentError("PAYMENT_INVALID_TRANSITION");
    if (payment.subscriptionId) await tx.subscription.updateMany({
      where: { id: payment.subscriptionId, status: "CANCELED" }, data: { status: "PENDING_PAYMENT" },
    });
    if (payment.organizationSubscriptionId) await tx.organizationSubscription.updateMany({
      where: { id: payment.organizationSubscriptionId, status: "CANCELED" }, data: { status: "PENDING_PAYMENT" },
    });
    await logMutation(tx, context, "DTSC_PAYMENT_RETRY_REQUESTED", payment.id, payment.organizationId);
    return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  });
  return { payment: updated, replayed: false } as const;
}

/**
 * Paid subscription finalization is deliberately delegated to the existing
 * domain-specific, audited manual settlement. Generic provider finalization
 * is blocked until PAY-4 verifies callback signature, amount and currency.
 */
export async function decideManualPayment(context: PaymentContext, rawInput: unknown) {
  await assertPaymentMutationBoundary(context, "manual-decision");
  const input = parseInput(z.object({
    manualPaymentId: paymentIdSchema,
    action: z.enum(["APPROVE", "REJECT"]),
    comment: z.string().trim().max(500).optional(),
  }).strict(), rawInput);
  await assertInternalPaymentAccess(context.session, "VALIDATOR");
  const manual = await prisma.manualSubscriptionPayment.findUnique({ where: { id: input.manualPaymentId } });
  if (!manual) paymentError("PAYMENT_NOT_FOUND");
  if (manual.validatorUserId !== context.session.userId) paymentError("PAYMENT_VALIDATOR_REQUIRED");
  if (manual.requestedByUserId === context.session.userId) paymentError("PAYMENT_SELF_APPROVAL_FORBIDDEN");
  if (input.action === "REJECT" && !input.comment) paymentError("PAYMENT_EVIDENCE_REQUIRED");
  const result = await finalizeManualSubscriptionPayment(manual.id, {
    userId: context.session.userId, role: context.session.role,
  }, input.action, input.comment);
  // Existing manual finalizer owns its financial transaction; the current
  // route owns its API/audit logging until the PAY-2 route migration.
  return result;
}

/** Safe, idempotent read of a payment already settled by its canonical workflow. */
export async function markPaymentPaid(context: PaymentContext, rawPaymentId: unknown) {
  await assertPaymentMutationBoundary(context, "verify-paid");
  const paymentId = parseInput(paymentIdSchema, rawPaymentId);
  await assertInternalPaymentAccess(context.session, "MANAGE");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true, manualSubscriptionPayment: true } });
  if (!payment) paymentError("PAYMENT_NOT_FOUND");
  if (payment.status === "PAID" && payment.invoice?.status === "PAID") {
    if (payment.manualSubscriptionPayment && payment.manualSubscriptionPayment.status !== "APPROVED") paymentError("PAYMENT_INVOICE_CONFLICT");
    if (!payment.invoice.hrcfoTransactionId) paymentError("PAYMENT_INVOICE_CONFLICT");
    assertExactPaymentAmount(payment, payment.invoice);
    return { payment, replayed: true } as const;
  }
  paymentError("PAYMENT_UNSUPPORTED_OPERATION");
}

/** Private, paginated tenant read; no global-admin bypass of another tenant. */
export async function getTenantPayments(session: PaymentContext["session"], target: PaymentTarget | { scope: "DTSC_INTERNAL" }, options: PaymentPageInput = {}) {
  if (target.scope === "DTSC_INTERNAL") await assertInternalPaymentAccess(session, "READ");
  else await assertPaymentTargetAccess(session, target, "READ");
  const page = Math.min(Math.max(Number.isInteger(options.page) ? options.page! : 1, 1), 10_000);
  const pageSize = Math.min(Math.max(Number.isInteger(options.pageSize) ? options.pageSize! : 25, 1), 100);
  const where: Prisma.PaymentWhereInput = {
    ...(target.scope === "DTSC_INTERNAL" ? {} : target.scope === "ORGANIZATION"
      ? { organizationId: target.organizationId }
      : { userId: target.userId, organizationId: null }),
    ...(options.status ? { status: options.status } : {}),
    ...(options.from || options.to ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({ where, select: {
      id: true, reference: true, status: true, provider: true, amount: true, currency: true,
      paidAt: true, createdAt: true, organizationId: true, subscriptionId: true, organizationSubscriptionId: true,
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.payment.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function getInvoicePaymentState(session: PaymentContext["session"], rawInvoiceId: unknown) {
  const invoiceId = parseInput(paymentIdSchema, rawInvoiceId);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payment: { select: { id: true, userId: true, organizationId: true, reference: true, status: true, paidAt: true, amount: true, currency: true } } },
  });
  if (!invoice) paymentError("PAYMENT_NOT_FOUND");
  await assertPaymentOwnerOrInternal(session, invoice);
  if (invoice.payment) {
    // Never leak a corrupt cross-tenant payment relation, even when the invoice itself is visible.
    if (invoice.payment.organizationId !== invoice.organizationId ||
      (!invoice.organizationId && invoice.payment.userId !== invoice.userId)) paymentError("PAYMENT_INVOICE_CONFLICT");
    assertExactPaymentAmount(invoice, invoice.payment);
  }
  const payment = invoice.payment ? {
    id: invoice.payment.id, reference: invoice.payment.reference, status: invoice.payment.status,
    paidAt: invoice.payment.paidAt, amount: invoice.payment.amount, currency: invoice.payment.currency,
  } : null;
  return { invoice: { id: invoice.id, number: invoice.number, amount: invoice.amount, currency: invoice.currency, status: invoice.status, paidAt: invoice.paidAt }, payment };
}

/** Report money by currency and state, never aggregate across monetary units. */
export async function getPaymentFinanceSummary(session: PaymentContext["session"], target: PaymentTarget | { scope: "DTSC_INTERNAL" }, options: Pick<PaymentPageInput, "from" | "to"> = {}) {
  if (target.scope === "DTSC_INTERNAL") await assertInternalPaymentAccess(session, "READ");
  else await assertPaymentTargetAccess(session, target, "READ");
  const where: Prisma.PaymentWhereInput = {
    ...(target.scope === "DTSC_INTERNAL" ? {} : target.scope === "ORGANIZATION"
      ? { organizationId: target.organizationId }
      : { userId: target.userId, organizationId: null }),
    ...(options.from || options.to ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } } : {}),
  };
  return prisma.payment.groupBy({ by: ["currency", "status"], where, _count: { _all: true }, _sum: { amount: true } });
}
