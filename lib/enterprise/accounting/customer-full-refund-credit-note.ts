import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";
import { prisma } from "@/lib/prisma";

/**
 * Creates a canonical full customer credit note by copying the issued invoice's
 * already-resolved monetary lines. This is intentionally distinct from a new
 * commercial price/tax calculation: a refund must inverse the historical sale
 * exactly, including the tax snapshot carried by the invoice.
 */
export async function createExactFullSalesCreditNoteForRefund(
  organizationId: string,
  salesInvoiceId: string,
  actorUserId: string,
  input: { reason: string; creditDate: Date },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesInvoice" WHERE id = ${salesInvoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSalesInvoice.findFirst({
      where: { id: salesInvoiceId, organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
      include: { items: true, receivable: true },
    });
    if (!invoice?.receivable) throw new EnterpriseAccountingError("SALES_INVOICE_NOT_CREDITABLE", 409);
    if (!invoice.grandTotal.equals(invoice.receivable.outstandingAmount)) {
      throw new EnterpriseAccountingError("FULL_REFUND_RECEIVABLE_NOT_REOPENED", 409, {
        invoiceTotal: invoice.grandTotal.toFixed(),
        outstandingAmount: invoice.receivable.outstandingAmount.toFixed(),
      });
    }

    const existing = await tx.enterpriseSalesCreditNote.findFirst({
      where: { organizationId, salesInvoiceId: invoice.id, reason: input.reason },
      include: { items: true },
    });
    if (existing) return { creditNote: existing, idempotent: true };

    const creditNote = await tx.enterpriseSalesCreditNote.create({
      data: {
        organizationId,
        number: financeReference("CN"),
        salesInvoiceId: invoice.id,
        reason: input.reason,
        creditDate: input.creditDate,
        currencyCode: invoice.currencyCode,
        subtotal: invoice.subtotal.minus(invoice.discountTotal),
        taxTotal: invoice.taxTotal,
        grandTotal: invoice.grandTotal,
        createdByUserId: actorUserId,
        items: {
          create: invoice.items.map((item) => ({
            organizationId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            netAmount: item.netAmount.minus(item.discountAmount),
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: { items: true },
    });
    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseSalesCreditNote",
      entityId: creditNote.id,
      eventType: "SALES_CREDIT_NOTE_CREATED",
      summary: `Credit note ${creditNote.number} created for exact customer refund`,
      actorUserId,
      toStatus: "DRAFT",
      metadataJson: { salesInvoiceId: invoice.id, total: creditNote.grandTotal.toFixed(), currency: creditNote.currencyCode, exactHistoricalInverse: true },
    });
    return { creditNote, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
