import { Prisma } from "@prisma/client";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { prisma } from "@/lib/prisma";

export class EnterpriseGamingCheckoutError extends Error {
  constructor(public code: string, public status: number, public details?: Record<string, unknown>) {
    super(code);
  }
}

export function gamingMoney(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

export function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values));
}

export async function ensureGamingWalkInPartyTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
) {
  const migrationKey = "SYSTEM:GAMING:WALK_IN_CUSTOMER";
  const party = await tx.enterpriseBusinessParty.upsert({
    where: { organizationId_migrationKey: { organizationId, migrationKey } },
    update: { status: "ACTIVE", archivedAt: null },
    create: {
      organizationId,
      partyType: "ORGANIZATION",
      legalName: "Client comptoir (Walk-in)",
      displayName: "Client comptoir",
      normalizedName: "client comptoir walk in",
      code: `SYS-GAMING-WALKIN-${organizationId.slice(-6).toUpperCase()}`,
      migrationKey,
      status: "ACTIVE",
      notes: "Tiers système sans donnée personnelle utilisé uniquement pour les ventes Gaming anonymes nécessitant une contrepartie comptable canonique.",
      createdByUserId: actorUserId,
    },
  });
  await tx.enterpriseBusinessPartyRole.upsert({
    where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER" } },
    update: { status: "ACTIVE", archivedAt: null },
    create: {
      organizationId,
      businessPartyId: party.id,
      roleCode: "CUSTOMER",
      status: "ACTIVE",
      createdByUserId: actorUserId,
    },
  });
  return party;
}

export async function requireGamingCheckoutInvoiceTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesInvoiceId: string,
) {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({
    where: { id: salesInvoiceId, organizationId },
    include: {
      items: true,
      receivable: { include: { paymentAllocations: { include: { payment: true } } } },
      creditNotes: true,
    },
  });
  if (!invoice) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_NOT_FOUND", 409);
  return invoice;
}

export async function loadGamingCheckoutDetail(organizationId: string, checkoutId: string) {
  const checkout = await prisma.enterpriseGamingCheckout.findFirst({
    where: { id: checkoutId, organizationId },
    include: { session: { include: { station: true } } },
  });
  if (!checkout) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
  const invoice = await prisma.enterpriseSalesInvoice.findFirst({
    where: { id: checkout.salesInvoiceId, organizationId },
    include: {
      items: true,
      receivable: {
        include: {
          paymentAllocations: {
            include: { payment: true },
            orderBy: { allocatedAt: "asc" },
          },
        },
      },
      creditNotes: { include: { items: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_NOT_FOUND", 409);
  const payments = await prisma.enterprisePayment.findMany({
    where: {
      organizationId,
      OR: [
        { reference: checkout.reference },
        { reference: `${checkout.reference}:REFUND` },
      ],
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  return { checkout, invoice, payments };
}

export async function restockGamingCheckoutTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  checkoutId: string,
  actorUserId: string,
  suffix: "cancel" | "refund",
) {
  const movements = await tx.enterpriseStockMovement.findMany({
    where: {
      organizationId,
      sourceEntityType: "EnterpriseGamingCheckout",
      sourceEntityId: checkoutId,
      direction: "OUT",
      movementType: "SALE_FULFILLMENT",
    },
  });
  for (const movement of movements) {
    await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: movement.inventoryItemId,
      warehouseId: movement.warehouseId,
      storageLocationId: movement.storageLocationId,
      stockLotId: movement.stockLotId,
      movementType: "CUSTOMER_RETURN",
      direction: "IN",
      quantity: Number(movement.quantity),
      sourceEntityType: "EnterpriseGamingCheckout",
      sourceEntityId: checkoutId,
      sourceLineId: movement.sourceLineId || movement.id,
      idempotencyKey: `gaming-checkout:${checkoutId}:${movement.id}:${suffix}`,
      reason: suffix === "refund" ? "Gaming checkout refund" : "Gaming checkout cancellation",
    });
  }
}

export async function syncGamingCheckoutPaidState(
  organizationId: string,
  checkoutId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingCheckout" WHERE id = ${checkoutId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const checkout = await tx.enterpriseGamingCheckout.findFirst({
      where: { id: checkoutId, organizationId },
      include: { session: true },
    });
    if (!checkout) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
    const invoice = await requireGamingCheckoutInvoiceTx(tx, organizationId, checkout.salesInvoiceId);
    const nextStatus = invoice.status === "PAID"
      ? "PAID"
      : invoice.status === "PARTIALLY_PAID"
        ? "PARTIALLY_PAID"
        : "AWAITING_PAYMENT";
    if (checkout.status !== nextStatus) {
      await tx.enterpriseGamingCheckout.update({
        where: { id: checkout.id },
        data: { status: nextStatus, updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
    }
    if (nextStatus === "PAID" && checkout.session.status !== "PAID") {
      await tx.enterpriseGamingSession.update({
        where: { id: checkout.sessionId },
        data: { status: "PAID", updatedByUserId: actorUserId, revision: { increment: 1 } },
      });
      await tx.enterpriseGamingSessionTransition.upsert({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `CHECKOUT:${checkout.id}:PAID` } },
        update: {},
        create: {
          organizationId,
          sessionId: checkout.sessionId,
          action: "CHECKOUT_PAID",
          idempotencyKey: `CHECKOUT:${checkout.id}:PAID`,
          fromStatus: checkout.session.status,
          toStatus: "PAID",
          actorUserId,
          metadataJson: { checkoutId: checkout.id, salesInvoiceId: invoice.id },
        },
      });
    }
    return { checkoutId: checkout.id, invoiceStatus: invoice.status, checkoutStatus: nextStatus };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getGamingCheckoutReceipt(organizationId: string, checkoutId: string) {
  const detail = await loadGamingCheckoutDetail(organizationId, checkoutId);
  const allocations = detail.invoice.receivable?.paymentAllocations.filter((allocation) => allocation.status === "CONFIRMED") || [];
  const confirmedPayments = allocations
    .filter((allocation) => ["CONFIRMED", "RECONCILED"].includes(allocation.payment.status))
    .map((allocation) => ({
      allocationId: allocation.id,
      paymentId: allocation.payment.id,
      paymentNumber: allocation.payment.number,
      methodType: allocation.payment.methodType,
      amount: allocation.amount,
      currencyCode: allocation.payment.currencyCode,
      paymentDate: allocation.payment.paymentDate,
      maskedExternalReference: allocation.payment.maskedExternalReference,
      status: allocation.payment.status,
    }));
  const refunds = detail.payments
    .filter((payment) => payment.paymentType === "REFUND" && ["CONFIRMED", "RECONCILED"].includes(payment.status))
    .map((payment) => ({
      paymentId: payment.id,
      paymentNumber: payment.number,
      methodType: payment.methodType,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      paymentDate: payment.paymentDate,
      maskedExternalReference: payment.maskedExternalReference,
      status: payment.status,
    }));
  const paidAmount = gamingMoney(confirmedPayments.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)));
  const refundedAmount = gamingMoney(refunds.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0)));
  return {
    receiptReference: detail.checkout.reference,
    status: detail.checkout.status,
    createdAt: detail.checkout.createdAt,
    session: {
      id: detail.checkout.session.id,
      reference: detail.checkout.session.reference,
      stationCode: detail.checkout.session.station.stationCode,
      stationName: detail.checkout.session.station.displayName,
      startedAt: detail.checkout.session.startedAt,
      endedAt: detail.checkout.session.endedAt,
      billableSeconds: detail.checkout.session.billableSeconds,
      currency: detail.checkout.session.currency,
      finalAmount: detail.checkout.session.finalAmount,
    },
    invoice: {
      id: detail.invoice.id,
      number: detail.invoice.number,
      status: detail.invoice.status,
      currencyCode: detail.invoice.currencyCode,
      subtotal: detail.invoice.subtotal,
      discountTotal: detail.invoice.discountTotal,
      taxTotal: detail.invoice.taxTotal,
      grandTotal: detail.invoice.grandTotal,
      amountPaid: detail.invoice.amountPaid,
      amountCredited: detail.invoice.amountCredited,
      outstandingAmount: detail.invoice.outstandingAmount,
      invoiceDate: detail.invoice.invoiceDate,
      items: detail.invoice.items,
    },
    payments: confirmedPayments,
    refunds,
    creditNotes: detail.invoice.creditNotes,
    totals: { paidAmount, refundedAmount },
  };
}
