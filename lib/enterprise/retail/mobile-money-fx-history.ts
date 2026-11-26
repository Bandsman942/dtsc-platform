import { Prisma } from "@prisma/client";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";

// A conversion can disclose two wallets. A scoped reader must be allowed
// to see both; unassigned/shared wallets are not silently attributed to a shop.
export async function mobileMoneyFxReadScope(tx: Prisma.TransactionClient, organizationId: string, userId: string): Promise<Prisma.EnterpriseMobileMoneyFxTransferWhereInput> {
  const sites = await retailFinanceReadSiteScope(organizationId, userId, "VIEW_SALES", tx);
  if (sites === null) return { organizationId };
  const accounts = await tx.enterpriseFinancialAccount.findMany({
    where: { organizationId, accountType: "MOBILE_MONEY", siteId: { in: sites } },
    select: { id: true },
  });
  const ids = accounts.map(account => account.id);
  return { organizationId, sourceFloatAccountId: { in: ids }, targetFloatAccountId: { in: ids } };
}

const select = {
  id: true, number: true, providerCode: true, sourceCurrencyCode: true, targetCurrencyCode: true,
  sourceAmount: true, targetAmount: true, exchangeRate: true, exchangeRateDate: true,
  status: true, occurredAt: true, revision: true,
} as const;
const Exact = Prisma.Decimal.clone({ precision: 48 });
type Group = {
  sourceCurrencyCode: string; targetCurrencyCode: string; status: string;
  _sum: { sourceAmount: Prisma.Decimal | null; targetAmount: Prisma.Decimal | null };
  _count: { _all: number };
};

function serialize(groups: Group[]) {
  return groups.map(group => ({
    sourceCurrencyCode: group.sourceCurrencyCode, targetCurrencyCode: group.targetCurrencyCode,
    status: group.status, count: group._count._all,
    sourceAmount: group._sum.sourceAmount?.toFixed() ?? null,
    targetAmount: group._sum.targetAmount?.toFixed() ?? null,
  }));
}

function pageTotals(rows: Array<Pick<Group, "sourceCurrencyCode" | "targetCurrencyCode" | "status"> & { sourceAmount: Prisma.Decimal; targetAmount: Prisma.Decimal }>) {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = JSON.stringify([row.sourceCurrencyCode, row.targetCurrencyCode, row.status]);
    const group = groups.get(key) ?? {
      sourceCurrencyCode: row.sourceCurrencyCode, targetCurrencyCode: row.targetCurrencyCode, status: row.status,
      _sum: { sourceAmount: null, targetAmount: null }, _count: { _all: 0 },
    };
    for (const field of ["sourceAmount", "targetAmount"] as const) {
      group._sum[field] = new Prisma.Decimal(new Exact(group._sum[field] ?? 0).plus(row[field]).toFixed());
    }
    group._count._all++;
    groups.set(key, group);
  }
  return serialize([...groups.values()]);
}

export async function readMobileMoneyFxHistory(tx: Prisma.TransactionClient, input: {
  organizationId: string; userId: string; page: number; pageSize: number;
  search?: string; status?: string; providerCode?: string; from?: Date | null; to?: Date | null;
}) {
  const { organizationId, userId, page, pageSize, search, status, providerCode, from, to } = input;
  const scope = await mobileMoneyFxReadScope(tx, organizationId, userId);
  const where: Prisma.EnterpriseMobileMoneyFxTransferWhereInput = {
    ...scope,
    ...(status ? { status } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { providerCode: { contains: search, mode: "insensitive" } },
      { sourceCurrencyCode: { contains: search, mode: "insensitive" } },
      { targetCurrencyCode: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const summarize = (filter: Prisma.EnterpriseMobileMoneyFxTransferWhereInput) => tx.enterpriseMobileMoneyFxTransfer.groupBy({
    by: ["sourceCurrencyCode", "targetCurrencyCode", "status"], where: filter,
    _sum: { sourceAmount: true, targetAmount: true }, _count: { _all: true },
    orderBy: [{ sourceCurrencyCode: "asc" }, { targetCurrencyCode: "asc" }, { status: "asc" }],
  });
  const general = summarize(scope);
  const filtered = status || providerCode || from || to || search ? summarize(where) : general;
  const [rows, filteredGroups, generalGroups] = await Promise.all([
    tx.enterpriseMobileMoneyFxTransfer.findMany({ where, select, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    filtered, general,
  ]);
  const batches = rows.length ? await tx.enterprisePostingBatch.findMany({
    where: { organizationId, sourceEntityType: "EnterpriseMobileMoneyFxTransfer", sourceEntityId: { in: rows.map(row => row.id) }, postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED" },
    select: { sourceEntityId: true, status: true, errorCode: true },
    orderBy: [{ sourceEntityId: "asc" }, { postingVersion: "desc" }, { updatedAt: "desc" }],
  }) : [];
  const latest = new Map<string, typeof batches[number]>();
  for (const batch of batches) if (!latest.has(batch.sourceEntityId)) latest.set(batch.sourceEntityId, batch);
  const total = filteredGroups.reduce((count, group) => count + group._count._all, 0);
  return {
    items: rows.map(row => {
      const batch = latest.get(row.id);
      const posted = batch?.status === "COMPLETED";
      return { ...row, sourceAmount: row.sourceAmount.toFixed(), targetAmount: row.targetAmount.toFixed(),
        exchangeRate: row.exchangeRate.toFixed(), accountingStatus: posted ? "POSTED" : "PENDING",
        accountingBlockerCode: posted ? null : batch?.errorCode || "POSTING_PENDING" };
    }),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    fxTotals: { filtered: serialize(filteredGroups), general: serialize(generalGroups), page: pageTotals(rows) },
  };
}
