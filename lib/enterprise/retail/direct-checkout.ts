import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { submitSalesInvoiceForAssignedApproval, decideSalesInvoiceAssignedApproval } from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { submitPaymentForAssignedApproval, approvePaymentAssignedApproval } from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prepareRetailInvoice, retailInvoicePrepareSchema } from "@/lib/enterprise/retail/invoice-checkout";
import { proposeRetailInvoicePayment } from "@/lib/enterprise/retail/invoice-payments";
import { readRetailOperatingSettings } from "@/lib/enterprise/retail/operating-settings";
import { requireRetailSiteCapability, hasRetailSelfApprovalGrant } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

const id = z.string().trim().min(1).max(191);
export const retailDirectCashCheckoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  siteId: id,
  warehouseId: id,
  businessPartyId: id.nullable().optional(),
  currencyCode: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  expectedGrandTotal: z.string().regex(/^\d{1,14}(?:\.\d{1,6})?$/),
  lines: retailInvoicePrepareSchema.shape.lines,
  payment: z.object({
    methodType: z.literal("CASH"),
    financialAccountId: id,
    cashSessionId: id,
    cashTendered: z.string().regex(/^\d{1,14}(?:\.\d{1,6})?$/),
  }).strict(),
}).strict();
export type DirectCashInput = z.infer<typeof retailDirectCashCheckoutSchema>;

function scopedKey(prefix: string, key: string) {
  return prefix + createHash("sha256").update(key).digest("hex");
}
const fingerprint = (input: DirectCashInput) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

async function requireDirectCashRights(organizationId: string, actorUserId: string, input: DirectCashInput) {
  const [configuration, account, session] = await Promise.all([
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true, status: true } }),
    prisma.enterpriseFinancialAccount.findFirst({
      where: { id: input.payment.financialAccountId, organizationId, siteId: input.siteId,
        status: "ACTIVE", archivedAt: null, accountType: "CASH", currencyCode: input.currencyCode },
      select: { id: true },
    }),
    prisma.enterpriseCashSession.findFirst({
      where: { id: input.payment.cashSessionId, organizationId, siteId: input.siteId,
        cashierUserId: actorUserId, financialAccountId: input.payment.financialAccountId, status: "OPEN" },
      select: { id: true },
    }),
  ]);
  const flags = configuration?.settingsJson;
  if (configuration?.status !== "ACTIVE" ||
      !flags || typeof flags !== "object" || Array.isArray(flags) ||
      flags.invoiceCheckoutEnabled !== true || flags.siteStaffIsolationEnabled !== true ||
      !readRetailOperatingSettings(flags, input.siteId).directCheckoutEnabled) {
    throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_NOT_ACTIVE", 409);
  }
  for (const capability of ["PREPARE_INVOICE", "ISSUE_INVOICE", "COLLECT_PAYMENT", "OPEN_CASH"] as const) {
    await requireRetailSiteCapability(organizationId, actorUserId, input.siteId, capability, prisma, { requireAssignment: true });
  }
  const [invoiceSelf, paymentSelf] = await Promise.all([
    hasRetailSelfApprovalGrant(organizationId, actorUserId, input.siteId, "INVOICE"),
    hasRetailSelfApprovalGrant(organizationId, actorUserId, input.siteId, "PAYMENT"),
  ]);
  if (!invoiceSelf || !paymentSelf) throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_APPROVAL_REQUIRED", 403);
  if (!account) throw new EnterpriseRetailError("RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH", 409);
  if (!session) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409);
}

async function lockAttempt(organizationId: string, actorUserId: string, input: DirectCashInput) {
  const hash = fingerprint(input);
  const token = randomUUID();
  const now = new Date();
  const until = new Date(now.getTime() + 120_000);
  return prisma.$transaction(async (tx) => {
    await tx.enterpriseRetailDirectCheckoutAttempt.upsert({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      create: { organizationId, actorUserId, siteId: input.siteId, idempotencyKey: input.idempotencyKey,
        requestFingerprint: hash, cashTendered: new Prisma.Decimal(input.payment.cashTendered) },
      update: {},
    });
    const attempt = await tx.enterpriseRetailDirectCheckoutAttempt.findUniqueOrThrow({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
    });
    if (attempt.actorUserId !== actorUserId || attempt.siteId !== input.siteId || attempt.requestFingerprint !== hash) {
      throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_IDEMPOTENCY_CONFLICT", 409);
    }
    if (attempt.status === "COMPLETED") return { attempt, token: null };
    const acquired = await tx.enterpriseRetailDirectCheckoutAttempt.updateMany({
      where: { id: attempt.id, organizationId, OR: [{ lockUntil: null }, { lockUntil: { lte: now } }] },
      data: { status: "PROCESSING", lockToken: token, lockUntil: until },
    });
    if (acquired.count !== 1) throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_IN_PROGRESS", 409);
    return { attempt, token };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resultFor(organizationId: string, actorUserId: string, input: DirectCashInput) {
  const record = await prisma.enterpriseRetailDirectCheckoutAttempt.findUniqueOrThrow({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
  });
  if (record.actorUserId !== actorUserId || record.siteId !== input.siteId || !record.salesInvoiceId || !record.paymentId) {
    throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_INCOMPLETE", 409);
  }
  const [invoice, payment, checkout] = await Promise.all([
    prisma.enterpriseSalesInvoice.findFirst({
      where: { organizationId, id: record.salesInvoiceId },
      select: { id: true, number: true, status: true, grandTotal: true, outstandingAmount: true, currencyCode: true },
    }),
    prisma.enterprisePayment.findFirst({
      where: { organizationId, id: record.paymentId }, select: { id: true, status: true, amount: true },
    }),
    prisma.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: record.salesInvoiceId }, select: { stockPostedAt: true },
    }),
  ]);
  if (!invoice || !payment || !checkout || invoice.status !== "PAID" ||
      !invoice.outstandingAmount.isZero() || !checkout.stockPostedAt ||
      payment.status !== "CONFIRMED" || !payment.amount.equals(invoice.grandTotal)) {
    throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_INCOMPLETE", 409);
  }
  const tendered = new Prisma.Decimal(input.payment.cashTendered);
  return {
    status: "COMPLETED" as const, invoiceId: invoice.id, invoiceNumber: invoice.number, paymentId: payment.id,
    currencyCode: invoice.currencyCode, total: invoice.grandTotal.toFixed(2),
    cashTendered: tendered.toFixed(2), changeDue: tendered.minus(invoice.grandTotal).toFixed(2),
  };
}

/** A durable, reentrant adapter, NOT a parallel Finance posting engine.
 * Finance confirmation is the single serializable stock/cash/accounting boundary.
 * Invoice preparation/issuance are separate durable commits; never imply global rollback. */
export async function finalizeRetailDirectCashCheckout(
  organizationId: string, actorUserId: string, input: DirectCashInput,
) {
  // A completed CASH operation remains re-readable even if its drawer
  // has since closed; a retry never starts another transaction.
  const existing = await prisma.enterpriseRetailDirectCheckoutAttempt.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing?.status === "COMPLETED") {
    if (existing.actorUserId !== actorUserId || existing.siteId !== input.siteId ||
        existing.requestFingerprint !== fingerprint(input)) {
      throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_IDEMPOTENCY_CONFLICT", 409);
    }
    await requireRetailSiteCapability(organizationId, actorUserId, input.siteId, "PREPARE_INVOICE", prisma, { requireAssignment: true });
    return { ...await resultFor(organizationId, actorUserId, input), idempotent: true };
  }
  await requireDirectCashRights(organizationId, actorUserId, input);
  const { attempt, token } = await lockAttempt(organizationId, actorUserId, input);
  if (!token) return { ...await resultFor(organizationId, actorUserId, input), idempotent: true };
  try {
    const invoiceKey = scopedKey("direct-invoice:", input.idempotencyKey);
    const paymentKey = scopedKey("direct-payment:", input.idempotencyKey);
    const prepared = await prepareRetailInvoice(organizationId, actorUserId, {
      idempotencyKey: invoiceKey,
      siteId: input.siteId, warehouseId: input.warehouseId,
      businessPartyId: input.businessPartyId ?? null,
      currencyCode: input.currencyCode, lines: input.lines,
    }, { cashTendered: new Prisma.Decimal(input.payment.cashTendered),
      expectedGrandTotal: new Prisma.Decimal(input.expectedGrandTotal) });
    await prisma.enterpriseRetailDirectCheckoutAttempt.updateMany({
      where: { id: attempt.id, organizationId, lockToken: token },
      data: { salesInvoiceId: prepared.invoice.id },
    });
    let invoice = await prisma.enterpriseSalesInvoice.findFirstOrThrow({
      where: { organizationId, id: prepared.invoice.id },
      select: { id: true, status: true, revision: true, grandTotal: true },
    });
    const tendered = new Prisma.Decimal(input.payment.cashTendered);
    if (tendered.lessThan(invoice.grandTotal)) {
      throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_CASH_INSUFFICIENT", 409);
    }
    if (invoice.status === "DRAFT" || invoice.status === "REJECTED") {
      await submitSalesInvoiceForAssignedApproval(organizationId, invoice.id, actorUserId,
        { revision: invoice.revision, approverUserId: actorUserId }, { retailInvoiceSiteId: input.siteId });
      invoice = await prisma.enterpriseSalesInvoice.findFirstOrThrow({
        where: { organizationId, id: invoice.id }, select: { id: true, status: true, revision: true, grandTotal: true },
      });
    }
    if (invoice.status === "PENDING_APPROVAL") {
      await decideSalesInvoiceAssignedApproval(organizationId, invoice.id, actorUserId,
        { action: "APPROVE", revision: invoice.revision });
      invoice = await prisma.enterpriseSalesInvoice.findFirstOrThrow({
        where: { organizationId, id: invoice.id }, select: { id: true, status: true, revision: true, grandTotal: true },
      });
    }
    if (invoice.status === "APPROVED") {
      await transitionSalesInvoice(organizationId, invoice.id, actorUserId,
        { action: "ISSUE", revision: invoice.revision });
      invoice = await prisma.enterpriseSalesInvoice.findFirstOrThrow({
        where: { organizationId, id: invoice.id }, select: { id: true, status: true, revision: true, grandTotal: true },
      });
    }
    if (!["ISSUED", "PAID"].includes(invoice.status)) throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_INCOMPLETE", 409);
    let payment = await prisma.enterpriseRetailInvoicePaymentProposal.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: paymentKey } },
      include: { payment: true },
    });
    if (!payment && invoice.status !== "PAID") {
      const proposed = await proposeRetailInvoicePayment(organizationId, invoice.id, actorUserId, {
        idempotencyKey: paymentKey, financialAccountId: input.payment.financialAccountId,
        methodType: "CASH", amount: invoice.grandTotal.toFixed(6),
        cashSessionId: input.payment.cashSessionId,
      });
      payment = await prisma.enterpriseRetailInvoicePaymentProposal.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: paymentKey } },
        include: { payment: true },
      });
      if (!payment || proposed.payment.id !== payment.paymentId) throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_INCOMPLETE", 409);
    }
    if (!payment || payment.recordedByUserId !== actorUserId || payment.checkoutId !== prepared.checkout.id) {
      throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_INCOMPLETE", 409);
    }
    await prisma.enterpriseRetailDirectCheckoutAttempt.updateMany({
      where: { id: attempt.id, organizationId, lockToken: token }, data: { paymentId: payment.paymentId },
    });
    let settlement = await prisma.enterprisePayment.findFirstOrThrow({
      where: { organizationId, id: payment.paymentId }, select: { id: true, status: true, revision: true },
    });
    if (settlement.status === "DRAFT") {
      await submitPaymentForAssignedApproval(organizationId, settlement.id, actorUserId,
        { revision: settlement.revision, approverUserId: actorUserId }, { retailPaymentSiteId: input.siteId });
      settlement = await prisma.enterprisePayment.findFirstOrThrow({
        where: { organizationId, id: settlement.id }, select: { id: true, status: true, revision: true },
      });
    }
    if (settlement.status === "PENDING_APPROVAL") {
      await approvePaymentAssignedApproval(organizationId, settlement.id, actorUserId,
        { revision: settlement.revision });
      settlement = await prisma.enterprisePayment.findFirstOrThrow({
        where: { organizationId, id: settlement.id }, select: { id: true, status: true, revision: true },
      });
    }
    if (settlement.status === "APPROVED") {
      // Same Finance atomic posting as cashier mode. Never duplicate cash,
      // treasury, receivable, inventory movements or cost-of-sales here.
      await transitionEnterprisePayment(organizationId, settlement.id, actorUserId,
        { action: "CONFIRM", revision: settlement.revision }, { retailSelfCheckoutSiteId: input.siteId });
    }
    const verified = await resultFor(organizationId, actorUserId, input);
    await prisma.$transaction(async (tx) => {
      const changed = await tx.enterpriseRetailDirectCheckoutAttempt.updateMany({
        where: { id: attempt.id, organizationId, lockToken: token, status: "PROCESSING" },
        data: { status: "COMPLETED", completedAt: new Date(), lockToken: null, lockUntil: null },
      });
      if (changed.count !== 1) throw new EnterpriseRetailError("RETAIL_DIRECT_CHECKOUT_IN_PROGRESS", 409);
      await tx.auditLog.create({ data: {
        organizationId, userId: actorUserId, action: "ENTERPRISE_RETAIL_DIRECT_CHECKOUT_COMPLETED",
        entity: "EnterpriseSalesInvoice", entityId: verified.invoiceId, riskLevel: "HIGH",
        metadata: { organizationId, siteId: input.siteId, invoiceId: verified.invoiceId,
          paymentId: verified.paymentId, methodType: "CASH", idempotencyKey: input.idempotencyKey },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...verified, idempotent: false };
  } catch (error) {
    await prisma.enterpriseRetailDirectCheckoutAttempt.updateMany({
      where: { id: attempt.id, organizationId, lockToken: token },
      data: { status: "FAILED", lockToken: null, lockUntil: null },
    }).catch(() => {});
    throw error;
  }
}
