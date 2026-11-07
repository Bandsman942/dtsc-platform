import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export async function assertSalesCreditNoteStillPostable(
  organizationId: string,
  creditNoteId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSalesCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSalesCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: { salesInvoice: { include: { receivable: true } } },
    });
    if (!credit) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status === "POSTED") return;
    // A previously drafted credit note must also be stopped if the invoice
    // has since been linked to Retail. Never post finance-only corrections
    // while a Retail stock promise or posted stock exit is unreconciled.
    const retailCheckout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
      where: { organizationId, salesInvoiceId: credit.salesInvoiceId },
      select: { id: true },
    });
    if (retailCheckout) throw new EnterpriseAccountingError("RETAIL_INVOICE_RETURN_WORKFLOW_REQUIRED", 409);
    if (credit.status !== "APPROVED" || credit.revision !== revision) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_NOT_APPROVED", 409);
    const receivable = credit.salesInvoice.receivable;
    if (!receivable) throw new EnterpriseAccountingError("RECEIVABLE_NOT_FOUND", 409);
    if (receivable.currencyCode !== credit.currencyCode) throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_CURRENCY_MISMATCH", 409);
    if (credit.grandTotal.gt(receivable.outstandingAmount)) {
      throw new EnterpriseAccountingError("SALES_CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE", 409, {
        outstandingAmount: receivable.outstandingAmount.toFixed(),
        creditAmount: credit.grandTotal.toFixed(),
        currencyCode: credit.currencyCode,
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assertSupplierCreditNoteStillPostable(
  organizationId: string,
  creditNoteId: string,
  revision: number,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: { supplierInvoice: { include: { payable: true } } },
    });
    if (!credit) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status === "POSTED") return;
    if (credit.status !== "APPROVED" || credit.revision !== revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_APPROVED", 409);
    const payable = credit.supplierInvoice.payable;
    if (!payable) throw new EnterpriseAccountingError("PAYABLE_NOT_FOUND", 409);
    if (payable.currencyCode !== credit.currencyCode) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_CURRENCY_MISMATCH", 409);
    if (credit.grandTotal.gt(payable.outstandingAmount)) {
      throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_EXCEEDS_OPEN_PAYABLE", 409, {
        outstandingAmount: payable.outstandingAmount.toFixed(),
        creditAmount: credit.grandTotal.toFixed(),
        currencyCode: credit.currencyCode,
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
