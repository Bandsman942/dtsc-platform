import { Prisma } from "@prisma/client";
import type { MonetaryTotal } from "@/lib/enterprise/common/analytics";

export const telcoHistoryFields = { saleAmount: true, operatorCost: true, marginAmount: true } as const;
const metrics = [["saleAmount", "telcoSale"], ["operatorCost", "telcoCost"], ["marginAmount", "telcoMargin"]] as const;
const ExactAmount = Prisma.Decimal.clone({ precision: 48 });
type Amounts = Record<keyof typeof telcoHistoryFields, Prisma.Decimal | null>;
type Group = { currencyCode: string; status: string; _sum: Amounts };

export function telcoHistoryTotals(groups: Group[]): MonetaryTotal[] {
  return groups.flatMap(({ currencyCode, status, _sum }) => metrics.flatMap(([field, metric]) => {
    const amount = _sum[field];
    return amount == null ? [] : [{ currencyCode, status, metric, amount: amount.toFixed() }];
  }));
}

export function telcoHistoryPageTotals(rows: (Amounts & Pick<Group, "currencyCode" | "status">)[]) {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = JSON.stringify([row.currencyCode, row.status]);
    const group = groups.get(key) ?? {
      currencyCode: row.currencyCode, status: row.status,
      _sum: { saleAmount: null, operatorCost: null, marginAmount: null },
    };
    for (const [field] of metrics) {
      if (row[field] != null) group._sum[field] = new ExactAmount(group._sum[field] ?? 0).plus(row[field]);
    }
    groups.set(key, group);
  }
  return telcoHistoryTotals([...groups.values()]);
}
