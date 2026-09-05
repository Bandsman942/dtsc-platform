import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

async function resolveSupplierParty(
  tx: Prisma.TransactionClient,
  organizationId: string,
  supplierId: string,
) {
  const link = await tx.enterpriseSupplierPartyLink.findFirst({
    where: { organizationId, supplierId, archivedAt: null },
    select: { businessPartyId: true },
  });
  if (!link) throw new EnterpriseAccountingError("SUPPLIER_PARTY_INVALID", 409);

  const party = await tx.enterpriseBusinessParty.findFirst({
    where: {
      id: link.businessPartyId,
      organizationId,
      status: "ACTIVE",
      archivedAt: null,
      roles: { some: { roleCode: "SUPPLIER", status: "ACTIVE", archivedAt: null } },
    },
    select: { id: true },
  });
  if (!party) throw new EnterpriseAccountingError("SUPPLIER_PARTY_INVALID", 409);
  return party.id;
}

export async function ensureSupplierInvoicePartyBeforePosting(
  organizationId: string,
  invoiceId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseSupplierInvoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const invoice = await tx.enterpriseSupplierInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { id: true, supplierId: true, businessPartyId: true },
    });
    if (!invoice) throw new EnterpriseAccountingError("SUPPLIER_INVOICE_NOT_FOUND", 404);
    if (invoice.businessPartyId) return invoice.businessPartyId;

    const businessPartyId = await resolveSupplierParty(tx, organizationId, invoice.supplierId);
    await tx.enterpriseSupplierInvoice.updateMany({
      where: { id: invoice.id, organizationId, businessPartyId: null },
      data: { businessPartyId },
    });
    return businessPartyId;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function ensurePayablePartyBeforeAllocation(
  organizationId: string,
  paymentId: string,
  payableId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayment" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterprisePayable" WHERE id = ${payableId} AND "organizationId" = ${organizationId} FOR UPDATE`);

    const [payment, payable] = await Promise.all([
      tx.enterprisePayment.findFirst({
        where: { id: paymentId, organizationId },
        select: { businessPartyId: true, paymentType: true, direction: true },
      }),
      tx.enterprisePayable.findFirst({
        where: { id: payableId, organizationId },
        select: { id: true, supplierId: true, supplierInvoiceId: true, businessPartyId: true },
      }),
    ]);
    if (!payment) throw new EnterpriseAccountingError("PAYMENT_NOT_FOUND", 404);
    if (!payable) throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_INVALID", 409);
    if (payment.paymentType !== "SUPPLIER_PAYMENT" || payment.direction !== "OUTBOUND") return;
    if (!payment.businessPartyId) throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);

    const canonicalPartyId = payable.businessPartyId || await resolveSupplierParty(tx, organizationId, payable.supplierId);
    if (canonicalPartyId !== payment.businessPartyId) throw new EnterpriseAccountingError("PAYABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID", 409);
    if (payable.businessPartyId) return;

    await tx.enterprisePayable.updateMany({
      where: { id: payable.id, organizationId, businessPartyId: null },
      data: { businessPartyId: canonicalPartyId },
    });
    await tx.enterpriseSupplierInvoice.updateMany({
      where: { id: payable.supplierInvoiceId, organizationId, businessPartyId: null },
      data: { businessPartyId: canonicalPartyId },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
