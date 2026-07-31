import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { assertActiveClientOrganization, financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEvent } from "@/lib/enterprise/accounting/posting-service";
import type { supplierInvoiceCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type SupplierInvoiceInput = z.infer<typeof supplierInvoiceCreateSchema>;

async function calculateSupplierItems(tx: Prisma.TransactionClient, organizationId: string, invoiceDate: Date, items: SupplierInvoiceInput["items"]) {
  const calculated = [];
  for (const item of items) {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    if (!quantity.isPositive() || unitPrice.isNegative()) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_LINE_INVALID", 400);
    if (item.catalogItemId) {
      const catalog = await tx.enterpriseCatalogItem.findFirst({ where: { id: item.catalogItemId, organizationId, status: "ACTIVE", archivedAt: null } });
      if (!catalog) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_CATALOG_ITEM_INVALID", 409);
    }
    const netAmount = money(quantity.times(unitPrice));
    let taxRate = new Prisma.Decimal(0);
    if (item.taxCodeId) {
      const rate = await tx.enterpriseTaxRate.findFirst({ where: { organizationId, taxCodeId: item.taxCodeId, status: "ACTIVE", effectiveFrom: { lte: invoiceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: invoiceDate } }] }, orderBy: { effectiveFrom: "desc" } });
      if (!rate) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TAX_RATE_INVALID", 409);
      taxRate = rate.rate;
    }
    const taxAmount = money(netAmount.times(taxRate));
    calculated.push({ ...item, quantity, unitPrice, netAmount, taxAmount, totalAmount: money(netAmount.plus(taxAmount)) });
  }
  return calculated;
}

async function calculateThreeWayMatch(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: SupplierInvoiceInput,
  subtotal: Prisma.Decimal,
  taxTotal: Prisma.Decimal,
) {
  if (!input.purchaseId) return null;
  const purchase = await tx.enterprisePurchase.findFirst({
    where: { id: input.purchaseId, organizationId, supplierId: input.supplierId },
    include: { items: true, receipts: { include: { items: true } } },
  });
  if (!purchase) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_PURCHASE_INVALID", 409);
  if (purchase.currency !== input.currencyCode) throw new EnterpriseAccountingError("THREE_WAY_MATCH_CURRENCY_MISMATCH", 409);
  if (input.purchaseReceiptId && !purchase.receipts.some((receipt) => receipt.id === input.purchaseReceiptId)) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_RECEIPT_INVALID", 409);
  const orderedQuantity = sumDecimals(purchase.items.map((item) => item.quantity));
  const receivedQuantity = sumDecimals(purchase.receipts.flatMap((receipt) => receipt.items.map((item) => item.quantityReceived)));
  const invoicedQuantity = sumDecimals(input.items.map((item) => new Prisma.Decimal(item.quantity)));
  const quantityVariance = money(invoicedQuantity.minus(receivedQuantity));
  const priceVariance = money(subtotal.minus(purchase.subtotalAmount));
  const taxVariance = money(taxTotal.minus(purchase.taxAmount));
  const tolerance = new Prisma.Decimal("0.01");
  const withinTolerance = quantityVariance.abs().lte(tolerance) && priceVariance.abs().lte(tolerance) && taxVariance.abs().lte(tolerance) && invoicedQuantity.lte(orderedQuantity);
  return { purchase, quantityVariance, priceVariance, taxVariance, withinTolerance };
}

export async function createSupplierInvoice(organizationId: string, actorUserId: string, input: SupplierInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    await assertActiveClientOrganization(tx, organizationId);
    const supplier = await tx.enterpriseSupplier.findFirst({ where: { id: input.supplierId, organizationId, status: { in: ["ACTIVE", "APPROVED"] }, archivedAt: null } });
    if (!supplier) throw new EnterpriseAccountingError("SUPPLIER_INVALID", 409);
    if (input.expenseId) {
      const expense = await tx.enterpriseExpense.findFirst({ where: { id: input.expenseId, organizationId, status: "APPROVED", accountedAt: null, supplierInvoiceId: null } });
      if (!expense) throw new EnterpriseAccountingError("EXPENSE_ALREADY_ACCOUNTED_OR_INVALID", 409);
      if (expense.currency !== input.currencyCode) throw new EnterpriseAccountingError("EXPENSE_INVOICE_CURRENCY_MISMATCH", 409);
    }
    const calculated = await calculateSupplierItems(tx, organizationId, input.invoiceDate, input.items);
    const subtotal = money(sumDecimals(calculated.map((item) => item.netAmount)));
    const taxTotal = money(sumDecimals(calculated.map((item) => item.taxAmount)));
    const grandTotal = money(sumDecimals(calculated.map((item) => item.totalAmount)));
    if (!grandTotal.isPositive()) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TOTAL_INVALID", 400);
    const match = await calculateThreeWayMatch(tx, organizationId, input, subtotal, taxTotal);
    const invoice = await tx.enterpriseSupplierInvoice.create({
      data: {
        organizationId,
        number: financeReference("BILL"),
        supplierId: input.supplierId,
        businessPartyId: input.businessPartyId || null,
        purchaseId: input.purchaseId || null,
        purchaseReceiptId: input.purchaseReceiptId || null,
        expenseId: input.expenseId || null,
        projectId: input.projectId || null,
        assetId: input.assetId || null,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate || null,
        currencyCode: input.currencyCode,
        subtotal,
        taxTotal,
        grandTotal,
        outstandingAmount: grandTotal,
        createdByUserId: actorUserId,
        items: { create: calculated.map((item) => ({
          organizationId,
          catalogItemId: item.catalogItemId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          netAmount: item.netAmount,
          taxCodeId: item.taxCodeId || null,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
          expenseAccountId: item.expenseAccountId || null,
          inventoryAccountId: item.inventoryAccountId || null,
          assetAccountId: item.assetAccountId || null,
          clearingAccountId: item.clearingAccountId || null,
          projectId: item.projectId || input.projectId || null,
        })) },
        ...(match ? { threeWayMatch: { create: {
          organizationId,
          purchaseId: input.purchaseId || null,
          purchaseReceiptId: input.purchaseReceiptId || null,
          quantityVariance: match.quantityVariance,
          priceVariance: match.priceVariance,
          taxVariance: match.taxVariance,
          currencyMatches: true,
          supplierMatches: true,
          withinTolerance: match.withinTolerance,
          status: match.withinTolerance ? "MATCHED" : "VARIANCE",
          checkedAt: new Date(),
        } } } : {}),
      },
      include: { items: true, threeWayMatch: true },
    });
    if (input.expenseId) {
      await tx.enterpriseExpense.update({ where: { id: input.expenseId }, data: { accountingTreatment: "SUPPLIER_INVOICE_PROJECTION", supplierInvoiceId: invoice.id, updatedByUserId: actorUserId, revision: { increment: 1 } } });
    }
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierInvoice", entityId: invoice.id, eventType: "SUPPLIER_INVOICE_CREATED", summary: `Supplier invoice ${invoice.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { total: grandTotal.toFixed(), currency: input.currencyCode, matchStatus: invoice.threeWayMatch?.status || null } });
    return invoice;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionSupplierInvoice(
  organizationId: string,
  invoiceId: string,
  actorUserId: string,
  input: { action: "SUBMIT" | "REVIEW" | "APPROVE" | "POST" | "REJECT" | "CANCEL"; reason?: string; revision: number },
) {
  if (input.action === "POST") {
    const invoice = await prisma.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { threeWayMatch: true } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (["POSTED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) return invoice;
    if (invoice.status !== "APPROVED" || invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_APPROVED", 409);
    if (invoice.threeWayMatch?.status === "VARIANCE" && !invoice.threeWayMatch.overrideReason) throw new EnterpriseAccountingError("THREE_WAY_MATCH_VARIANCE_UNRESOLVED", 409);
    const posting = await postBusinessEvent(organizationId, actorUserId, { postingEvent: "SUPPLIER_INVOICE_POSTED", sourceEntityType: "EnterpriseSupplierInvoice", sourceEntityId: invoice.id });
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoice.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
      const current = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoice.id, organizationId } });
      if (!current) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
      const payable = await tx.enterprisePayable.upsert({
        where: { supplierInvoiceId: current.id },
        update: {},
        create: { organizationId, supplierInvoiceId: current.id, supplierId: current.supplierId, businessPartyId: current.businessPartyId, currencyCode: current.currencyCode, originalAmount: current.grandTotal, outstandingAmount: current.grandTotal, status: "OPEN", dueDate: current.dueDate },
      });
      const updated = await tx.enterpriseSupplierInvoice.update({ where: { id: current.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
      if (current.expenseId) await tx.enterpriseExpense.update({ where: { id: current.expenseId }, data: { accountedAt: new Date(), journalEntryId: posting.entry.id, updatedByUserId: actorUserId, revision: { increment: 1 } } });
      if (current.purchaseId) {
        const commitment = await tx.enterpriseBudgetCommitment.findFirst({ where: { organizationId, sourceEntityType: "EnterprisePurchase", sourceEntityId: current.purchaseId, status: "ACTIVE" } });
        if (commitment) {
          const realized = Prisma.Decimal.min(commitment.committedAmount.minus(commitment.realizedAmount), current.grandTotal);
          await tx.enterpriseBudgetCommitment.update({ where: { id: commitment.id }, data: { realizedAmount: { increment: realized }, status: commitment.realizedAmount.plus(realized).gte(commitment.committedAmount) ? "REALIZED" : commitment.status } });
        }
      }
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierInvoice", entityId: current.id, eventType: "SUPPLIER_INVOICE_POSTED", summary: `Supplier invoice ${current.number} posted`, actorUserId, fromStatus: current.status, toStatus: "POSTED", metadataJson: { payableId: payable.id, journalEntryId: posting.entry.id } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { threeWayMatch: true } });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.revision !== input.revision) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_REVISION_CONFLICT", 409, { currentRevision: invoice.revision });
    const transition = {
      SUBMIT: { from: ["DRAFT"], to: "PENDING_REVIEW" },
      REVIEW: { from: ["PENDING_REVIEW"], to: "PENDING_APPROVAL" },
      APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED" },
      REJECT: { from: ["PENDING_APPROVAL", "PENDING_REVIEW"], to: "REJECTED" },
      CANCEL: { from: ["DRAFT", "PENDING_REVIEW"], to: "CANCELLED" },
      POST: { from: [], to: "POSTED" },
    }[input.action];
    if (!transition.from.includes(invoice.status)) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_TRANSITION_INVALID", 409);
    if (input.action === "REVIEW") assertIndependentActor({ actorUserId, relatedUserIds: [invoice.createdByUserId], errorCode: "SUPPLIER_INVOICE_SELF_REVIEW_FORBIDDEN" });
    if (input.action === "APPROVE") {
      assertIndependentActor({ actorUserId, relatedUserIds: [invoice.createdByUserId, invoice.reviewedByUserId], errorCode: "SUPPLIER_INVOICE_SELF_APPROVAL_FORBIDDEN" });
      if (invoice.threeWayMatch?.status === "VARIANCE" && !invoice.threeWayMatch.overrideReason) throw new EnterpriseAccountingError("THREE_WAY_MATCH_VARIANCE_UNRESOLVED", 409);
    }
    const updated = await tx.enterpriseSupplierInvoice.update({
      where: { id: invoice.id },
      data: {
        status: transition.to,
        reviewedByUserId: input.action === "REVIEW" ? actorUserId : invoice.reviewedByUserId,
        approvedByUserId: input.action === "APPROVE" ? actorUserId : invoice.approvedByUserId,
        approvedAt: input.action === "APPROVE" ? new Date() : invoice.approvedAt,
        revision: { increment: 1 },
      },
    });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierInvoice", entityId: invoice.id, eventType: `SUPPLIER_INVOICE_${input.action}`, summary: `Supplier invoice ${invoice.number}: ${input.action}`, actorUserId, fromStatus: invoice.status, toStatus: transition.to, metadataJson: input.reason ? { reason: input.reason.slice(0, 500) } : undefined });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function overrideThreeWayMatch(organizationId: string, invoiceId: string, actorUserId: string, input: { reason: string; revision: number }) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.enterpriseThreeWayMatch.findFirst({ where: { organizationId, supplierInvoiceId: invoiceId } });
    if (!match) throw new EnterpriseAccountingError("THREE_WAY_MATCH_NOT_FOUND", 404);
    if (match.revision !== input.revision || match.status !== "VARIANCE") throw new EnterpriseAccountingError("THREE_WAY_MATCH_CONFLICT", 409);
    const updated = await tx.enterpriseThreeWayMatch.update({ where: { id: match.id }, data: { status: "OVERRIDDEN", overrideReason: input.reason, overriddenByUserId: actorUserId, revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseThreeWayMatch", entityId: match.id, eventType: "THREE_WAY_MATCH_OVERRIDDEN", summary: "Three-way match variance overridden", actorUserId, fromStatus: match.status, toStatus: "OVERRIDDEN", metadataJson: { reason: input.reason.slice(0, 500) } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listPayables(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: string }) {
  const where: Prisma.EnterprisePayableWhereInput = { organizationId, ...(input.status ? { status: input.status } : {}), ...(input.search ? { supplierInvoice: { number: { contains: input.search, mode: "insensitive" } } } : {}) };
  const [items, total, openAmount, overdueAmount] = await Promise.all([
    prisma.enterprisePayable.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { supplierInvoice: { include: { threeWayMatch: true } }, _count: { select: { paymentAllocations: true, allocations: true } } } }),
    prisma.enterprisePayable.count({ where }),
    prisma.enterprisePayable.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { outstandingAmount: true } }),
    prisma.enterprisePayable.aggregate({ where: { organizationId, status: "OPEN", dueDate: { lt: new Date() } }, _sum: { outstandingAmount: true } }),
  ]);
  return { items, pagination: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.max(1, Math.ceil(total / input.pageSize)) }, metrics: { openAmount: openAmount._sum.outstandingAmount || new Prisma.Decimal(0), overdueAmount: overdueAmount._sum.outstandingAmount || new Prisma.Decimal(0) } };
}
