import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { creditNoteCreateSchema, salesInvoiceCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type SalesInvoiceInput = z.infer<typeof salesInvoiceCreateSchema>;
type CreditNoteInput = z.infer<typeof creditNoteCreateSchema>;
type CalculatedItem = SalesInvoiceInput["items"][number] & {
  quantityDecimal: Prisma.Decimal;
  unitPriceDecimal: Prisma.Decimal;
  discountDecimal: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

async function calculateItems(
  tx: Prisma.TransactionClient,
  organizationId: string,
  documentDate: Date,
  items: SalesInvoiceInput["items"],
): Promise<CalculatedItem[]> {
  const calculated: CalculatedItem[] = [];
  for (const item of items) {
    const quantityDecimal = new Prisma.Decimal(item.quantity);
    const unitPriceDecimal = new Prisma.Decimal(item.unitPrice);
    const discountDecimal = new Prisma.Decimal(item.discountAmount);
    if (!quantityDecimal.isPositive() || unitPriceDecimal.isNegative() || discountDecimal.isNegative()) {
      throw new EnterpriseAccountingError("SALES_INVOICE_LINE_INVALID", 400);
    }
    if (item.catalogItemId) {
      const catalog = await tx.enterpriseCatalogItem.findFirst({ where: { id: item.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!catalog) throw new EnterpriseAccountingError("SALES_INVOICE_CATALOG_ITEM_INVALID", 409);
    }
    const gross = money(quantityDecimal.times(unitPriceDecimal));
    if (discountDecimal.greaterThan(gross)) throw new EnterpriseAccountingError("SALES_INVOICE_DISCOUNT_EXCEEDS_GROSS", 409);
    const netAmount = money(gross.minus(discountDecimal));
    let rate = new Prisma.Decimal(0);
    if (item.taxCodeId) {
      const taxRate = await tx.enterpriseTaxRate.findFirst({
        where: {
          organizationId,
          taxCodeId: item.taxCodeId,
          status: "ACTIVE",
          effectiveFrom: { lte: documentDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: documentDate } }],
          taxCode: { isActive: true },
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (!taxRate) throw new EnterpriseAccountingError("SALES_INVOICE_TAX_RATE_INVALID", 409);
      rate = taxRate.rate;
    }
    const taxAmount = money(netAmount.times(rate));
    calculated.push({ ...item, quantityDecimal, unitPriceDecimal, discountDecimal, netAmount, taxAmount, totalAmount: money(netAmount.plus(taxAmount)) });
  }
  return calculated;
}

export async function createSalesInvoice(organizationId: string, actorUserId: string, input: SalesInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const customer = await tx.enterpriseBusinessParty.findFirst({
      where: { id: input.businessPartyId, organizationId, status: "ACTIVE", archivedAt: null, roles: { some: { roleCode: "CUSTOMER", status: "ACTIVE", archivedAt: null } } },
      select: { id: true },
    });
    if (!customer) throw new EnterpriseAccountingError("CUSTOMER_PARTY_INVALID", 409);
    if (input.salesOrderId) {
      const order = await tx.enterpriseSalesOrder.findFirst({ where: { id: input.salesOrderId, organizationId, businessPartyId: input.businessPartyId, status: { in: ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED"] } } });
      if (!order) throw new EnterpriseAccountingError("SALES_ORDER_NOT_INVOICEABLE", 409);
      const duplicate = await tx.enterpriseSalesInvoice.findFirst({ where: { organizationId, salesOrderId: input.salesOrderId, status: { notIn: ["CANCELLED", "VOIDED"] } } });
      if (duplicate) throw new EnterpriseAccountingError("SALES_ORDER_ALREADY_INVOICED", 409, { invoiceId: duplicate.id });
    }
    const calculated = await calculateItems(tx, organizationId, input.invoiceDate, input.items);
    const subtotal = money(sumDecimals(calculated.map((item) => item.quantityDecimal.times(item.unitPriceDecimal))));
    const discountTotal = money(sumDecimals(calculated.map((item) => item.discountDecimal)));
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
            catalogItemId: item.catalogItemId || null,
            description: item.description,
            quantity: item.quantityDecimal,
            unitPrice: item.unitPriceDecimal,
            discountAmount: item.discountDecimal,
            netAmount: item.netAmount,
            taxCodeId: item.taxCodeId || null,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
            revenueAccountId: item.revenueAccountId || null,
            projectId: item.projectId || input.projectId || null,
          })),
        },
      },
      include: { items: true },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "SALES_INVOICE_CREATED", summary: `Customer invoice ${invoice.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { total: grandTotal.toFixed(), currency: invoice.currencyCode } });
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
    const initial = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!initial) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
    if (["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(initial.status)) return initial;
    if (initial.status !== "APPROVED" || initial.revision !== input.revision) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_APPROVED", 409);
    const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "SALES_INVOICE_POSTED", sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: initial.id });
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: invoiceId, organizationId } });
      if (!invoice) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_FOUND", 404);
      const receivable = await tx.enterpriseReceivable.upsert({
        where: { salesInvoiceId: invoice.id },
        update: {},
        create: { organizationId, salesInvoiceId: invoice.id, businessPartyId: invoice.businessPartyId, currencyCode: invoice.currencyCode, originalAmount: invoice.grandTotal, outstandingAmount: invoice.grandTotal, status: "OPEN", dueDate: invoice.dueDate },
      });
      const updated = await tx.enterpriseSalesInvoice.update({ where: { id: invoice.id }, data: { status: "ISSUED", issuedAt: invoice.issuedAt || new Date(), postedAt: invoice.postedAt || new Date(), revision: { increment: 1 } } });
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "SALES_INVOICE_ISSUED", summary: `Customer invoice ${invoice.number} issued`, actorUserId, fromStatus: invoice.status, toStatus: "ISSUED", metadataJson: { receivableId: receivable.id, journalEntryId: posting.entry.id } });
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
    }[input.action as Exclude<typeof input.action, "ISSUE">];
    if (!transition?.from.includes(invoice.status)) throw new EnterpriseAccountingError("SALES_INVOICE_TRANSITION_INVALID", 409);
    if (input.action === "APPROVE") assertIndependentActor({ actorUserId, relatedUserIds: [invoice.createdByUserId], errorCode: "SALES_INVOICE_SELF_APPROVAL_FORBIDDEN" });
    if (input.action === "VOID") {
      const allocated = await tx.enterprisePaymentAllocation.count({ where: { organizationId, receivable: { salesInvoiceId: invoice.id }, status: "CONFIRMED" } });
      if (allocated > 0) throw new EnterpriseAccountingError("PAID_INVOICE_CANNOT_BE_VOIDED", 409);
    }
    const updated = await tx.enterpriseSalesInvoice.update({ where: { id: invoice.id }, data: { status: transition.to, approvedAt: input.action === "APPROVE" ? new Date() : invoice.approvedAt, approvedByUserId: input.action === "APPROVE" ? actorUserId : invoice.approvedByUserId, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: `SALES_INVOICE_${input.action}`, summary: `Customer invoice ${invoice.number}: ${input.action}`, actorUserId, fromStatus: invoice.status, toStatus: transition.to, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSalesCreditNote(organizationId: string, actorUserId: string, input: CreditNoteInput) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.enterpriseSalesInvoice.findFirst({ where: { id: input.invoiceId, organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } }, include: { receivable: true } });
    if (!invoice?.receivable) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    const calculated = await calculateItems(tx, organizationId, input.creditDate, input.items);
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
        creditDate: input.creditDate,
        currencyCode: invoice.currencyCode,
        subtotal,
        taxTotal,
        grandTotal,
        createdByUserId: actorUserId,
        items: { create: calculated.map((item) => ({ description: item.description, quantity: item.quantityDecimal, unitPrice: item.unitPriceDecimal, netAmount: item.netAmount, taxAmount: item.taxAmount, totalAmount: item.totalAmount })) },
      },
      include: { items: true },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id, eventType: "SALES_CREDIT_NOTE_CREATED", summary: `Credit note ${credit.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { total: credit.grandTotal.toFixed(), currency: credit.currencyCode } });
    return credit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndPostSalesCreditNote(organizationId: string, creditNoteId: string, actorUserId: string, revision: number) {
  const approved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status === "POSTED") return credit;
    if (credit.status !== "DRAFT" || credit.revision !== revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [credit.createdByUserId], errorCode: "SALES_CREDIT_NOTE_SELF_APPROVAL_FORBIDDEN" });
    return tx.enterpriseSalesCreditNote.update({ where: { id: credit.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: actorUserId, revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (approved.status === "POSTED") return approved;
  const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "SALES_CREDIT_NOTE_POSTED", sourceEntityType: "EnterpriseSalesCreditNote", sourceEntityId: approved.id });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${approved.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({ where: { id: approved.id, organizationId }, include: { salesInvoice: { include: { receivable: true } } } });
    if (!credit?.salesInvoice.receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 409);
    if (credit.status === "POSTED") return credit;
    const receivable = credit.salesInvoice.receivable;
    const outstanding = money(receivable.outstandingAmount.minus(credit.grandTotal));
    await tx.enterpriseReceivableAllocation.create({ data: { organizationId, receivableId: receivable.id, sourceType: "SALES_CREDIT_NOTE", sourceId: credit.id, amount: credit.grandTotal, allocationDate: credit.creditDate, createdByUserId: actorUserId } });
    await tx.enterpriseReceivable.update({ where: { id: receivable.id }, data: { creditedAmount: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSalesInvoice.update({ where: { id: credit.salesInvoiceId }, data: { amountCredited: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CREDIT_NOTE" : credit.salesInvoice.status, revision: { increment: 1 } } });
    const posted = await tx.enterpriseSalesCreditNote.update({ where: { id: credit.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesCreditNote", entityId: credit.id, eventType: "SALES_CREDIT_NOTE_POSTED", summary: `Credit note ${credit.number} posted`, actorUserId, fromStatus: credit.status, toStatus: "POSTED", metadataJson: { receivableId: receivable.id, journalEntryId: posting.entry.id } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listReceivables(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: string }) {
  const where: Prisma.EnterpriseReceivableWhereInput = { organizationId, ...(input.status ? { status: input.status } : {}), ...(input.search ? { salesInvoice: { OR: [{ number: { contains: input.search, mode: "insensitive" } }, { notes: { contains: input.search, mode: "insensitive" } }] } } : {}) };
  const [items, total, openAmount, overdueAmount] = await Promise.all([
    prisma.enterpriseReceivable.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { salesInvoice: true, _count: { select: { paymentAllocations: true, allocations: true } } } }),
    prisma.enterpriseReceivable.count({ where }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { outstandingAmount: true } }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN", dueDate: { lt: new Date() } }, _sum: { outstandingAmount: true } }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) }, metrics: { openAmount: openAmount._sum.outstandingAmount || new Prisma.Decimal(0), overdueAmount: overdueAmount._sum.outstandingAmount || new Prisma.Decimal(0) } };
}
