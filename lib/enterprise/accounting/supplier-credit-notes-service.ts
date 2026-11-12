import { Prisma } from "@prisma/client";
import { allocateHistoricalCreditLines } from "@/lib/enterprise/accounting/historical-credit-tax";
import { recordPostedTaxApplicationsTx } from "@/lib/enterprise/accounting/tax-engine";
import { prisma } from "@/lib/prisma";
import { assertIndependentActor } from "@/lib/enterprise/accounting/access";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { postBusinessEventTx } from "@/lib/enterprise/accounting/posting-service";
import type { creditNoteCreateSchema } from "@/lib/enterprise/accounting/schemas";
import type { z } from "zod";

type CreditInput = z.infer<typeof creditNoteCreateSchema>;

export async function createSupplierCreditNote(organizationId: string, actorUserId: string, input: CreditInput) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({ where: { id: input.invoiceId, organizationId, status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] } }, include: { payable: true } });
    if (!invoice?.payable) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_CREDITABLE", 409);
    const [originalLines, olderNotes] = await Promise.all([
      tx.enterpriseSupplierInvoiceItem.findMany({ where: { organizationId, supplierInvoiceId: invoice.id } }),
      tx.enterpriseSupplierCreditNote.findMany({ where: { organizationId, supplierInvoiceId: invoice.id, status: { notIn: ["REJECTED", "CANCELLED"] } }, select: { id: true } }),
    ]);
    const olderItems = olderNotes.length ? await tx.enterpriseSupplierCreditNoteItem.findMany({ where: { organizationId, supplierCreditNoteId: { in: olderNotes.map((note) => note.id) } } }) : [];
    const calculated = allocateHistoricalCreditLines(originalLines, olderItems, input.items, input.creditDate);
    const subtotal = money(sumDecimals(calculated.map((row) => row.netAmount)));
    const taxTotal = money(sumDecimals(calculated.map((row) => row.taxAmount)));
    const grandTotal = money(subtotal.plus(taxTotal));
    if (!grandTotal.greaterThan(0) || grandTotal.greaterThan(invoice.payable.outstandingAmount)) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_EXCEEDS_OPEN_PAYABLE", 409);
    const credit = await tx.enterpriseSupplierCreditNote.create({ data: { organizationId, number: financeReference("SCN"), supplierInvoiceId: invoice.id, reason: input.reason, creditDate: input.creditDate, currencyCode: invoice.currencyCode, subtotal, taxTotal, grandTotal, createdByUserId: actorUserId } });
    await tx.enterpriseSupplierCreditNoteItem.createMany({ data: calculated.map((row) => ({ organizationId, supplierCreditNoteId: credit.id,
      sourceInvoiceItemId: row.sourceInvoiceItemId, taxRecoveryRequested: row.taxRecoveryRequested,
      catalogItemId: row.catalogItemId || null, description: row.description,
      quantity: row.quantity, unitPrice: row.unitPrice, netAmount: row.netAmount,
      taxAmount: row.taxAmount, totalAmount: row.totalAmount,
      taxBreakdownJson: row.taxBreakdown.length ? row.taxBreakdown : Prisma.JsonNull })) });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierCreditNote", entityId: credit.id, eventType: "SUPPLIER_CREDIT_NOTE_CREATED", summary: `Supplier credit note ${credit.number} created`, actorUserId, toStatus: "DRAFT", metadataJson: { total: credit.grandTotal.toFixed(), currency: credit.currencyCode } });
    return credit;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndPostSupplierCreditNote(organizationId: string, creditNoteId: string, actorUserId: string, revision: number) {
  const approved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${creditNoteId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
    if (!credit) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_NOT_FOUND", 404);
    if (credit.status === "POSTED") return credit;
    if (credit.status !== "DRAFT" || credit.revision !== revision) throw new EnterpriseAccountingError("SUPPLIER_CREDIT_NOTE_CONFLICT", 409);
    assertIndependentActor({ actorUserId, relatedUserIds: [credit.createdByUserId], errorCode: "SUPPLIER_CREDIT_NOTE_SELF_APPROVAL_FORBIDDEN" });
    return tx.enterpriseSupplierCreditNote.update({ where: { id: credit.id }, data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date(), revision: { increment: 1 } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (approved.status === "POSTED") return approved;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierCreditNote" WHERE id = ${approved.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const credit = await tx.enterpriseSupplierCreditNote.findFirst({ where: { id: approved.id, organizationId }, include: { supplierInvoice: { include: { payable: true } } } });
    if (!credit?.supplierInvoice.payable) throw new EnterpriseAccountingError("PAYABLE_NOT_FOUND", 409);
    if (credit.status === "POSTED") return credit;
    const posting = await postBusinessEventTx(tx, organizationId, actorUserId, { postingEvent: "SUPPLIER_CREDIT_NOTE_POSTED", sourceEntityType: "EnterpriseSupplierCreditNote", sourceEntityId: credit.id });
    const creditItems = await tx.enterpriseSupplierCreditNoteItem.findMany({ where: { organizationId, supplierCreditNoteId: credit.id }, select: { id: true, taxBreakdownJson: true, taxRecoveryRequested: true } });
    await recordPostedTaxApplicationsTx(tx, { organizationId, sourceEntityType: "EnterpriseSupplierCreditNoteItem", currencyCode: credit.currencyCode, items: creditItems });
    const payable = credit.supplierInvoice.payable;
    const outstanding = money(payable.outstandingAmount.minus(credit.grandTotal));
    await tx.enterprisePayableAllocation.create({ data: { organizationId, payableId: payable.id, sourceType: "SUPPLIER_CREDIT_NOTE", sourceId: credit.id, amount: credit.grandTotal, allocationDate: credit.creditDate, createdByUserId: actorUserId } });
    await tx.enterprisePayable.update({ where: { id: payable.id }, data: { creditedAmount: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "CLOSED" : "OPEN" } });
    await tx.enterpriseSupplierInvoice.update({ where: { id: credit.supplierInvoiceId }, data: { amountCredited: { increment: credit.grandTotal }, outstandingAmount: outstanding, status: outstanding.isZero() ? "PAID" : credit.supplierInvoice.status, revision: { increment: 1 } } });
    const posted = await tx.enterpriseSupplierCreditNote.update({ where: { id: credit.id }, data: { status: "POSTED", postedAt: new Date(), revision: { increment: 1 } } });
    await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSupplierCreditNote", entityId: credit.id, eventType: "SUPPLIER_CREDIT_NOTE_POSTED", summary: `Supplier credit note ${credit.number} posted`, actorUserId, fromStatus: credit.status, toStatus: "POSTED", metadataJson: { payableId: payable.id, journalEntryId: posting.entry.id } });
    return posted;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
