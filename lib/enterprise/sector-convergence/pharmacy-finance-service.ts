import { Prisma } from "@prisma/client";
import { financeReference, money, publishFinanceEvent, sumDecimals } from "@/lib/enterprise/accounting/helpers";
import { createEnterprisePayment, transitionEnterprisePayment } from "@/lib/enterprise/accounting/payments-service";
import {
  confirmCustomerRefundPayment,
  prepareSalesCreditNoteForRefundAmount,
  reverseCustomerPaymentAllocationsForRefundAmount,
} from "@/lib/enterprise/accounting/customer-refund-service";
import { approveAndPostSalesCreditNote } from "@/lib/enterprise/accounting/receivables-service";
import { postApprovedSalesCreditNote } from "@/lib/enterprise/accounting/accounting-document-approval-orchestration";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { EnterpriseSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { isSectorConvergenceEnabled, SECTOR_CONVERGENCE_FLAGS } from "@/lib/enterprise/sector-convergence/flags";
import { beginSectorSync, completeSectorSync, failSectorSync, sectorIdempotencyKey } from "@/lib/enterprise/sector-convergence/sync-service";

async function requireRefundFinanceCapabilities(
  organizationId: string,
  userId: string,
  requirements: { payments?: Array<"canCreate" | "canSubmit" | "canWrite" | "canApprove">; receivables?: Array<"canCreate" | "canSubmit" | "canWrite" | "canApprove" | "canManage"> },
) {
  await ensureCanonicalFinanceModulesForOrganization({ organizationId });
  const [payments, receivables] = await Promise.all([
    requirements.payments?.length
      ? resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "FINANCE_PAYMENTS" })
      : null,
    requirements.receivables?.length
      ? resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: "FINANCE_RECEIVABLES" })
      : null,
  ]);
  const paymentDenied = requirements.payments?.some((key) => !payments?.[key]);
  const receivableDenied = requirements.receivables?.some((key) => !receivables?.[key]);
  if (paymentDenied || receivableDenied) {
    throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_FINANCE_PERMISSION_REQUIRED", 403, {
      payments: requirements.payments || [],
      receivables: requirements.receivables || [],
    });
  }
}

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
      roles: { create: { roleCode: "CUSTOMER", createdByUserId: actorUserId } },
      contacts: sale.customerPhone ? { create: { contactType: "PHONE", label: "Paiement", value: sale.customerPhone, normalizedValue: sale.customerPhone.trim().toLowerCase(), isPrimary: true, createdByUserId: actorUserId } } : undefined,
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
  const catalogItems = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: productMappings.map((item) => item.catalogItemId) }, archivedAt: null },
    select: { id: true, name: true },
  });
  const catalogNameById = new Map(catalogItems.map((item) => [item.id, item.name]));
  const missing = sale.lines.filter((line) => {
    const catalogItemId = catalogByProduct.get(line.productId);
    return !catalogItemId || !catalogNameById.has(catalogItemId);
  });
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
      const invoiceItems: Prisma.EnterpriseSalesInvoiceItemCreateWithoutSalesInvoiceInput[] = current.lines.map((line) => ({
        catalogItemId: catalogByProduct.get(line.productId),
        description: catalogNameById.get(catalogByProduct.get(line.productId)!)!,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: money(line.quantity.times(line.unitPrice).minus(line.totalLine).greaterThan(0) ? line.quantity.times(line.unitPrice).minus(line.totalLine) : 0),
        netAmount: money(line.totalLine),
        taxAmount: money(0),
        totalAmount: money(line.totalLine),
      }));
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
          items: { create: invoiceItems },
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


async function markPharmacyRefundUnmapped(
  organizationId: string,
  syncStateId: string,
  code: string,
  details?: Record<string, unknown>,
): Promise<never> {
  await failSectorSync({
    organizationId,
    syncStateId,
    status: "LEGACY_UNMAPPED",
    errorCode: code,
    errorMessage: details ? JSON.stringify(details).slice(0, 1000) : undefined,
    requiresManualAction: true,
  });
  throw new EnterpriseSectorConvergenceError(code, 409, details);
}

async function resolvePharmacyRefundSourcePayment(
  organizationId: string,
  source: { saleId: string; paymentId: string | null },
  syncStateId: string,
) {
  if (source.paymentId) {
    const payment = await prisma.pharmacyPayment.findFirst({
      where: { id: source.paymentId, organizationId, saleId: source.saleId, status: { in: ["PAID", "VALIDATED"] } },
    });
    if (!payment) return markPharmacyRefundUnmapped(organizationId, syncStateId, "PHARMACY_REFUND_SOURCE_PAYMENT_NOT_FOUND");
    return payment;
  }

  const candidates = await prisma.pharmacyPayment.findMany({
    where: { organizationId, saleId: source.saleId, status: { in: ["PAID", "VALIDATED"] } },
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    take: 2,
  });
  if (candidates.length !== 1) {
    return markPharmacyRefundUnmapped(
      organizationId,
      syncStateId,
      candidates.length ? "PHARMACY_REFUND_SOURCE_PAYMENT_AMBIGUOUS" : "PHARMACY_REFUND_SOURCE_PAYMENT_REQUIRED",
      { candidateCount: candidates.length },
    );
  }
  return candidates[0];
}

export async function convergePharmacyRefund(
  organizationId: string,
  pharmacyRefundId: string,
  validatorUserId: string,
  options: { bypassFeatureFlag?: boolean } = {},
) {
  if (!options.bypassFeatureFlag) await requirePharmacyFinanceFlag(organizationId);
  const source = await prisma.pharmacyRefund.findFirst({ where: { id: pharmacyRefundId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_FOUND", 404);

  const sync = await prisma.$transaction((tx) => beginSectorSync(
    tx,
    {
      organizationId,
      sector: "PHARMACY",
      sourceEntityType: "PharmacyRefund",
      sourceEntityId: source.id,
      eventType: "PHARMACY_REFUND_FINANCE_CONVERGENCE",
    },
    { refundNumber: source.refundNumber, saleId: source.saleId, amount: source.amount.toFixed(), currency: source.currency },
  ));

  try {
    const existing = await prisma.pharmacyRefundExtension.findFirst({
      where: { organizationId, pharmacyRefundId: source.id },
    });
    if (existing) {
      const [payment, creditNote] = await Promise.all([
        prisma.enterprisePayment.findFirst({ where: { id: existing.paymentId, organizationId } }),
        existing.salesCreditNoteId
          ? prisma.enterpriseSalesCreditNote.findFirst({ where: { id: existing.salesCreditNoteId, organizationId } })
          : null,
      ]);
      if (!payment) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_PAYMENT_MAPPING_BROKEN", 409);
      return { extension: existing, payment, creditNote, idempotent: true };
    }

    if (!["SUBMITTED", "VALIDATED"].includes(source.status)) {
      if (source.status === "PAID") {
        return markPharmacyRefundUnmapped(
          organizationId,
          sync.id,
          "PHARMACY_REFUND_LEGACY_PAID_UNMAPPED",
          { refundId: source.id, refundNumber: source.refundNumber },
        );
      }
      throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_CONVERGIBLE", 409, { status: source.status });
    }
    if (source.requestedById === validatorUserId) {
      throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_SELF_VALIDATION_FORBIDDEN", 409);
    }
    await requireRefundFinanceCapabilities(organizationId, source.requestedById, {
      payments: ["canCreate", "canSubmit"],
    });
    await requireRefundFinanceCapabilities(organizationId, validatorUserId, {
      payments: ["canApprove"],
      receivables: ["canCreate"],
    });

    const saleMapping = await prisma.pharmacySalesExtension.findFirst({
      where: { organizationId, pharmacySaleId: source.saleId },
    });
    if (!saleMapping) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_SALE_MAPPING_REQUIRED");
    }
    const commonInvoice = await prisma.enterpriseSalesInvoice.findFirst({
      where: { id: saleMapping.salesInvoiceId, organizationId },
      include: { receivable: true },
    });
    if (!commonInvoice?.receivable) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_COMMON_RECEIVABLE_REQUIRED");
    }
    if (commonInvoice.currencyCode !== source.currency) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_CURRENCY_MISMATCH");
    }

    const pharmacyPayment = await resolvePharmacyRefundSourcePayment(organizationId, source, sync.id);
    const sourcePaymentMapping = await prisma.pharmacyPaymentExtension.findFirst({
      where: { organizationId, pharmacyPaymentId: pharmacyPayment.id },
    });
    if (!sourcePaymentMapping) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_PAYMENT_MAPPING_REQUIRED");
    }
    const originalPayment = await prisma.enterprisePayment.findFirst({
      where: {
        id: sourcePaymentMapping.paymentId,
        organizationId,
        direction: "INBOUND",
        paymentType: "CUSTOMER_PAYMENT",
        status: { in: ["CONFIRMED", "RECONCILED"] },
      },
    });
    if (!originalPayment?.financialAccountId) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_COMMON_PAYMENT_INVALID");
    }
    if (originalPayment.currencyCode !== source.currency || originalPayment.businessPartyId !== saleMapping.businessPartyId) {
      return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_COMMON_PAYMENT_SCOPE_MISMATCH");
    }

    let commonCashSessionId: string | null = null;
    if (originalPayment.methodType === "CASH") {
      const pharmacyCashSessionId = source.cashSessionId || pharmacyPayment.cashSessionId;
      if (!pharmacyCashSessionId) {
        return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_CASH_SESSION_REQUIRED");
      }
      const cashMapping = await prisma.pharmacyCashExtension.findFirst({
        where: { organizationId, pharmacyCashSessionId },
      });
      if (!cashMapping) {
        return markPharmacyRefundUnmapped(organizationId, sync.id, "PHARMACY_REFUND_CASH_MAPPING_REQUIRED");
      }
      const commonCash = await prisma.enterpriseCashSession.findFirst({
        where: {
          id: cashMapping.cashSessionId,
          organizationId,
          financialAccountId: originalPayment.financialAccountId,
          cashierUserId: source.requestedById,
          status: "OPEN",
        },
      });
      if (!commonCash) {
        throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_COMMON_CASH_SESSION_NOT_OPEN", 409);
      }
      commonCashSessionId = commonCash.id;
    }

    const paymentKey = sectorIdempotencyKey({
      organizationId,
      sector: "PHARMACY",
      sourceEntityType: "PharmacyRefund",
      sourceEntityId: source.id,
      eventType: "PHARMACY_REFUND_PAYMENT",
    });
    let refundPayment = await prisma.enterprisePayment.findFirst({ where: { organizationId, idempotencyKey: paymentKey } });
    if (!refundPayment) {
      refundPayment = await createEnterprisePayment(organizationId, source.requestedById, {
        direction: "OUTBOUND",
        paymentType: "REFUND",
        methodType: originalPayment.methodType as "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "CHEQUE" | "OTHER",
        financialAccountId: originalPayment.financialAccountId,
        cashSessionId: commonCashSessionId,
        businessPartyId: saleMapping.businessPartyId,
        currencyCode: source.currency as "USD" | "CDF" | "EUR",
        amount: source.amount.toFixed(),
        paymentDate: source.createdAt,
        reference: source.refundNumber,
        idempotencyKey: paymentKey,
      });
    }
    if (refundPayment.status === "DRAFT") {
      refundPayment = await transitionEnterprisePayment(
        organizationId,
        refundPayment.id,
        source.requestedById,
        { action: "SUBMIT", revision: refundPayment.revision, reason: source.reason },
      );
    }
    if (refundPayment.status === "PENDING_APPROVAL") {
      refundPayment = await transitionEnterprisePayment(
        organizationId,
        refundPayment.id,
        validatorUserId,
        { action: "APPROVE", revision: refundPayment.revision, reason: source.reason },
      );
    }
    if (!["APPROVED", "CONFIRMED", "RECONCILED"].includes(refundPayment.status)) {
      throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_COMMON_PAYMENT_NOT_APPROVED", 409, { status: refundPayment.status });
    }

    const creditReason = `Pharmacy refund ${source.refundNumber}: ${source.reason}`.slice(0, 1000);
    const creditNote = await prepareSalesCreditNoteForRefundAmount(
      organizationId,
      commonInvoice.id,
      validatorUserId,
      creditReason,
      source.amount,
    );

    const result = await prisma.$transaction(async (tx) => {
      const mapped = await tx.pharmacyRefundExtension.findFirst({
        where: { organizationId, pharmacyRefundId: source.id },
      });
      if (mapped) return mapped;
      const extension = await tx.pharmacyRefundExtension.create({
        data: {
          organizationId,
          pharmacyRefundId: source.id,
          pharmacySaleId: source.saleId,
          paymentId: refundPayment!.id,
          salesCreditNoteId: creditNote.id,
          cutoverAt: new Date(),
        },
      });
      const entityLink = await tx.enterpriseEntityLink.findFirst({
        where: {
          organizationId,
          sourceModule: "PHARMACY_CASH",
          sourceEntityType: "PharmacyRefund",
          sourceEntityId: source.id,
          targetModule: "FINANCE_PAYMENTS",
          targetEntityType: "EnterprisePayment",
          targetEntityId: refundPayment!.id,
          linkType: "SECTOR_CONVERGENCE",
        },
      });
      if (!entityLink) {
        await tx.enterpriseEntityLink.create({
          data: {
            organizationId,
            sourceModule: "PHARMACY_CASH",
            sourceEntityType: "PharmacyRefund",
            sourceEntityId: source.id,
            targetModule: "FINANCE_PAYMENTS",
            targetEntityType: "EnterprisePayment",
            targetEntityId: refundPayment!.id,
            linkType: "SECTOR_CONVERGENCE",
            createdById: validatorUserId,
          },
        });
      }
      await completeSectorSync(tx, sync.id, {
        targetEntityType: "EnterprisePayment",
        targetEntityId: refundPayment!.id,
        metadataJson: { salesCreditNoteId: creditNote.id, sourcePaymentId: originalPayment.id },
      });
      return extension;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { extension: result, payment: refundPayment, creditNote, idempotent: false };
  } catch (error) {
    const state = await prisma.enterpriseSectorSyncState.findFirst({
      where: { id: sync.id, organizationId },
      select: { status: true },
    });
    if (state && !["LEGACY_UNMAPPED", "AMBIGUOUS"].includes(state.status)) {
      await failSectorSync({
        organizationId,
        syncStateId: sync.id,
        errorCode: error instanceof EnterpriseSectorConvergenceError ? error.code : "PHARMACY_REFUND_CONVERGENCE_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown Pharmacy refund convergence error",
      });
    }
    throw error;
  }
}

export async function settlePharmacyRefund(
  organizationId: string,
  pharmacyRefundId: string,
  actorUserId: string,
) {
  const source = await prisma.pharmacyRefund.findFirst({ where: { id: pharmacyRefundId, organizationId } });
  if (!source) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_FOUND", 404);
  const extension = await prisma.pharmacyRefundExtension.findFirst({
    where: { organizationId, pharmacyRefundId: source.id },
  });
  if (!extension) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_FINANCE_MAPPING_REQUIRED", 409);
  const refundPayment = await prisma.enterprisePayment.findFirst({
    where: { id: extension.paymentId, organizationId },
  });
  if (!refundPayment) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_PAYMENT_MAPPING_BROKEN", 409);
  if (source.status === "PAID") {
    if (!["CONFIRMED", "RECONCILED"].includes(refundPayment.status)) {
      throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_PAID_WITHOUT_COMMON_SETTLEMENT", 409);
    }
    return { refund: source, payment: refundPayment, idempotent: true };
  }
  if (source.status !== "VALIDATED") {
    throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_VALIDATED", 409, { status: source.status });
  }
  if (source.requestedById === actorUserId || source.validatedById === actorUserId) {
    throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_SELF_SETTLEMENT_FORBIDDEN", 409);
  }
  await requireRefundFinanceCapabilities(organizationId, actorUserId, {
    payments: ["canWrite"],
    receivables: ["canApprove"],
  });

  const saleMapping = await prisma.pharmacySalesExtension.findFirst({
    where: { organizationId, pharmacySaleId: source.saleId },
  });
  if (!saleMapping) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_SALE_MAPPING_REQUIRED", 409);
  const commonInvoice = await prisma.enterpriseSalesInvoice.findFirst({
    where: { id: saleMapping.salesInvoiceId, organizationId },
    include: { receivable: true },
  });
  if (!commonInvoice?.receivable) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_COMMON_RECEIVABLE_REQUIRED", 409);

  const pharmacyPayment = source.paymentId
    ? await prisma.pharmacyPayment.findFirst({ where: { id: source.paymentId, organizationId, saleId: source.saleId } })
    : null;
  const sourcePaymentMapping = pharmacyPayment
    ? await prisma.pharmacyPaymentExtension.findFirst({ where: { organizationId, pharmacyPaymentId: pharmacyPayment.id } })
    : null;

  if (refundPayment.status === "APPROVED") {
    await reverseCustomerPaymentAllocationsForRefundAmount(
      organizationId,
      commonInvoice.receivable.id,
      refundPayment.id,
      actorUserId,
      source.reason,
      source.amount,
      sourcePaymentMapping?.paymentId || null,
    );
  } else if (!["CONFIRMED", "RECONCILED"].includes(refundPayment.status)) {
    throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_COMMON_PAYMENT_NOT_APPROVED", 409, { status: refundPayment.status });
  }

  if (extension.salesCreditNoteId) {
    let credit = await prisma.enterpriseSalesCreditNote.findFirst({
      where: { id: extension.salesCreditNoteId, organizationId },
    });
    if (!credit) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_CREDIT_NOTE_MAPPING_BROKEN", 409);
    if (credit.status === "DRAFT") {
      credit = await approveAndPostSalesCreditNote(organizationId, credit.id, actorUserId, credit.revision);
    } else if (credit.status === "APPROVED") {
      credit = await postApprovedSalesCreditNote(organizationId, credit.id, actorUserId, credit.revision);
    }
    if (credit.status !== "POSTED") {
      throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_CREDIT_NOTE_NOT_POSTED", 409, { status: credit.status });
    }
  }

  let confirmedPayment = await prisma.enterprisePayment.findFirst({ where: { id: refundPayment.id, organizationId } });
  if (!confirmedPayment) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_PAYMENT_MAPPING_BROKEN", 409);
  if (confirmedPayment.status === "APPROVED") {
    confirmedPayment = await confirmCustomerRefundPayment(
      organizationId,
      confirmedPayment.id,
      actorUserId,
      { revision: confirmedPayment.revision, reason: source.reason },
    );
  }
  if (!["CONFIRMED", "RECONCILED"].includes(confirmedPayment.status)) {
    throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_COMMON_PAYMENT_NOT_CONFIRMED", 409, { status: confirmedPayment.status });
  }

  const refund = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "PharmacyRefund" WHERE id = ${source.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const current = await tx.pharmacyRefund.findFirst({ where: { id: source.id, organizationId } });
    if (!current) throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_FOUND", 404);
    if (current.status === "PAID") return current;
    if (current.status !== "VALIDATED") throw new EnterpriseSectorConvergenceError("PHARMACY_REFUND_NOT_VALIDATED", 409);

    const sale = await tx.pharmacySale.findFirst({ where: { id: current.saleId, organizationId } });
    if (!sale) throw new EnterpriseSectorConvergenceError("PHARMACY_SALE_NOT_FOUND", 404);
    const refundedAmount = money((sale.refundedAmount || new Prisma.Decimal(0)).plus(current.amount));
    await tx.pharmacySale.update({
      where: { id: sale.id },
      data: {
        refundedAmount,
        status: refundedAmount.greaterThanOrEqualTo(sale.paidAmount) ? "REFUNDED" : sale.status,
        updatedById: actorUserId,
      },
    });
    return tx.pharmacyRefund.update({
      where: { id: current.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { refund, payment: confirmedPayment, idempotent: false };
}
