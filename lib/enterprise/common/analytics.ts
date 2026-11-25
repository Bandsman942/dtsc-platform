import { Prisma } from "@prisma/client";

export type MonetaryMetric = "debit" | "credit" | "original" | "outstanding" | "inbound" | "outbound" | "invoiceTotal" | "paid" | "credited" | "creditTotal" | "tax" | "subtotal" | "discount" | "total";
export type MonetaryTotal = { currencyCode: string; metric: MonetaryMetric; amount: string; status?: string };
export type MonetaryScopes = { filteredTotals: MonetaryTotal[]; generalTotals: MonetaryTotal[]; pageTotals: MonetaryTotal[] };

type CommercialAmounts = { subtotalAmount?: Prisma.Decimal | null; discountAmount?: Prisma.Decimal | null; taxAmount?: Prisma.Decimal | null; totalAmount?: Prisma.Decimal | null };
export type CommercialAmountGroup = { currency: string; status: string; _sum: CommercialAmounts; _count?: { _all: number } };
const fields = [
  ["subtotalAmount", "subtotal"], ["discountAmount", "discount"], ["taxAmount", "tax"], ["totalAmount", "total"],
] as const;
const ExactAmount = Prisma.Decimal.clone({ precision: 48 });

/** Serialize server aggregates without rounding, inventing a currency or
 * equating an unknown amount with zero. Statuses remain separate (e.g. cancelled).
 */
export function commercialAmountTotals(groups: CommercialAmountGroup[]): MonetaryTotal[] {
  return groups.flatMap(group => fields.flatMap(([field, metric]) => {
    const amount = group._sum[field];
    return amount == null ? [] : [{ currencyCode: group.currency, status: group.status, metric, amount: amount.toFixed() }];
  }));
}

/** Page-only values are labelled separately and never substituted for the
 * filtered server aggregate. Input is already authorized and paginated.
 */
export function commercialPageTotals(rows: Array<CommercialAmounts & { currency: string; status: string }>): MonetaryTotal[] {
  const grouped = new Map<string, CommercialAmountGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.currency, row.status]);
    const group = grouped.get(key) || { currency: row.currency, status: row.status, _sum: {} };
    for (const [field] of fields) {
      if (row[field] != null) group._sum[field] = new Prisma.Decimal(new ExactAmount(group._sum[field] || 0).plus(row[field]!).toFixed());
    }
    grouped.set(key, group);
  }
  return commercialAmountTotals([...grouped.values()]);
}

export function commercialStatusCount(groups: CommercialAmountGroup[], statuses: readonly string[]): number {
  return groups.reduce((count, group) => count + (statuses.includes(group.status) ? group._count?._all || 0 : 0), 0);
}
