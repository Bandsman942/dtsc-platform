import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertAccountingApprovalCandidate, cancelPendingAccountingApprovals, createAccountingApprovalAssignment } from "@/lib/enterprise/accounting/accounting-approval-service";
import { approveSalesInvoiceAssignedApproval } from "@/lib/enterprise/accounting/accounting-invoice-approval-orchestration";
import { approvePaymentAssignedApproval, submitPaymentForAssignedApproval } from "@/lib/enterprise/accounting/accounting-human-approval-orchestration";
import { confirmCustomerRefundPayment, reverseCustomerPaymentAllocationsForRefund } from "@/lib/enterprise/accounting/customer-refund-service";
import { createEnterprisePayment, allocateEnterprisePayment, transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { createSalesCreditNote, approveAndPostSalesCreditNote, transitionSalesInvoice } from "@/lib/enterprise/accounting/receivables-service";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { applyStockMovementTx } from "@/lib/enterprise/inventory/service";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type {
  gamingCheckoutCommandSchema,
  gamingCheckoutPrepareSchema,
  gamingDailyCloseCreateSchema,
  gamingDailyCloseDecisionSchema,
} from "@/lib/enterprise/gaming/checkout-schemas";

export class EnterpriseGamingCheckoutError extends Error {
  constructor(public code: string, public status: number, public details?: Record<string, unknown>) {
    super(code);
  }
}

type PrepareInput = z.infer<typeof gamingCheckoutPrepareSchema>;
type CommandInput = z.infer<typeof gamingCheckoutCommandSchema>;
type CloseCreateInput = z.infer<typeof gamingDailyCloseCreateSchema>;
type CloseDecisionInput = z.infer<typeof gamingDailyCloseDecisionSchema>;

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

async function ensureWalkInPartyTx(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
  const migrationKey = "SYSTEM:GAMING:WALK_IN_CUSTOMER";
  const party = await tx.enterpriseBusinessParty.upsert({
    where: { organizationId_migrationKey: { organizationId, migrationKey } },
    update: {},
    create: {
      organizationId,
      partyType: "ORGANIZATION",
      legalName: "Client comptoir (Walk-in)",
      displayName: "Client comptoir",
      normalizedName: "client comptoir walk in",
      code: `SYS-GAMING-WALKIN-${organizationId.slice(-6).toUpperCase()}`,
      migrationKey,
      status: "ACTIVE",
      notes: "Tiers système sans donnée personnelle, utilisé uniquement pour les ventes Gaming anonymes exigeant une contrepartie comptable canonique.",
      createdByUserId: actorUserId,
    },
  });
  await tx.enterpriseBusinessPartyRole.upsert({
    where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER" } },
    update: { status: "ACTIVE", archivedAt: null },
    create: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER", status: "ACTIVE", createdByUserId: actorUserId },
  });
  return party;
}

async function requireCheckoutInvoice(tx: Prisma.TransactionClient, organizationId: string, salesInvoiceId: string) {
  const invoice = await tx.enterpriseSalesInvoice.findFirst({
    where: { id: salesInvoiceId, organizationId },
    include: { items: true, receivable: { include: { paymentAllocations: { include: { payment: true } } } }, creditNotes: true },
  });
  if (!invoice) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_NOT_FOUND", 409);
  return invoice;
}

async function loadCheckoutDetail(organizationId: string, checkoutId: string) {
  const checkout = await prisma.enterpriseGamingCheckout.findFirst({
    where: { id: checkoutId, organizationId },
    include: { session: { include: { station: true } } },
  });
  if (!checkout) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
  const invoice = await prisma.enterpriseSalesInvoice.findFirst({
    where: { id: checkout.salesInvoiceId, organizationId },
    include: {
      items: true,
      receivable: { include: { paymentAllocations: { include: { payment: true }, orderBy: { allocatedAt: "asc" } } } },
      creditNotes: { orderBy: { createdAt: "asc" } },
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

async function resolveExtraItemsTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  currency: string,
  extraItems: PrepareInput["extraItems"],
) {
  if (!extraItems.length) return [];
  const ids = extraItems.map((item) => item.catalogItemId);
  if (unique(ids).length !== ids.length) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_DUPLICATE_EXTRA_ITEM", 400);
  const items = await tx.enterpriseCatalogItem.findMany({
    where: { id: { in: ids }, organizationId, status: "ACTIVE", archivedAt: null },
    include: { prices: { where: { status: "ACTIVE", archivedAt: null, priceType: "SALE", currency, effectiveFrom: { lte: new Date() }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" } } },
  });
  if (items.length !== ids.length) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_ITEM_INVALID", 409);
  const byId = new Map(items.map((item) => [item.id, item]));
  return extraItems.map((requested) => {
    const item = byId.get(requested.catalogItemId)!;
    if (item.itemType === "SERVICE") throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_MUST_BE_PHYSICAL", 409, { catalogItemId: item.id });
    const price = item.prices[0];
    if (!price) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_EXTRA_PRICE_MISSING", 409, { catalogItemId: item.id, currency });
    const quantity = money(requested.quantity);
    const unitPrice = money(price.amount);
    const gross = money(quantity.times(unitPrice));
    const taxRate = money(price.taxRate || 0);
    const net = price.taxIncluded && taxRate.gt(0) ? money(gross.div(new Prisma.Decimal(1).plus(taxRate))) : gross;
    const tax = price.taxIncluded ? money(gross.minus(net)) : money(net.times(taxRate));
    const total = price.taxIncluded ? gross : money(net.plus(tax));
    return { item, quantity, unitPrice, net, tax, total };
  });
}

export async function prepareGamingCheckout(organizationId: string, actorUserId: string, input: PrepareInput) {
  const existing = await prisma.enterpriseGamingCheckout.findFirst({
    where: { organizationId, OR: [{ sessionId: input.sessionId }, { idempotencyKey: input.idempotencyKey }] },
    select: { id: true },
  });
  if (existing) return { ...(await loadCheckoutDetail(organizationId, existing.id)), idempotent: true };
  await assertAccountingApprovalCandidate({ organizationId, targetEntityType: "EnterpriseSalesInvoice", requesterUserId: actorUserId, approverUserId: input.invoiceApproverUserId });

  const createdId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingSession" WHERE id = ${input.sessionId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const retry = await tx.enterpriseGamingCheckout.findFirst({ where: { organizationId, OR: [{ sessionId: input.sessionId }, { idempotencyKey: input.idempotencyKey }] }, select: { id: true } });
    if (retry) return retry.id;
    const session = await tx.enterpriseGamingSession.findFirst({
      where: { id: input.sessionId, organizationId, archivedAt: null },
      include: { station: true },
    });
    if (!session) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SESSION_NOT_FOUND", 404);
    if (!["ENDED", "TO_CHECKOUT"].includes(session.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SESSION_NOT_READY", 409);
    if (!session.serviceCatalogItemId || !session.finalAmount || !session.finalAmount.isPositive() || !session.currency) {
      throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_BILLABLE_SESSION_REQUIRED", 409);
    }
    const service = await tx.enterpriseCatalogItem.findFirst({ where: { id: session.serviceCatalogItemId, organizationId, status: "ACTIVE", archivedAt: null, itemType: "SERVICE" } });
    if (!service) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_SERVICE_INVALID", 409);
    const extraLines = await resolveExtraItemsTx(tx, organizationId, session.currency, input.extraItems);
    const trackedExtras = extraLines.filter((line) => line.item.trackInventory);
    if (trackedExtras.length && !input.warehouseId) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_WAREHOUSE_REQUIRED", 409);
    if (input.warehouseId) {
      const warehouse = await tx.enterpriseWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!warehouse) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_WAREHOUSE_INVALID", 409);
      if (input.storageLocationId) {
        const location = await tx.enterpriseStorageLocation.findFirst({ where: { id: input.storageLocationId, organizationId, warehouseId: warehouse.id, status: "ACTIVE", archivedAt: null } });
        if (!location) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_LOCATION_INVALID", 409);
      }
    }
    const businessParty = session.businessPartyId
      ? await tx.enterpriseBusinessParty.findFirst({ where: { id: session.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } } })
      : await ensureWalkInPartyTx(tx, organizationId, actorUserId);
    if (!businessParty) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CUSTOMER_INVALID", 409);

    const serviceAmount = money(session.finalAmount);
    const subtotal = money(extraLines.reduce((total, line) => total.plus(line.net), serviceAmount));
    const taxTotal = money(extraLines.reduce((total, line) => total.plus(line.tax), money(0)));
    const grandTotal = money(extraLines.reduce((total, line) => total.plus(line.total), serviceAmount));
    const invoice = await tx.enterpriseSalesInvoice.create({
      data: {
        organizationId,
        number: financeReference("INV"),
        businessPartyId: businessParty.id,
        status: "PENDING_APPROVAL",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currencyCode: session.currency,
        paymentTerms: "Point of service",
        notes: `Gaming session ${session.reference}`,
        subtotal,
        discountTotal: money(0),
        taxTotal,
        grandTotal,
        outstandingAmount: grandTotal,
        createdByUserId: actorUserId,
        items: {
          create: [
            { organizationId, catalogItemId: service.id, description: service.name, quantity: money(1), unitPrice: serviceAmount, discountAmount: money(0), netAmount: serviceAmount, taxAmount: money(0), totalAmount: serviceAmount },
            ...extraLines.map((line) => ({ organizationId, catalogItemId: line.item.id, description: line.item.name, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: money(0), netAmount: line.net, taxAmount: line.tax, totalAmount: line.total })),
          ],
        },
      },
      include: { items: true },
    });
    const checkout = await tx.enterpriseGamingCheckout.create({
      data: { organizationId, reference: `GC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`, sessionId: session.id, salesInvoiceId: invoice.id, status: "INVOICE_PENDING", idempotencyKey: input.idempotencyKey, createdByUserId: actorUserId },
    });
    await createAccountingApprovalAssignment(tx, { organizationId, targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, requesterUserId: actorUserId, approverUserId: input.invoiceApproverUserId });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "SALES_INVOICE_SUBMIT", summary: `Customer invoice ${invoice.number}: SUBMIT`, actorUserId, fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL", metadataJson: { source: "GAMING_CHECKOUT", checkoutId: checkout.id, approverUserId: input.invoiceApproverUserId } });

    if (session.status !== "TO_CHECKOUT") {
      await tx.enterpriseGamingSession.update({ where: { id: session.id }, data: { status: "TO_CHECKOUT", updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await tx.enterpriseGamingSessionTransition.create({ data: { organizationId, sessionId: session.id, action: "CHECKOUT_OPEN", idempotencyKey: `CHECKOUT:${checkout.id}:OPEN`, fromStatus: session.status, toStatus: "TO_CHECKOUT", actorUserId, metadataJson: { checkoutId: checkout.id, salesInvoiceId: invoice.id } } });
    }

    for (const line of trackedExtras) {
      const inventoryItem = await tx.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItemId: line.item.id, status: "ACTIVE", archivedAt: null } });
      if (!inventoryItem) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVENTORY_ITEM_REQUIRED", 409, { catalogItemId: line.item.id });
      const invoiceItem = invoice.items.find((item) => item.catalogItemId === line.item.id);
      if (!invoiceItem) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_LINE_MISSING", 409);
      await applyStockMovementTx(tx, organizationId, actorUserId, {
        inventoryItemId: inventoryItem.id,
        warehouseId: input.warehouseId!,
        storageLocationId: input.storageLocationId || undefined,
        movementType: "SALE_FULFILLMENT",
        direction: "OUT",
        quantity: line.quantity.toFixed(),
        movementDate: new Date(),
        sourceEntityType: "EnterpriseGamingCheckout",
        sourceEntityId: checkout.id,
        sourceLineId: invoiceItem.id,
        idempotencyKey: `gaming-checkout:${checkout.id}:${invoiceItem.id}:out`,
      });
    }
    return checkout.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

  return { ...(await loadCheckoutDetail(organizationId, createdId)), idempotent: false };
}

async function restockGamingCheckoutTx(tx: Prisma.TransactionClient, organizationId: string, checkoutId: string, actorUserId: string, suffix: string) {
  const movements = await tx.enterpriseStockMovement.findMany({ where: { organizationId, sourceEntityType: "EnterpriseGamingCheckout", sourceEntityId: checkoutId, direction: "OUT", movementType: "SALE_FULFILLMENT" } });
  for (const movement of movements) {
    await applyStockMovementTx(tx, organizationId, actorUserId, {
      inventoryItemId: movement.inventoryItemId,
      warehouseId: movement.warehouseId,
      storageLocationId: movement.storageLocationId || undefined,
      lotId: movement.lotId || undefined,
      movementType: "CUSTOMER_RETURN",
      direction: "IN",
      quantity: movement.quantity.toFixed(),
      movementDate: new Date(),
      sourceEntityType: "EnterpriseGamingCheckout",
      sourceEntityId: checkoutId,
      sourceLineId: movement.sourceLineId || movement.id,
      idempotencyKey: `gaming-checkout:${checkoutId}:${movement.id}:${suffix}`,
    });
  }
}

async function syncPaidState(organizationId: string, checkoutId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingCheckout" WHERE id = ${checkoutId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const checkout = await tx.enterpriseGamingCheckout.findFirst({ where: { id: checkoutId, organizationId }, include: { session: true } });
    if (!checkout) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_FOUND", 404);
    const invoice = await requireCheckoutInvoice(tx, organizationId, checkout.salesInvoiceId);
    const nextStatus = invoice.status === "PAID" ? "PAID" : invoice.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "AWAITING_PAYMENT";
    if (checkout.status !== nextStatus) await tx.enterpriseGamingCheckout.update({ where: { id: checkout.id }, data: { status: nextStatus, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    if (nextStatus === "PAID" && checkout.session.status !== "PAID") {
      await tx.enterpriseGamingSession.update({ where: { id: checkout.sessionId }, data: { status: "PAID", updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await tx.enterpriseGamingSessionTransition.upsert({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `CHECKOUT:${checkout.id}:PAID` } },
        update: {},
        create: { organizationId, sessionId: checkout.sessionId, action: "CHECKOUT_PAID", idempotencyKey: `CHECKOUT:${checkout.id}:PAID`, fromStatus: checkout.session.status, toStatus: "PAID", actorUserId, metadataJson: { checkoutId: checkout.id, salesInvoiceId: invoice.id } },
      });
    }
    return { checkoutId: checkout.id, invoiceStatus: invoice.status, checkoutStatus: nextStatus };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function commandGamingCheckout(organizationId: string, checkoutId: string, actorUserId: string, input: CommandInput) {
  const snapshot = await loadCheckoutDetail(organizationId, checkoutId);
  if (snapshot.checkout.revision !== input.revision) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REVISION_CONFLICT", 409, { currentRevision: snapshot.checkout.revision });

  if (input.action === "APPROVE_INVOICE") {
    let invoice = snapshot.invoice;
    if (invoice.status === "PENDING_APPROVAL") invoice = await approveSalesInvoiceAssignedApproval(organizationId, invoice.id, actorUserId, { revision: invoice.revision, reason: input.reason });
    if (invoice.status === "APPROVED") invoice = await transitionSalesInvoice(organizationId, invoice.id, actorUserId, { action: "ISSUE", revision: invoice.revision, reason: input.reason });
    if (!["ISSUED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_INVOICE_NOT_ISSUED", 409);
    await prisma.enterpriseGamingCheckout.update({ where: { id: checkoutId }, data: { status: invoice.status === "PAID" ? "PAID" : invoice.status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "AWAITING_PAYMENT", updatedByUserId: actorUserId, revision: { increment: 1 } } });
    await syncPaidState(organizationId, checkoutId, actorUserId);
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), idempotent: false };
  }

  if (input.action === "ADD_PAYMENT") {
    if (!["AWAITING_PAYMENT", "PARTIALLY_PAID"].includes(snapshot.checkout.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_PAYABLE", 409);
    const receivable = snapshot.invoice.receivable;
    if (!receivable || !receivable.outstandingAmount.isPositive()) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
    await assertAccountingApprovalCandidate({ organizationId, targetEntityType: "EnterprisePayment", requesterUserId: actorUserId, approverUserId: input.paymentApproverUserId });
    const pending = await prisma.enterprisePayment.findMany({ where: { organizationId, reference: snapshot.checkout.reference, paymentType: "CUSTOMER_PAYMENT", status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "RECONCILED"] } } });
    const reserved = pending.reduce((total, payment) => total.plus(["CONFIRMED", "RECONCILED"].includes(payment.status) ? payment.unallocatedAmount : payment.amount), money(0));
    const available = money(Prisma.Decimal.max(0, receivable.outstandingAmount.minus(reserved)));
    const requestedAmount = money(input.amount);
    if (requestedAmount.greaterThan(available)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_EXCEEDS_OUTSTANDING", 409, { available: available.toFixed(), requested: requestedAmount.toFixed() });
    const stableKey = `gaming-checkout:${checkoutId}:payment:${input.idempotencyKey}`;
    let payment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: stableKey } });
    if (!payment) {
      payment = await createEnterprisePayment(organizationId, actorUserId, {
        direction: "INBOUND",
        paymentType: "CUSTOMER_PAYMENT",
        methodType: input.methodType,
        financialAccountId: input.financialAccountId,
        businessPartyId: snapshot.invoice.businessPartyId,
        currencyCode: snapshot.invoice.currencyCode,
        amount: requestedAmount.toFixed(),
        paymentDate: new Date(),
        reference: snapshot.checkout.reference,
        maskedExternalReference: input.maskedExternalReference || input.reference || undefined,
        idempotencyKey: stableKey,
      });
      payment = await submitPaymentForAssignedApproval(organizationId, payment.id, actorUserId, { revision: payment.revision, approverUserId: input.paymentApproverUserId, reason: `Gaming checkout ${snapshot.checkout.reference}` });
    }
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), payment, idempotent: payment.status !== "PENDING_APPROVAL" };
  }

  if (input.action === "APPROVE_PAYMENT") {
    const receivable = snapshot.invoice.receivable;
    if (!receivable) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
    let payment = await prisma.enterprisePayment.findFirst({ where: { id: input.paymentId, organizationId, reference: snapshot.checkout.reference, paymentType: "CUSTOMER_PAYMENT", direction: "INBOUND" } });
    if (!payment || payment.currencyCode !== snapshot.invoice.currencyCode || payment.businessPartyId !== snapshot.invoice.businessPartyId) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_INVALID", 409);
    if (payment.status === "PENDING_APPROVAL") payment = await approvePaymentAssignedApproval(organizationId, payment.id, actorUserId, { revision: payment.revision, reason: input.reason });
    if (payment.status === "APPROVED") payment = await transitionEnterprisePayment(organizationId, payment.id, actorUserId, { action: "CONFIRM", revision: payment.revision, reason: input.reason });
    if (!["CONFIRMED", "RECONCILED"].includes(payment.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_PAYMENT_NOT_CONFIRMED", 409);
    const existingAllocation = await prisma.enterprisePaymentAllocation.findFirst({ where: { organizationId, paymentId: payment.id, receivableId: receivable.id, status: "CONFIRMED" } });
    if (!existingAllocation && payment.unallocatedAmount.isPositive()) {
      const refreshedReceivable = await prisma.enterpriseReceivable.findFirst({ where: { id: receivable.id, organizationId } });
      if (!refreshedReceivable?.outstandingAmount.isPositive()) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_OPEN", 409);
      const amount = Prisma.Decimal.min(payment.unallocatedAmount, refreshedReceivable.outstandingAmount);
      await allocateEnterprisePayment(organizationId, payment.id, actorUserId, { receivableId: receivable.id, amount: amount.toFixed() });
    }
    await syncPaidState(organizationId, checkoutId, actorUserId);
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), idempotent: Boolean(existingAllocation) };
  }

  if (input.action === "CANCEL") {
    if (snapshot.checkout.status !== "INVOICE_PENDING") throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CANNOT_CANCEL", 409);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingCheckout" WHERE id = ${checkoutId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const checkout = await tx.enterpriseGamingCheckout.findFirst({ where: { id: checkoutId, organizationId }, include: { session: true } });
      if (!checkout || checkout.status !== "INVOICE_PENDING" || checkout.revision !== input.revision) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REVISION_CONFLICT", 409);
      const invoice = await requireCheckoutInvoice(tx, organizationId, checkout.salesInvoiceId);
      if (["ISSUED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CANNOT_CANCEL", 409);
      await cancelPendingAccountingApprovals(tx, { organizationId, targetEntityTypes: ["EnterpriseSalesInvoice"], targetEntityId: invoice.id, reason: input.reason });
      await tx.enterpriseSalesInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", revision: { increment: 1 } } });
      await restockGamingCheckoutTx(tx, organizationId, checkout.id, actorUserId, "cancel");
      await tx.enterpriseGamingCheckout.update({ where: { id: checkout.id }, data: { status: "CANCELLED", updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await tx.enterpriseGamingSession.update({ where: { id: checkout.sessionId }, data: { status: "CANCELLED", updatedByUserId: actorUserId, revision: { increment: 1 } } });
      await tx.enterpriseGamingSessionTransition.create({ data: { organizationId, sessionId: checkout.sessionId, action: "CHECKOUT_CANCELLED", idempotencyKey: `CHECKOUT:${checkout.id}:CANCELLED`, fromStatus: checkout.session.status, toStatus: "CANCELLED", actorUserId, metadataJson: { checkoutId: checkout.id, reason: input.reason.slice(0, 500) } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "SALES_INVOICE_CANCEL", summary: `Customer invoice ${invoice.number}: CANCEL`, actorUserId, fromStatus: invoice.status, toStatus: "CANCELLED", metadataJson: { source: "GAMING_CHECKOUT", reason: input.reason.slice(0, 500) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), idempotent: false };
  }

  if (input.action === "REQUEST_REFUND") {
    if (snapshot.checkout.status === "REFUND_PENDING") return { ...snapshot, idempotent: true };
    if (snapshot.checkout.status !== "PAID" || snapshot.invoice.status !== "PAID") throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_NOT_REFUNDABLE", 409);
    await assertAccountingApprovalCandidate({ organizationId, targetEntityType: "EnterprisePayment", requesterUserId: actorUserId, approverUserId: input.refundApproverUserId });
    const stableKey = `gaming-checkout:${checkoutId}:refund:${input.idempotencyKey}`;
    let refund = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: stableKey } });
    if (!refund) {
      refund = await createEnterprisePayment(organizationId, actorUserId, {
        direction: "OUTBOUND",
        paymentType: "REFUND",
        methodType: input.methodType,
        financialAccountId: input.financialAccountId,
        businessPartyId: snapshot.invoice.businessPartyId,
        currencyCode: snapshot.invoice.currencyCode,
        amount: snapshot.invoice.grandTotal.toFixed(),
        paymentDate: new Date(),
        reference: `${snapshot.checkout.reference}:REFUND`,
        maskedExternalReference: input.maskedExternalReference || input.reference || undefined,
        idempotencyKey: stableKey,
      });
      refund = await submitPaymentForAssignedApproval(organizationId, refund.id, actorUserId, { revision: refund.revision, approverUserId: input.refundApproverUserId, reason: input.reason });
    }
    await prisma.enterpriseGamingCheckout.update({ where: { id: checkoutId }, data: { status: "REFUND_PENDING", refundRequestedAt: new Date(), refundRequestedByUserId: actorUserId, refundReason: input.reason, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), refundPayment: refund, idempotent: false };
  }

  if (input.action === "APPROVE_REFUND") {
    if (!["REFUND_PENDING", "REFUNDED"].includes(snapshot.checkout.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_NOT_PENDING", 409);
    if (snapshot.checkout.status === "REFUNDED") return { ...snapshot, idempotent: true };
    if (!snapshot.checkout.refundRequestedByUserId || snapshot.checkout.refundRequestedByUserId === actorUserId) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_SELF_APPROVAL_FORBIDDEN", 403);
    const receivable = snapshot.invoice.receivable;
    if (!receivable) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_RECEIVABLE_NOT_FOUND", 409);
    let refund = await prisma.enterprisePayment.findFirst({ where: { organizationId, reference: `${snapshot.checkout.reference}:REFUND`, paymentType: "REFUND", direction: "OUTBOUND", status: { notIn: ["CANCELLED", "REVERSED"] } }, orderBy: { createdAt: "desc" } });
    if (!refund) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_PAYMENT_NOT_FOUND", 409);
    if (refund.status === "PENDING_APPROVAL") refund = await approvePaymentAssignedApproval(organizationId, refund.id, actorUserId, { revision: refund.revision, reason: input.reason });
    if (!["APPROVED", "CONFIRMED", "RECONCILED"].includes(refund.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_PAYMENT_NOT_APPROVED", 409);

    await reverseCustomerPaymentAllocationsForRefund(organizationId, receivable.id, actorUserId, snapshot.checkout.refundReason || input.reason);
    let credit = await prisma.enterpriseSalesCreditNote.findFirst({ where: { organizationId, salesInvoiceId: snapshot.invoice.id, reason: { startsWith: `Gaming refund ${snapshot.checkout.reference}:` } }, orderBy: { createdAt: "desc" } });
    if (!credit) {
      credit = await createSalesCreditNote(organizationId, snapshot.checkout.refundRequestedByUserId, {
        invoiceId: snapshot.invoice.id,
        reason: `Gaming refund ${snapshot.checkout.reference}: ${snapshot.checkout.refundReason || input.reason}`,
        creditDate: new Date(),
        items: snapshot.invoice.items.map((item) => ({ catalogItemId: item.catalogItemId || undefined, description: item.description, quantity: item.quantity.toFixed(), unitPrice: item.unitPrice.toFixed(), discountAmount: item.discountAmount.toFixed(), taxCodeId: item.taxCodeId || undefined })),
      });
    }
    if (credit.status === "DRAFT") credit = await approveAndPostSalesCreditNote(organizationId, credit.id, actorUserId, credit.revision);
    if (credit.status !== "POSTED") throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_CREDIT_NOTE_NOT_POSTED", 409);
    if (refund.status === "APPROVED") refund = await confirmCustomerRefundPayment(organizationId, refund.id, actorUserId, { revision: refund.revision, reason: snapshot.checkout.refundReason || input.reason });
    if (!["CONFIRMED", "RECONCILED"].includes(refund.status)) throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_REFUND_NOT_CONFIRMED", 409);

    await prisma.$transaction(async (tx) => {
      await restockGamingCheckoutTx(tx, organizationId, checkoutId, actorUserId, "refund");
      await tx.enterpriseGamingCheckout.update({ where: { id: checkoutId }, data: { status: "REFUNDED", refundedAt: new Date(), updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...(await loadCheckoutDetail(organizationId, checkoutId)), refundPayment: refund, creditNote: credit, idempotent: false };
  }

  throw new EnterpriseGamingCheckoutError("GAMING_CHECKOUT_ACTION_INVALID", 400);
}

export async function listGamingCheckouts(organizationId: string, input: { page: number; pageSize: number; status?: string; search?: string }) {
  const where: Prisma.EnterpriseGamingCheckoutWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [{ reference: { contains: input.search, mode: "insensitive" } }, { session: { reference: { contains: input.search, mode: "insensitive" } } }] } : {}),
  };
  const [items, total, grouped] = await Promise.all([
    prisma.enterpriseGamingCheckout.findMany({ where, include: { session: { include: { station: true } } }, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.enterpriseGamingCheckout.count({ where }),
    prisma.enterpriseGamingCheckout.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const invoiceIds = items.map((item) => item.salesInvoiceId);
  const invoices = invoiceIds.length ? await prisma.enterpriseSalesInvoice.findMany({ where: { organizationId, id: { in: invoiceIds } }, include: { receivable: true } }) : [];
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  return {
    items: items.map((item) => ({ ...item, invoice: invoiceById.get(item.salesInvoiceId) || null })),
    pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) },
    metrics: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
  };
}

export async function getGamingCheckout(organizationId: string, checkoutId: string) {
  return loadCheckoutDetail(organizationId, checkoutId);
}

function utcBusinessWindow(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function createGamingDailyClose(organizationId: string, actorUserId: string, input: CloseCreateInput) {
  const existing = await prisma.enterpriseGamingDailyClose.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey }, select: { id: true } });
  if (existing) return { close: await prisma.enterpriseGamingDailyClose.findFirstOrThrow({ where: { id: existing.id, organizationId }, include: { lines: true } }), idempotent: true };
  if (input.siteId) {
    const site = await prisma.enterpriseSite.findFirst({ where: { id: input.siteId, organizationId, status: "ACTIVE", archivedAt: null } });
    if (!site) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_SITE_INVALID", 409);
  }
  const declarationKeys = input.declarations.map((item) => `${item.financialAccountId}:${item.methodType}`);
  if (unique(declarationKeys).length !== declarationKeys.length) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_DUPLICATE_SCOPE", 400);
  const accounts = await prisma.enterpriseFinancialAccount.findMany({ where: { organizationId, id: { in: unique(input.declarations.map((item) => item.financialAccountId)) }, status: "ACTIVE", archivedAt: null } });
  if (accounts.length !== unique(input.declarations.map((item) => item.financialAccountId)).length) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_FINANCIAL_ACCOUNT_INVALID", 409);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const { start, end } = utcBusinessWindow(input.businessDate);
  const checkoutRefs = (await prisma.enterpriseGamingCheckout.findMany({ where: { organizationId, createdAt: { lt: end }, status: { in: ["AWAITING_PAYMENT", "PARTIALLY_PAID", "PAID", "REFUND_PENDING", "REFUNDED"] } }, select: { reference: true } })).map((item) => item.reference);

  const close = await prisma.$transaction(async (tx) => {
    const retry = await tx.enterpriseGamingDailyClose.findFirst({ where: { organizationId, idempotencyKey: input.idempotencyKey }, include: { lines: true } });
    if (retry) return retry;
    const lines = [] as Array<{ financialAccountId: string; methodType: string; accountType: string; currencyCode: string; cashSessionId: string | null; paymentCount: number; expectedAmount: Prisma.Decimal; declaredAmount: Prisma.Decimal; differenceAmount: Prisma.Decimal; varianceReason: string | null }>;
    for (const declaration of input.declarations) {
      const account = accountById.get(declaration.financialAccountId)!;
      const payments = checkoutRefs.length ? await tx.enterprisePayment.findMany({
        where: { organizationId, financialAccountId: account.id, methodType: declaration.methodType, paymentType: "CUSTOMER_PAYMENT", direction: "INBOUND", status: { in: ["CONFIRMED", "RECONCILED"] }, paymentDate: { gte: start, lt: end }, reference: { in: checkoutRefs } },
        select: { amount: true },
      }) : [];
      const expected = money(payments.reduce((total, payment) => total.plus(payment.amount), money(0)));
      const declared = money(declaration.declaredAmount);
      const difference = money(declared.minus(expected));
      if (!difference.isZero() && !declaration.varianceReason?.trim()) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_VARIANCE_REASON_REQUIRED", 409, { financialAccountId: account.id, currency: account.currencyCode, expected: expected.toFixed(), declared: declared.toFixed() });
      const cashSession = account.accountType === "CASH" ? await tx.enterpriseCashSession.findFirst({ where: { organizationId, financialAccountId: account.id, ...(input.siteId ? { siteId: input.siteId } : {}), openedAt: { lt: end }, status: { in: ["OPEN", "PENDING_VALIDATION", "CLOSED"] } }, orderBy: { openedAt: "desc" }, select: { id: true } }) : null;
      lines.push({ financialAccountId: account.id, methodType: declaration.methodType, accountType: account.accountType, currencyCode: account.currencyCode, cashSessionId: cashSession?.id || null, paymentCount: payments.length, expectedAmount: expected, declaredAmount: declared, differenceAmount: difference, varianceReason: declaration.varianceReason?.trim() || null });
    }
    return tx.enterpriseGamingDailyClose.create({ data: { organizationId, reference: `GDC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`, businessDate: start, siteId: input.siteId || null, status: "SUBMITTED", submittedByUserId: actorUserId, notes: input.notes || null, idempotencyKey: input.idempotencyKey, lines: { create: lines.map((line) => ({ organizationId, ...line })) } }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { close, idempotent: false };
}

export async function decideGamingDailyClose(organizationId: string, closeId: string, actorUserId: string, input: CloseDecisionInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseGamingDailyClose" WHERE id = ${closeId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const close = await tx.enterpriseGamingDailyClose.findFirst({ where: { id: closeId, organizationId }, include: { lines: true } });
    if (!close) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_NOT_FOUND", 404);
    if (close.revision !== input.revision) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_REVISION_CONFLICT", 409, { currentRevision: close.revision });
    if (close.status !== "SUBMITTED") throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_ALREADY_DECIDED", 409);
    if (close.submittedByUserId === actorUserId) throw new EnterpriseGamingCheckoutError("GAMING_CLOSE_SELF_VALIDATION_FORBIDDEN", 403);
    const nextStatus = input.action === "VALIDATE" ? "VALIDATED" : "REJECTED";
    return tx.enterpriseGamingDailyClose.update({ where: { id: close.id }, data: { status: nextStatus, validatedByUserId: actorUserId, validatedAt: input.action === "VALIDATE" ? new Date() : null, rejectedAt: input.action === "REJECT" ? new Date() : null, rejectionReason: input.action === "REJECT" ? input.reason || null : null, revision: { increment: 1 } }, include: { lines: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listGamingDailyCloses(organizationId: string, input: { page: number; pageSize: number; status?: string }) {
  const where: Prisma.EnterpriseGamingDailyCloseWhereInput = { organizationId, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.enterpriseGamingDailyClose.findMany({ where, include: { lines: true }, orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.enterpriseGamingDailyClose.count({ where }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) } };
}
