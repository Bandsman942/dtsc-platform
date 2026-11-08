import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createEnterprisePaymentTx } from "@/lib/enterprise/accounting/payments-service";
import { positiveMoneyInputSchema } from "@/lib/enterprise/accounting/schemas";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability, retailInvoiceVisibleSites } from "@/lib/enterprise/retail/site-access";
import { withRetailTransactionRetry } from "@/lib/enterprise/retail/transaction-retry";
import { prisma } from "@/lib/prisma";

export const retailInvoicePaymentProposalSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  financialAccountId: z.string().trim().min(1).max(191),
  methodType: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "CHEQUE"]),
  amount: positiveMoneyInputSchema.refine((value) => {
    const amount = new Prisma.Decimal(value);
    return amount.decimalPlaces() <= 6 && amount.lessThan("100000000000000");
  }, "Le montant doit respecter au maximum six décimales et vingt chiffres."),
  cashSessionId: z.string().trim().min(1).max(191).optional(),
}).strict();

type ProposalInput = z.infer<typeof retailInvoicePaymentProposalSchema>;

function fingerprint(invoiceId: string, input: ProposalInput): string {
  return createHash("sha256").update(JSON.stringify({
    invoiceId, financialAccountId: input.financialAccountId, methodType: input.methodType,
    amount: new Prisma.Decimal(input.amount).toFixed(6), cashSessionId: input.cashSessionId || null,
  })).digest("hex");
}

/** Read only Finance accounts assigned to the invoice's store. Never leak
 * another store's bank/cash accounts, even to a scoped cashier. */
export async function retailInvoicePaymentOptions(organizationId: string, invoiceId: string, actorUserId: string) {
  const checkout = await prisma.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId, salesInvoiceId: invoiceId },
    select: { siteId: true, invoice: { select: { status: true, currencyCode: true, outstandingAmount: true } } },
  });
  if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
  const visibility = await retailInvoiceVisibleSites(organizationId, actorUserId);
  if (!visibility.isOwner && !visibility.collectibleSiteIds.includes(checkout.siteId)) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  await requireRetailSiteCapability(organizationId, actorUserId, checkout.siteId, "COLLECT_PAYMENT", prisma, { requireAssignment: true });
  const accounts = await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, siteId: checkout.siteId, currencyCode: checkout.invoice.currencyCode, status: "ACTIVE", archivedAt: null,
      accountType: { in: ["CASH", "BANK", "MOBILE_MONEY"] } },
    select: { id: true, code: true, name: true, accountType: true, currencyCode: true },
    orderBy: [{ accountType: "asc" }, { name: "asc" }], take: 100,
  });
  const cashSessions = await prisma.enterpriseCashSession.findMany({
    where: { organizationId, siteId: checkout.siteId, cashierUserId: actorUserId, status: "OPEN", financialAccountId: { in: accounts.map((account) => account.id) } },
    select: { id: true, number: true, financialAccountId: true }, take: 100,
  });
  return { accounts, cashSessions, invoiceStatus: checkout.invoice.status, outstandingAmount: checkout.invoice.outstandingAmount, currencyCode: checkout.invoice.currencyCode };
}

/** Cashier creates only a Finance DRAFT and an immutable invoice intent.
 * Approval/confirmation and treasury posting stay entirely in common Finance.
 * All checks and both rows share one serializable transaction. */
export async function proposeRetailInvoicePayment(organizationId: string, invoiceId: string, actorUserId: string, input: ProposalInput) {
  const requestFingerprint = fingerprint(invoiceId, input);
  return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: { invoice: { include: { receivable: true } } },
    });
    if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
    const visibility = await retailInvoiceVisibleSites(organizationId, actorUserId, tx);
    if (!visibility.isOwner && !visibility.collectibleSiteIds.includes(checkout.siteId)) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    await requireRetailSiteCapability(organizationId, actorUserId, checkout.siteId, "COLLECT_PAYMENT", tx, { requireAssignment: true });
    const config = await tx.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } });
    const settings = config?.settingsJson;
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 409);
    }

    const existing = await tx.enterpriseRetailInvoicePaymentProposal.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      include: { payment: true },
    });
    if (existing) {
      if (existing.checkoutId !== checkout.id || existing.recordedByUserId !== actorUserId || existing.requestFingerprint !== requestFingerprint) {
        throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_IDEMPOTENCY_COLLISION", 409);
      }
      return { proposal: existing, payment: existing.payment, idempotent: true };
    }

    const invoice = checkout.invoice;
    if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) || !invoice.receivable || invoice.receivable.status !== "OPEN") {
      throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_NOT_RECEIVABLE", 409);
    }
    const account = await tx.enterpriseFinancialAccount.findFirst({
      where: { id: input.financialAccountId, organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, siteId: true, currencyCode: true, accountType: true },
    });
    if (!account || account.siteId !== checkout.siteId || account.currencyCode !== invoice.currencyCode) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_FINANCIAL_ACCOUNT_SITE_MISMATCH", 409);
    }
    if ((input.methodType === "CASH" && account.accountType !== "CASH") ||
        (input.methodType === "MOBILE_MONEY" && account.accountType !== "MOBILE_MONEY") ||
        (["BANK_TRANSFER", "CARD", "CHEQUE"].includes(input.methodType) && account.accountType !== "BANK")) {
      throw new EnterpriseRetailError("RETAIL_FINANCIAL_ACCOUNT_INVALID", 409);
    }
    if (input.methodType === "CASH") {
      if (!input.cashSessionId) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409);
      const open = await tx.enterpriseCashSession.findFirst({
        where: { id: input.cashSessionId, organizationId, financialAccountId: account.id, siteId: checkout.siteId, cashierUserId: actorUserId, status: "OPEN" }, select: { id: true },
      });
      if (!open) throw new EnterpriseRetailError("RETAIL_OPEN_CASH_SESSION_REQUIRED", 409);
    } else if (input.cashSessionId) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_CASH_SESSION_INVALID", 409);
    }

    const customer = await tx.enterpriseBusinessParty.findFirst({
      where: { organizationId, id: invoice.businessPartyId, status: "ACTIVE", archivedAt: null,
        roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } }, select: { id: true },
    });
    if (!customer) throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_CUSTOMER_INVALID", 409);

    // Prevent two stores/cashiers creating simultaneous claims for the same
    // outstanding balance; the invoice row lock serializes this check.
    const pending = await tx.enterpriseRetailInvoicePaymentProposal.findMany({
      where: { organizationId, checkoutId: checkout.id, payment: { status: { notIn: ["CANCELLED", "REVERSED"] } } },
      select: { payment: { select: { unallocatedAmount: true } } },
    });
    const reserved = pending.reduce((sum, row) => sum.plus(row.payment.unallocatedAmount), new Prisma.Decimal(0));
    const amount = new Prisma.Decimal(input.amount);
    if (amount.greaterThan(invoice.outstandingAmount.minus(reserved))) {
      throw new EnterpriseRetailError("RETAIL_INVOICE_PAYMENT_EXCEEDS_OUTSTANDING", 409);
    }

    const payment = await createEnterprisePaymentTx(tx, organizationId, actorUserId, {
      direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT", methodType: input.methodType,
      financialAccountId: account.id, businessPartyId: invoice.businessPartyId,
      currencyCode: invoice.currencyCode, amount: amount.toFixed(6), paymentDate: new Date(),
      reference: `Retail ${invoice.number}`.slice(0, 160),
      cashSessionId: input.methodType === "CASH" ? input.cashSessionId : undefined,
      idempotencyKey: `retail-invoice-payment:${input.idempotencyKey}`,
    });
    const proposal = await tx.enterpriseRetailInvoicePaymentProposal.create({ data: {
      organizationId, checkoutId: checkout.id, paymentId: payment.id,
      idempotencyKey: input.idempotencyKey, requestFingerprint, recordedByUserId: actorUserId,
    } });
    return { proposal, payment, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }));
}
