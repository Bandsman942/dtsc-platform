import { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money, sumDecimals } from "@/lib/enterprise/accounting/helpers";

/** Credit lines MUST originate from immutable invoice snapshots.
 * Never resolve the current tax catalog/rate for an issued invoice's refund.
 */
type Original = {
  id: string; catalogItemId: string | null; description: string;
  quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; netAmount: Prisma.Decimal;
  taxCodeId: string | null; taxRateApplied: Prisma.Decimal | null;
  taxJurisdiction: string | null; taxTemplateVersion: string | null;
  taxAmount: Prisma.Decimal; taxBreakdownJson: Prisma.JsonValue | null;
  taxRecoveryRequested?: boolean;
};
type Previous = {
  sourceInvoiceItemId: string | null; quantity: Prisma.Decimal;
  netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal;
  taxBreakdownJson: Prisma.JsonValue | null;
};
type Request = {
  sourceInvoiceItemId?: string; catalogItemId?: string;
  description: string; quantity: string; unitPrice: string;
};
type TaxSnapshot = {
  taxCodeId: string; rate: string; base: string; amount: string;
  jurisdiction: string | null; treatment: string; templateVersion: string | null;
  evidenceReference: string | null; basisMode: string;
  applicationOrder: number; effectiveAt: string;
};
function originSnapshots(original: Original, effectiveAt: Date): TaxSnapshot[] {
  if (Array.isArray(original.taxBreakdownJson)) {
    return original.taxBreakdownJson.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)
        || typeof row.taxCodeId !== "string" || typeof row.amount !== "string"
        || typeof row.base !== "string" || typeof row.rate !== "string") {
        throw new EnterpriseAccountingError("CREDIT_ORIGINAL_TAX_SNAPSHOT_INVALID", 409);
      }
      return row as TaxSnapshot;
    });
  }
  if (!original.taxCodeId) {
    if (original.taxAmount.gt(0)) throw new EnterpriseAccountingError("CREDIT_HISTORICAL_TAX_ORIGIN_REQUIRED", 409);
    return [];
  }
  // Older single-tax invoice has no per-code breakdown; its aggregate is the
  // only permissible origin. Never substitute today's code rate.
  return [{
    taxCodeId: original.taxCodeId,
    rate: (original.taxRateApplied || (original.netAmount.gt(0)
      ? original.taxAmount.div(original.netAmount) : new Prisma.Decimal(0))).toFixed(8),
    base: original.netAmount.toFixed(6), amount: original.taxAmount.toFixed(6),
    jurisdiction: original.taxJurisdiction, treatment: "STANDARD",
    templateVersion: original.taxTemplateVersion, evidenceReference: null,
    basisMode: "NET", applicationOrder: 0, effectiveAt: effectiveAt.toISOString(),
  }];
}

function priorTaxForCode(credits: Previous[], taxCodeId: string) {
  return sumDecimals(credits.flatMap((credit) => {
    if (!credit.taxBreakdownJson) {
      if (credit.taxAmount.gt(0)) throw new EnterpriseAccountingError("CREDIT_HISTORICAL_UNALLOCATED_TAX", 409);
      return [];
    }
    if (!Array.isArray(credit.taxBreakdownJson)) throw new EnterpriseAccountingError("CREDIT_PRIOR_SNAPSHOT_INVALID", 409);
    return credit.taxBreakdownJson.flatMap((row) => row && typeof row === "object" && !Array.isArray(row)
      && row.taxCodeId === taxCodeId && typeof row.amount === "string" ? [new Prisma.Decimal(row.amount)] : []);
  }));
}

export function allocateHistoricalCreditLines<T extends Original>(
  originalLines: T[],
  previousCredits: Previous[],
  requestLines: Request[],
  creditDate: Date,
) {
  // Legacy unlinked credits cannot be silently attributed to an arbitrary line.
  if (previousCredits.some((row) => !row.sourceInvoiceItemId)) {
    throw new EnterpriseAccountingError("CREDIT_PRIOR_LINE_ALLOCATION_REQUIRED", 409);
  }
  const allocatedIds = new Set<string>();
  return requestLines.map((request) => {
    const matches = request.sourceInvoiceItemId
      ? originalLines.filter((original) => original.id === request.sourceInvoiceItemId)
      : originalLines.filter((original) => original.description === request.description
        && original.unitPrice.equals(request.unitPrice)
        && (!request.catalogItemId || original.catalogItemId === request.catalogItemId));
    if (matches.length !== 1) throw new EnterpriseAccountingError("CREDIT_SOURCE_LINE_AMBIGUOUS_OR_MISSING", 409);
    const original = matches[0];
    if (allocatedIds.has(original.id)) throw new EnterpriseAccountingError("CREDIT_SOURCE_LINE_DUPLICATED", 409);
    allocatedIds.add(original.id);
    if (!original.unitPrice.equals(request.unitPrice)) throw new EnterpriseAccountingError("CREDIT_SOURCE_PRICE_CHANGED", 409);
    if (request.catalogItemId && request.catalogItemId !== original.catalogItemId) throw new EnterpriseAccountingError("CREDIT_SOURCE_CATALOG_CHANGED", 409);
    const quantity = new Prisma.Decimal(request.quantity);
    const prior = previousCredits.filter((item) => item.sourceInvoiceItemId === original.id);
    const priorQuantity = sumDecimals(prior.map((item) => item.quantity));
    const remaining = original.quantity.minus(priorQuantity);
    if (!quantity.gt(0) || quantity.gt(remaining) || remaining.isNegative()) {
      throw new EnterpriseAccountingError("CREDIT_QUANTITY_EXCEEDS_ORIGINAL", 409);
    }
    const finalQuantity = quantity.eq(remaining);
    const priorNet = sumDecimals(prior.map((item) => item.netAmount));
    const netAmount = finalQuantity
      ? money(original.netAmount.minus(priorNet))
      : money(original.netAmount.times(quantity).div(original.quantity));
    if (netAmount.isNegative()) throw new EnterpriseAccountingError("CREDIT_NET_EXCEEDS_ORIGINAL", 409);
    const taxSnapshots = originSnapshots(original, creditDate);
    const taxBreakdown = taxSnapshots.map((origin) => {
      const priorCodeAmount = priorTaxForCode(prior, origin.taxCodeId);
      const originalTax = new Prisma.Decimal(origin.amount);
      const originalBase = new Prisma.Decimal(origin.base);
      const amount = finalQuantity ? money(originalTax.minus(priorCodeAmount))
        : money(originalTax.times(quantity).div(original.quantity));
      const base = money(originalBase.times(quantity).div(original.quantity));
      if (amount.isNegative()) throw new EnterpriseAccountingError("CREDIT_TAX_EXCEEDS_ORIGINAL", 409);
      return { ...origin, amount: amount.toFixed(6), base: base.toFixed(6), effectiveAt: creditDate.toISOString() };
    });
    const taxAmount = money(sumDecimals(taxBreakdown.map((row) => row.amount)));
    const priorTax = sumDecimals(prior.map((item) => item.taxAmount));
    if (taxAmount.plus(priorTax).gt(original.taxAmount.plus("0.000001"))) {
      throw new EnterpriseAccountingError("CREDIT_TAX_EXCEEDS_ORIGINAL", 409);
    }
    return {
      sourceInvoiceItemId: original.id, catalogItemId: original.catalogItemId,
      description: original.description, quantity, unitPrice: original.unitPrice,
      netAmount, taxAmount, taxBreakdown,
      taxRecoveryRequested: original.taxRecoveryRequested === true,
      totalAmount: money(netAmount.plus(taxAmount)),
    };
  });
}
