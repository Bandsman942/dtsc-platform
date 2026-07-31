import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { salesInvoiceCreateSchema, creditNoteCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type SalesInvoiceInput = z.infer<typeof salesInvoiceCreateSchema>;
type CreditNoteInput = z.infer<typeof creditNoteCreateSchema>;

type TaxResolverResult = { rate: Prisma.Decimal; taxCodeId: string | null };

async function resolveTaxRate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  taxCodeId: string | undefined,
  invoiceDate: Date,
): Promise<TaxResolverResult> {
  if (!taxCodeId) return { rate: new Prisma.Decimal(0), taxCodeId: null };
  const rate = await tx.enterpriseTaxRate.findFirst({
    where: {
      organizationId,
      taxCodeId,
      status: "ACTIVE",
      effectiveFrom: { lte: invoiceDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: invoiceDate } }],
      taxCode: { isActive: true },
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!rate) throw new EnterpriseAccountingError("INVOICE_TAX_RATE_NOT_FOUND", 409, { taxCodeId });
  return { rate: rate.rate, taxCodeId };
}

async function calculateSalesInvoiceItems(tx: Prisma.TransactionClient, organizationId: string, invoiceDate: Date, input: SalesInvoiceInput["items"]) {
  const items = [];
  for (const item of input) {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const discountAmount = new Prisma.Decimal(item.discountAmount);
    if (!quantity.isPositive() || unitPrice.isNegative() || discountAmount.isNegative()) throw new EnterpriseAccountingError("INVOICE_LINE_AMOUNT_INVALID", 400);
    if (item.catalogItemId) {
      const catalogItem = await tx.enterpriseCatalogItem.findFirst({ where: { id: item.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!catalogItem) throw new EnterpriseAccountingError("INVOICE_CATALOG_ITEM_INVALID", 409, { catalogItemId: item.catalogItemId });
    }
    const gross = money(quantity.times(unitPrice));
    if (discountAmount.greaterThan(gross)) throw new EnterpriseAccountingError("INVOICE_DISCOUNT_EXCEEDS_GROSS", 400);
    const netAmount = money(gross.minus(discountAmount));
    const tax = await resolveTaxRate(tx, organizationId, item.taxCodeId, invoiceDate);
    const taxAmount = money(netAmount.times(tax.rate));
    const totalAmount = money(netAmount.plus(taxAmount));
    items.push({ ...item, quantity, unitPrice, discountAmount, netAmount, taxCodeId: tax.taxCodeId, taxAmount, totalAmount });
  }
  return items;
}

export async function createSalesInvoice(organizationId: string, actorUserId: string, input: SalesInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const party = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleType: "CUSTOMER", isActive: true } } },
      select: { id: true },
    });
    if (!party) throw new EnterpriseAccountingError("CUSTOMER_PARTY_INVALID", 409);
    if (input.salesOrderId) {
      const order = await tx.enterpriseSalesOrder.findFirst({ where: { id: input.salesOrderId, organizationId, businessPartyId: input.businessPartyId, status: { in: ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED"] } } });
      if (!order) throw new EnterpriseAccountingError("SALES_ORDER_NOT_INVOICEABLE", 409);
      const existing = await tx.enterpriseSalesInvoice.findFirst({ where: { organizationId, salesOrderId: input.salesOrderId, status: { notIn: ["CANCELLED", "VOIDED"] } } });
      if (existing) throw new EnterpriseAccountingError("SALES_ORDER_ALREADY_INVOICED", 409, { invoiceId: existing.id });
    }
    const calculated = await calculateSalesInvoiceItems(tx, organizationId, input.invoiceDate, input.items);
    const subtotal = money(sumDecimals(calculated.map((item) => item.quantity.times(item.unitPrice))));
    const discountTotal = money(sumDecimals(calculated.map((item) => item.discountAmount)));
    const taxTotal = money(sumDecimals(calculated.map((item) => item.taxAmount)));
    const grandTotal = money(sumDecimals(calculated.map((item) => item.totalAmount)));
    if (!grandTotal.isPositive()) throw new EnterpriseAccountingError("SALES_INVOICE_TOTAL_INVALID", 400);
    const invoice = await tx.enterpriseSalesInvoice.create({
      data: {
        organizationId,
        number: financeReference("INV"),
        businessPartyId: input.businessPartyId,
        salesOrderId: input.salesOrderId || null,
        fulfillmentId: input.fulfillmentId || null,
        contractId: input.contractId || null,
        projectId: input.projectId || null,
        status: "DRAFT",
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate || null,
        currencyCode: input.currencyCode,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        outstandingAmount: grandTotal,
        paymentTerms: input.paymentTerms || null,
        notes: input.notes || null,
        createdByUserId: actorUserId,
        items: {
          create: calculated.map((item) => ({
            organizationId,
            catalogItemId: item.catalogItemId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            netAmount: item.netAmount,
            taxCodeId: item.taxCodeId,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
            revenueAccountId: item.revenueAccountId || null,
            projectId: item.projectId || input.projectId || null,
          })),
        },
      },
      include: { items: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesInvoice",
      entityId: invoice.id,
      eventType: "SALES_INVOICE_CREATED",
      summary: `Customer invoice ${invoice.number} created`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { total: grandTotal.toFixed(), currency: input.currencyCode },
    });
    return invoice;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionSalesInvoice(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { action: "SUBMIT" | "APPROVE" | "ISSUE" | "CANCEL" | "VOID"; reason?: string; revision: number },
) {
  if (input.action === "ISSUE") {
    const before = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!before) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (before.status === "ISSUED" || ["PARTIALLY_PAID", "PAID", "OVERDUE"].includes(before.status)) return before;
    if (before.status !== "APPROVED") throw new EnterpriseAccountingError("SALES_INVOICE_NOT_APPROVED", 409);
    if (before.revision !== input.revision) throw new EnterpriseAccountingError("SALES_INVOICE_REVISION_CONFLICT", 409, { currentRevision: before.revision });
    await postBusinessEvent(organizationId, actorUserId, { postingEvent: "SALES_INVOICE_POSTED", sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId });
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
      if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      const receivable = await tx.enterpriseReceivable.upsert({
        where: { salesInvoiceId: invoice.id },
        update: {},
        create: {
          organizationId,
          salesInvoiceId: invoice.id,
          businessPartyId: invoice.businessPartyId,
          currencyCode: invoice.currencyCode,
          originalAmount: invoice.grandTotal,
          outstandingAmount: invoice.grandTotal,
          status: "OPEN",
          dueDate: invoice.dueDate,
        },
      });
      const updated = await tx.enterpriseSalesInvoice.update({
        where: { id: invoice.id },
        data: { status: "ISSUED", issuedAt: invoice.issuedAt || new Date(), postedAt: invoice.postedAt || new Date(), revision: { increment: 1 } },
      });
      await publishFinanceEvent(tx, {
        organizationId,
        entityType: "EnterpriseSalesInvoice",
        entityId: invoice.id,
        eventType: "SALES_INVOICE_ISSUED",
        summary: `Customer invoice ${invoice.number} issued`,
        actorUserId,
        fromStatus: invoice.status,
        toStatus: "ISSUED",
        metadataJson: { receivableId: receivable.id },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SALES_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    const transition = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
      APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
      CANCEL: { from: ["DRAFT"], to: "CANCELLED" },
      VOID: { from: ["ISSUED", "OVERDUE"], to: "VOIDED" },
      ISSUE: { from: [], to: "ISSUED" },
    }[input.action];
    if (!transition.from.includes(invoice.status)) throw new EnterpriseAccountingError("SALES_INVOICE_TRANSITION_INVALID", 409);
    if (input.action === "APPROVE") assertIndependentActor({ actorUserId, relatedUserIds: [invoice.createdByUserId], errorCode: "SALES_INVOICE_SELF_APPROVAL_FORBIDDEN" });
    if (input.action === "VOID") {
      const allocated = await tx.enterprisePaymentAllocation.count({ where: { organizationId, receivable: { salesInvoiceId: invoice.id }, status: "CONFIRMED" } });
      if (allocated > 0) throw new EnterpriseAccountingError("PAID_INVOICE_CANNOT_BE_VOIDED", 409);
    }
    const updated = await tx.enterpriseSalesInvoice.update({
      where: { id: invoice.id },
      data: {
        status: transition.to,
        approvedAt: input.action === "APPROVE" ? new Date() : invoice.approvedAt,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : invoice.approvedByUserId,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesInvoice",
      entityId: invoice.id,
      eventType: `SALES_INVOICE_${input.action}`,
      summary: `Customer invoice ${invoice.number}: ${input.action}`,
      actorUserId,
      fromStatus: invoice.status,
      toStatus: transition.to,
      metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined,
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSalesCreditNote(organizationId: string, actorUserId: string, input: CreditNoteInput) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.enterpriseSalesInvoice.findFirst({
      where: { id: input.invoiceId, organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
      include: { receivable: true },
    });
    if (!invoice?.receivable) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    const calculated = await calculateSalesInvoiceItems(tx, organizationId, input.creditDate, input.items);
    const subtotal = money(sumDecimals(calculated.map((item) => item.netAmount)));
    const taxTotal = money(sumDecimals(calculated.map((item) => item.taxAmount)));
    const grandTotal = money(sumDecimals(calculated.map((item) => item.totalAmount)));
    if (grandTotal.greaterThan(invoice.receivable.outstandingAmount)) throw new EnterpriseAccountingError("CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE", 409);
    const credit = await tx.enterpriseSalesCreditNote.create({
      data: {
        organizationId,
        number: financeReference("CN"),
        salesInvoiceId: invoice.id,
        reason: input.reason,
        status: "DRAFT",
        creditDate: input.creditDate,
        currencyCode: invoice.currencyCode,
        subtotal,
        taxTotal,
        grandTotal,
        createdByUserId: actorUserId,
        items: {
          create: calculated.map((item) => ({
            organizationId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: { items: true },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id, eventType: "SALES_CREDIT_NOTE_CREATED", summary: `Credit note ${credit.number} created`, actorUserId, toStatus: "DRAFT" });
    return credit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndPostSalesCreditNote(organizationId: string, creditNoteId: string, actorUserId: string, revision: number) {
  const credit = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!current) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
    if (current.status === "POSTED") return current;
    if (current.status !== "DRAFT" || current.revision !== revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [current.createdByUserId], errorCode: "SALES_CREDIT_NOTE_SELF_APPROVAL_FORBIDDEN" });
    return tx.enterpriseSalesCreditNote.update({ where: { id: current.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: actorUserId, revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await postBusinessEvent(organizationId, actorUserId, { postingEvent: "SALES_CREDIT_NOTE_POSTED", sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: credit.id });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${credit.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: credit.id, organizationId }, include: { salesInvoice: { include: { receivable: true } } } });
    if (!current?.salesInvoice.receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 409);
    if (current.status === "POSTED") return current;
    const receivable = current.salesInvoice.receivable;
    const outstanding = money(receivable.outstandingAmount.minus(current.grandTotal));
    await tx.enterpriseReceivableAllocation.create({
      data: { organizationId, receivableId: receivable.id, sourceType: "SALES_CREDIT_NOTE", sourceId: current.id, amount: current.grandTotal, allocationDate: current.creditDate, createdByUserId: actorUserId },
    });
    await tx.enterpriseReceivable.update({
      where: { id: receivable.id },
      data: { creditedAmount: { increment: current.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" },
    });
    await tx.enterpriseSalesInvoice.update({
      where: { id: current.salesInvoiceId },
      data: { amountCredited: { increment: current.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CREDIT_NOTE" : current.salesInvoice.status, revision: { increment: 1 } },
    });
    const posted = await tx.enterpriseSalesCreditNote.update({ where: { id: current.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: current.id, eventType: "SALES_CREDIT_NOTE_POSTED", summary: `Credit note ${current.number} posted`, actorUserId, fromStatus: current.status, toStatus: "POSTED", metadataJson: { receivableId: receivable.id } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listReceivables(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: string }) {
  const where: Prisma.EnterpriseReceivableWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { salesInvoice: { OR: [{ number: { contains: input.search, mode: "insensitive" } }, { notes: { contains: input.search, mode: "insensitive" } }] } } : {}),
  };
  const [items, total, openAmount, overdueAmount] = await Promise.all([
    prisma.enterpriseReceivable.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { salesInvoice: true, _count: { select: { paymentAllocations: true, allocations: true } } } }),
    prisma.enterpriseReceivable.count({ where }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { outstandingAmount: true } }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN", dueDate: { lt: new Date() } }, _sum: { outstandingAmount: true } }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) }, metrics: { openAmount: openAmount._sum.outstandingAmount || new Prisma.Decimal(0), overdueAmount: overdueAmount._sum.outstandingAmount || new Prisma.Decimal(0) } };
}
