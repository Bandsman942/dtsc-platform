import { Prisma } from "@prisma/client";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { createEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import { prisma } from "@/lib/prisma";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync, sectorIdempotencyKey } from "@/lib/enterprise/sector-convergence/sync-service";

async function requirePharmacyFinanceFlag(organizationId: string) {
  const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "PHARMACY", domainCode: "FINANCE", flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_FINANCE });
  if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_FINANCE_CONVERGENCE_DISABLED", 409);
}

function paymentMethod(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (["CASH", "CARD", "CHEQUE", "BANK_TRANSFER", "MOBILE_MONEY"].includes(normalized)) return normalized as "CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "MOBILE_MONEY";
  if (["TRANSFER", "BANK", "VIREMENT"].includes(normalized)) return "BANK_TRANSFER" as const;
  if (["MOBILE", "MOBILEMONEY", "M_PESA", "AIRTEL_MONEY", "ORANGE_MONEY"].includes(normalized)) return "MOBILE_MONEY" as const;
  return "OTHER" as const;
}

async function ensurePharmacyCustomerParty(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sale: { id: string; saleNumber: string; customerName: string | null; customerPhone: string | null },
  actorUserId: string,
) {
  // Pharmacy currently has no deterministic customer foreign key. A sale-specific
  // billing party avoids unsafe name/phone merging while preserving invoice scope.
  const migrationKey = `pharmacy-sale-customer:${sale.id}`;
  const existing = await tx.enterpriseBusinessParty.findFirst({ where: { organizationId, migrationKey, archivedAt: null } });
  if (existing) return existing;
  const displayName = sale.customerName?.trim() || `Client comptoir ${sale.saleNumber}`;
  return tx.enterpriseBusinessParty.create({
    data: {
      organizationId,
      partyType: sale.customerName ? "PERSON" : "ORGANIZATION",
      legalName: displayName,
      displayName,
      normalizedName: `pharmacy sale ${sale.id}`,
      code: financeReference("PHC"),
      migrationKey,
      primaryPhone: sale.customerPhone,
      status: "ACTIVE",
      createdByUserId: actorUserId,
      roles: { create: { organizationId, roleCode: "CUSTOMER", createdByUserId: actorUserId } },
      contacts: sale.customerPhone ? { create: { organizationId, contactType: "PHONE", label: "Paiement", value: sale.customerPhone, normalizedValue: sale.customerPhone.trim().toLowerCase(), isPrimary: true, createdByUserId: actorUserId } } : undefined,
    },
  });
}

export async function convergePharmacySaleInvoice(
  organizationId: string,
  pharmacySaleId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) await requirePharmacyFinanceFlag(organizationId);
  const existing = await prisma.pharmacySalesExtension.findFirst({ where: { organizationId, pharmacySaleId } });
  if (existing) return { extension: existing, idempotent: true };
  const sale = await prisma.pharmacySale.findFirst({
    where: { id: pharmacySaleId, organizationId },
    include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, generatedInvoice: true },
  });
  if (!sale) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_NOT_FOUND", 404);
  if (["DRAFT", "CANCELLED"].includes(sale.status)) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_NOT_INVOICEABLE", 409, { status: sale.status });
  if (sale.validationRequired && sale.pharmacistValidationStatus !== "APPROVED") throw new EnterpriseSectorConvergenceError("PHARMACIST_VALIDATION_REQUIRED", 409);
  if (!sale.lines.length || !sale.totalAmount.isPositive()) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_TOTAL_INVALID", 409);

  const productMappings = await prisma.pharmacyProductExtension.findMany({ where: { organizationId, pharmacyProductId: { in: sale.lines.map((line) => line.productId) } } });
  const catalogByProduct = new Map(productMappings.map((item) => [item.pharmacyProductId, item.catalogItemId]));
  const missing = sale.lines.filter((line) => !catalogByProduct.has(line.productId));
  if (missing.length) throw new EnterpriseSectorConvergenceError("PHARMACY_PRODUCT_MAPPING_REQUIRED", 409, { sourceLineIds: missing.map((line) => line.id) });

  const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacySale", sourceEntityId: sale.id, eventType: "PHARMACY_SALE_INVOICED" }, { saleNumber: sale.saleNumber }));
  try {
    const result = await prisma.$transaction(async (tx) => {
      const mapped = await tx.pharmacySalesExtension.findFirst({ where: { organizationId, pharmacySaleId: sale.id } });
      if (mapped) return { extension: mapped, invoice: await tx.enterpriseSalesInvoice.findUniqueOrThrow({ where: { id: mapped.salesInvoiceId } }) };
      const current = await tx.pharmacySale.findFirst({ where: { id: sale.id, organizationId }, include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, generatedInvoice: true } });
      if (!current) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_NOT_FOUND", 404);
      const party = await ensurePharmacyCustomerParty(tx, organizationId, current, actorUserId);
      const lineTotals = current.lines.map((line) => money(line.totalLine));
      const itemTotal = money(sumDecimals(lineTotals));
      const difference = money(current.totalAmount.minus(itemTotal));
      if (difference.abs().greaterThan(new Prisma.Decimal("0.01"))) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_LINE_TOTAL_MISMATCH", 409, { saleTotal: current.totalAmount.toFixed(), lineTotal: itemTotal.toFixed() });
      const discountTotal = current.globalDiscount && current.globalDiscount.isPositive() ? money(current.globalDiscount) : money(0);
      const taxTotal = money(current.taxAmount || 0);
      const subtotal = money(current.totalAmount.plus(discountTotal).minus(taxTotal));
      if (subtotal.isNegative()) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_SUBTOTAL_INVALID", 409);
      const invoice = await tx.enterpriseSalesInvoice.create({
        data: {
          organizationId,
          number: financeReference("INV-PH"),
          businessPartyId: party.id,
          status: "DRAFT",
          invoiceDate: current.saleDate,
          currencyCode: current.currency,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal: money(current.totalAmount),
          outstandingAmount: money(current.totalAmount),
          notes: `Pharmacy sale ${current.saleNumber}`,
          createdByUserId: actorUserId,
          items: {
            create: current.lines.map((line) => ({
              organizationId,
              catalogItemId: catalogByProduct.get(line.productId),
              description: `Pharmacy item ${line.productId}`,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: money(line.quantity.times(line.unitPrice).minus(line.totalLine).greaterThan(0) ? line.quantity.times(line.unitPrice).minus(line.totalLine) : 0),
              netAmount: money(line.totalLine),
              taxAmount: money(0),
              totalAmount: money(line.totalLine),
            })),
          },
        },
        include: { items: true },
      });
      const extension = await tx.pharmacySalesExtension.create({ data: { organizationId, pharmacySaleId: current.id, salesInvoiceId: invoice.id, businessPartyId: party.id, createdByUserId: actorUserId } });
      if (current.generatedInvoice) {
        await tx.pharmacyInvoiceExtension.create({ data: { organizationId, pharmacyInvoiceId: current.generatedInvoice.id, salesInvoiceId: invoice.id } });
      }
      const entityLink = await tx.enterpriseEntityLink.findFirst({ where: { organizationId, sourceModule: "PHARMACY_SALES", sourceEntityType: "PharmacySale", sourceEntityId: current.id, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "SECTOR_CONVERGENCE" } });
      if (!entityLink) {
        await tx.enterpriseEntityLink.create({ data: { organizationId, sourceModule: "PHARMACY_SALES", sourceEntityType: "PharmacySale", sourceEntityId: current.id, targetModule: "FINANCE_RECEIVABLES", targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id, linkType: "SECTOR_CONVERGENCE", createdById: actorUserId } });
      }
      await publishFinanceEvent(tx, { organizationId, entityType: "EnterpriseSalesInvoice", entityId: invoice.id, eventType: "PHARMACY_SALE_INVOICE_CREATED", summary: `Common invoice ${invoice.number} created from Pharmacy sale`, actorUserId, toStatus: "DRAFT", metadataJson: { pharmacySaleId: current.id } });
      await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseSalesInvoice", targetEntityId: invoice.id });
      return { extension, invoice };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...result, idempotent: false };
  } catch (error) {
    const ambiguous = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await failSectorSync({ organizationId, syncStateId: sync.id, status: ambiguous ? "AMBIGUOUS" : "FAILED", errorCode: ambiguous ? "PHARMACY_INVOICE_MAPPING_AMBIGUOUS" : "PHARMACY_INVOICE_MAPPING_FAILED", requiresManualAction: ambiguous });
    throw error;
  }
}

export async function convergePharmacyPayment(
  organizationId: string,
  pharmacyPaymentId: string,
  actorUserId: string,
  input: { financialAccountId: string },
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) await requirePharmacyFinanceFlag(organizationId);
  const existing = await prisma.pharmacyPaymentExtension.findFirst({ where: { organizationId, pharmacyPaymentId } });
  if (existing) return { extension: existing, payment: await prisma.enterprisePayment.findUniqueOrThrow({ where: { id: existing.paymentId } }), idempotent: true };
  const source = await prisma.pharmacyPayment.findFirst({ where: { id: pharmacyPaymentId, organizationId }, include: { sale: true } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_PAYMENT_NOT_FOUND", 404);
  if (["CANCELLED", "REVERSED"].includes(source.status)) throw new EnterpriseSectorConvergenceError("PHARMACY_PAYMENT_NOT_CONVERGIBLE", 409);
  const saleMapping = source.saleId ? await prisma.pharmacySalesExtension.findFirst({ where: { organizationId, pharmacySaleId: source.saleId } }) : null;
  if (!saleMapping) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_INVOICE_MAPPING_REQUIRED", 409);
  const commonInvoice = await prisma.enterpriseSalesInvoice.findFirst({ where: { id: saleMapping.salesInvoiceId, organizationId }, include: { receivable: true } });
  if (!commonInvoice) throw new EnterpriseSectorConvergenceError("COMMON_INVOICE_NOT_FOUND", 404);
  const idempotencyKey = sectorIdempotencyKey({ organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyPayment", sourceEntityId: source.id, eventType: "PHARMACY_CUSTOMER_PAYMENT_CONFIRMED" });
  let payment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey } });
  if (!payment) {
    payment = await createEnterprisePayment(organizationId, actorUserId, {
      direction: "INBOUND",
      paymentType: "CUSTOMER_PAYMENT",
      methodType: paymentMethod(source.paymentMethod),
      financialAccountId: input.financialAccountId,
      businessPartyId: saleMapping.businessPartyId,
      currencyCode: source.currency,
      amount: source.amount.toFixed(),
      paymentDate: source.paymentDate,
      reference: source.paymentReference || source.paymentNumber,
      maskedExternalReference: source.paymentReference?.slice(-12),
      idempotencyKey,
    });
  }
  const extension = await prisma.$transaction(async (tx) => {
    const mapped = await tx.pharmacyPaymentExtension.findFirst({ where: { organizationId, pharmacyPaymentId: source.id } });
    if (mapped) return mapped;
    const created = await tx.pharmacyPaymentExtension.create({ data: { organizationId, pharmacyPaymentId: source.id, paymentId: payment!.id, pharmacySaleId: source.saleId, pharmacyInvoiceId: source.invoiceId } });
    const sync = await beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyPayment", sourceEntityId: source.id, eventType: "PHARMACY_CUSTOMER_PAYMENT_CONFIRMED" }, { commonInvoiceId: commonInvoice.id });
    await completeSectorSync(tx, sync.id, { targetEntityType: "EnterprisePayment", targetEntityId: payment!.id });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { extension, payment, receivableId: commonInvoice.receivable?.id || null, idempotent: false };
}

export async function convergePharmacyCashSession(
  organizationId: string,
  pharmacyCashSessionId: string,
  actorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) {
    const enabled = await isSectorConvergenceEnabled({ organizationId, sector: "PHARMACY", domainCode: "CASH", flag: SECTOR_CONVERGENCE_FLAGS.PHARMACY_CASH });
    if (!enabled) throw new EnterpriseSectorConvergenceError("PHARMACY_CASH_CONVERGENCE_DISABLED", 409);
  }
  const existing = await prisma.pharmacyCashExtension.findFirst({ where: { organizationId, pharmacyCashSessionId } });
  if (existing) return { extension: existing, idempotent: true };
  const source = await prisma.pharmacyCashSession.findFirst({ where: { id: pharmacyCashSessionId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_CASH_SESSION_NOT_FOUND", 404);
  if (!source.financialAccountId) {
    const sync = await prisma.$transaction((tx) => beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyCashSession", sourceEntityId: source.id }, { cashSessionNumber: source.cashSessionNumber }));
    await failSectorSync({ organizationId, syncStateId: sync.id, status: "LEGACY_UNMAPPED", errorCode: "FINANCIAL_ACCOUNT_REQUIRED", requiresManualAction: true });
    throw new EnterpriseSectorConvergenceError("PHARMACY_CASH_FINANCIAL_ACCOUNT_REQUIRED", 409);
  }
  const account = await prisma.enterpriseFinancialAccount.findFirst({ where: { id: source.financialAccountId, organizationId, accountType: "CASH", status: "ACTIVE", archivedAt: null } });
  if (!account || account.currencyCode !== source.currency) throw new EnterpriseSectorConvergenceError("PHARMACY_CASH_FINANCIAL_ACCOUNT_INVALID", 409);
  const result = await prisma.$transaction(async (tx) => {
    const mapped = await tx.pharmacyCashExtension.findFirst({ where: { organizationId, pharmacyCashSessionId: source.id } });
    if (mapped) return { extension: mapped, cashSession: await tx.enterpriseCashSession.findUniqueOrThrow({ where: { id: mapped.cashSessionId } }) };
    const cashSession = await tx.enterpriseCashSession.create({
      data: {
        organizationId,
        number: `PHCASH-${source.cashSessionNumber}`.slice(0, 120),
        financialAccountId: account.id,
        cashierUserId: source.cashierId,
        status: source.status === "OPEN" ? "OPEN" : source.status === "SUBMITTED" ? "PENDING_VALIDATION" : source.status === "VALIDATED" || source.status === "CLOSED" ? "CLOSED" : "REJECTED",
        openedAt: source.openedAt,
        openingAmount: source.openingAmount,
        expectedClosingAmount: source.theoreticalCashAmount,
        countedClosingAmount: source.countedCashAmount,
        discrepancyAmount: source.varianceAmount,
        submittedAt: source.submittedAt,
        validatedByUserId: source.validatedById,
        validatedAt: source.validatedAt,
        rejectedAt: source.rejectedAt,
        closingReason: source.varianceJustification,
      },
    });
    const extension = await tx.pharmacyCashExtension.create({ data: { organizationId, pharmacyCashSessionId: source.id, cashSessionId: cashSession.id } });
    const sync = await beginSectorSync(tx, { organizationId, sector: "PHARMACY", sourceEntityType: "PharmacyCashSession", sourceEntityId: source.id });
    await completeSectorSync(tx, sync.id, { targetEntityType: "EnterpriseCashSession", targetEntityId: cashSession.id });
    return { extension, cashSession };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ...result, idempotent: false };
}
